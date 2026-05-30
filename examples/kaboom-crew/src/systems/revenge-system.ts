// S211 KABOOM-REVENGE (GDP-2026-05-30-002 V1). Dead bombers keep
// participating: the moment BomberStats.alive flips false, we stamp
// a RevengeState on the bomber with a fixed budget of bombs + a
// cooldown timer. The bomber (human or bot) can fire a
// RevengeBombRequest naming a target cell; this system validates +
// spawns a bomb at the target cell, owned by the dead bomber (kill
// credit goes back to them). Bot AI auto-fires on the alive opponent
// closest to it; humans drive it via UI / probe in V1.
//
// V1 scope (the full GDP also covers an arc animation, mouse input
// path, ghost camera, and the multiplayer protocol message). This
// commit ships the ECS half — schema + spawn + cooldown + bot AI —
// so the feature works end-to-end inside a round and survives
// round restarts. Mouse + camera polish lands in a follow-up.
//
// Schema additions live in scene-extensions.schema.json:
//   RevengeState        — { bombsRemaining, cooldownRemainingS? }
//   RevengeBombRequest  — { targetGx, targetGz } transient

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import { getCellHeight } from "../../../../engine/grid/height-query";

import { BOMB_FINAL_SCALE } from "./bomb-placement-system";

const BOMBER_STATS: ComponentName = "BomberStats";
const REVENGE_STATE: ComponentName = "RevengeState";
const REVENGE_BOMB_REQUEST: ComponentName = "RevengeBombRequest";
const ROUND_STATE: ComponentName = "RoundState";
const GRID_POSITION: ComponentName = "GridPosition";
const BOMB: ComponentName = "Bomb";
const TRANSFORM: ComponentName = "Transform";
const MESH_RENDERER: ComponentName = "MeshRenderer";
const GRID_OCCUPANT: ComponentName = "GridOccupant";
const TWEENS: ComponentName = "Tweens";
const RIGID_BODY_3D: ComponentName = "RigidBody3D";
const COLLIDER_3D: ComponentName = "Collider3D";
const BOT_BRAIN: ComponentName = "BotBrain";

const ROUND_STATE_ID = "kaboom.round-state";

/** Default per-round revenge bomb budget. */
export const REVENGE_BUDGET_DEFAULT = 5;
/** Default cooldown between successive revenge launches, in seconds. */
export const REVENGE_COOLDOWN_S_DEFAULT = 5;
/** Bot-side cooldown is intentionally longer than the human's so a
 *  player drop-in always has a small reaction edge. */
export const REVENGE_BOT_COOLDOWN_S_DEFAULT = 6;
/** Range of the revenge bomb (matches a baseline-stat alive bomber). */
export const REVENGE_BOMB_RANGE_DEFAULT = 2;
/** Fuse on a revenge bomb — same as a normal placed bomb. */
export const REVENGE_BOMB_FUSE_S_DEFAULT = 2.5;
/** Bomb spawn-pop tween duration; copies the bomb-placement constant
 *  so the visual matches. */
const SPAWN_POP_DURATION_S = 0.2;

type BomberStatsRead = { alive?: boolean };
type RevengeStateRead = { bombsRemaining?: number; cooldownRemainingS?: number };
type GridPos = { gx: number; gz: number };
type RoundStateRead = { phase?: string; roundNumber?: number };

export type KaboomRevengeSystemOptions = {
  name?: string;
  /** Project seed mixed into the revenge-bomb id counter. */
  seed?: number;
  /** URL `?revenge=off` — disables the whole feature. */
  disabled?: boolean;
  /** URL `?revengeCount=N` — per-round budget per dead bomber. */
  bombsBudget?: number;
  /** URL `?revengeCooldownS=N` — human cooldown between launches. */
  cooldownS?: number;
  /** Override bot cooldown (defaults to REVENGE_BOT_COOLDOWN_S_DEFAULT). */
  botCooldownS?: number;
  /** Override the revenge bomb's blast range. */
  bombRange?: number;
  /** Optional id factory — tests inject deterministic counters. */
  nextBombId?: (owner: EntityId) => EntityId;
};

export function createKaboomRevengeSystem(options: KaboomRevengeSystemOptions = {}): System {
  const name = options.name ?? "kaboom.revenge";
  const disabled = options.disabled === true;
  const bombsBudget = Math.max(0, Math.floor(options.bombsBudget ?? REVENGE_BUDGET_DEFAULT));
  const cooldownS = Math.max(0, options.cooldownS ?? REVENGE_COOLDOWN_S_DEFAULT);
  const botCooldownS = Math.max(0, options.botCooldownS ?? REVENGE_BOT_COOLDOWN_S_DEFAULT);
  const bombRange = Math.max(1, Math.floor(options.bombRange ?? REVENGE_BOMB_RANGE_DEFAULT));
  let counter = 0;
  const nextBombId =
    options.nextBombId ??
    ((owner: EntityId): EntityId => {
      counter += 1;
      return `revenge-bomb.${owner}.${counter}`;
    });

  const prevAlive = new Map<EntityId, boolean>();
  const prevRound = { roundNumber: undefined as number | undefined, phase: undefined as string | undefined };
  let cachedWorld: World | undefined;
  let bombers: QueryHandle | undefined;
  let requests: QueryHandle | undefined;
  let states: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      bombers = world.createQuery([BOMBER_STATS]);
      requests = world.createQuery([REVENGE_BOMB_REQUEST]);
      states = world.createQuery([REVENGE_STATE]);
      cachedWorld = world;
      prevAlive.clear();
      prevRound.roundNumber = undefined;
      prevRound.phase = undefined;
    }
    if (disabled) return;

    const dt = Math.max(0, context.time.fixedDt);

    // 1. Round restart edge — clear all RevengeStates so survivors
    // who died last round get a fresh budget next round.
    const round = world.hasEntity(ROUND_STATE_ID)
      ? world.getComponent<RoundStateRead>(ROUND_STATE_ID, ROUND_STATE)
      : undefined;
    const roundNumber = round?.roundNumber;
    const phase = round?.phase;
    const newRoundStarted =
      roundNumber !== undefined &&
      prevRound.roundNumber !== undefined &&
      roundNumber !== prevRound.roundNumber;
    const justResumedPlaying =
      phase === "playing" && prevRound.phase !== undefined && prevRound.phase !== "playing";
    if (newRoundStarted || justResumedPlaying) {
      for (const id of [...states!.run()]) {
        world.removeComponent(id, REVENGE_STATE);
      }
    }
    prevRound.roundNumber = roundNumber;
    prevRound.phase = phase;

    // 2. Detect alive: true → false transitions; init RevengeState
    // with the per-round budget + cooldown = 0 (first launch is
    // immediate so the survivor is pressured right away).
    const current = new Map<EntityId, boolean>();
    for (const id of bombers!.run()) {
      const stats = world.getComponent<BomberStatsRead>(id, BOMBER_STATS);
      current.set(id, stats?.alive !== false);
    }
    for (const [id, nowAlive] of current) {
      const wasAlive = prevAlive.get(id) ?? true;
      if (wasAlive && !nowAlive && !world.hasComponent(id, REVENGE_STATE)) {
        world.setComponent(id, REVENGE_STATE, {
          bombsRemaining: bombsBudget,
          cooldownRemainingS: 0
        });
      }
    }
    for (const id of prevAlive.keys()) {
      if (!current.has(id)) prevAlive.delete(id);
    }
    for (const [id, alive] of current) prevAlive.set(id, alive);

    // 3. Tick cooldown on every RevengeState.
    for (const id of states!.run()) {
      const rs = world.getComponent<RevengeStateRead>(id, REVENGE_STATE);
      if (rs === undefined) continue;
      const remaining = Math.max(0, (rs.cooldownRemainingS ?? 0) - dt);
      if (remaining !== (rs.cooldownRemainingS ?? 0)) {
        world.setComponent(id, REVENGE_STATE, { ...rs, cooldownRemainingS: remaining });
      }
    }

    // 4. Bot auto-fire: every dead bot with cooldown=0 + budget>0
    // posts a RevengeBombRequest targeting the alive bomber nearest
    // to the BOT'S last grid position (death cell).
    for (const id of states!.run()) {
      if (!world.hasComponent(id, BOT_BRAIN)) continue;
      if (world.hasComponent(id, REVENGE_BOMB_REQUEST)) continue;
      const rs = world.getComponent<RevengeStateRead>(id, REVENGE_STATE);
      if (rs === undefined) continue;
      if ((rs.cooldownRemainingS ?? 0) > 0) continue;
      if ((rs.bombsRemaining ?? 0) <= 0) continue;
      const myPos = world.getComponent<GridPos>(id, GRID_POSITION);
      if (myPos === undefined) continue;
      const target = nearestAliveBomberCell(world, id);
      if (target === undefined) continue;
      world.setComponent(id, REVENGE_BOMB_REQUEST, {
        targetGx: target.gx,
        targetGz: target.gz
      });
    }

    // 5. Consume RevengeBombRequest entities — validate + spawn.
    for (const id of [...requests!.run()]) {
      const req = world.getComponent<{ targetGx?: number; targetGz?: number }>(id, REVENGE_BOMB_REQUEST);
      // Always clear the request — refused or honoured.
      world.removeComponent(id, REVENGE_BOMB_REQUEST);
      if (req === undefined || req.targetGx === undefined || req.targetGz === undefined) continue;
      const rs = world.getComponent<RevengeStateRead>(id, REVENGE_STATE);
      if (rs === undefined) continue;
      if ((rs.cooldownRemainingS ?? 0) > 0) continue;
      if ((rs.bombsRemaining ?? 0) <= 0) continue;
      spawnRevengeBomb(world, id, req.targetGx, req.targetGz, bombRange, nextBombId);
      const isBot = world.hasComponent(id, BOT_BRAIN);
      world.setComponent(id, REVENGE_STATE, {
        bombsRemaining: (rs.bombsRemaining ?? 0) - 1,
        cooldownRemainingS: isBot ? botCooldownS : cooldownS
      });
    }
  };

  return { name, fixedUpdate };
}

/** Pure helper — nearest alive bomber other than `selfId`, by manhattan
 *  distance from `selfId`'s GridPosition. Returns undefined when no
 *  other bomber is alive. Exported for unit tests. */
export function nearestAliveBomberCell(
  world: World,
  selfId: EntityId
): { gx: number; gz: number } | undefined {
  const selfPos = world.getComponent<GridPos>(selfId, GRID_POSITION);
  if (selfPos === undefined) return undefined;
  let best: { gx: number; gz: number; dist: number } | undefined;
  for (const id of world.entityIds()) {
    if (id === selfId) continue;
    if (!world.hasComponent(id, BOMBER_STATS)) continue;
    const stats = world.getComponent<BomberStatsRead>(id, BOMBER_STATS);
    if (stats?.alive === false) continue;
    const p = world.getComponent<GridPos>(id, GRID_POSITION);
    if (p === undefined) continue;
    const dist = Math.abs(p.gx - selfPos.gx) + Math.abs(p.gz - selfPos.gz);
    if (best === undefined || dist < best.dist) best = { gx: p.gx, gz: p.gz, dist };
  }
  return best === undefined ? undefined : { gx: best.gx, gz: best.gz };
}

function spawnRevengeBomb(
  world: World,
  ownerId: EntityId,
  gx: number,
  gz: number,
  range: number,
  nextId: (ownerId: EntityId) => EntityId
): void {
  const bombId = nextId(ownerId);
  if (world.hasEntity(bombId)) return;
  const cellHeight = getCellHeight(world, gx, gz);
  world.addEntity(bombId);
  world.setComponent(bombId, TRANSFORM, {
    position: [gx, 0.35 + cellHeight, gz],
    rotation: [0, 0, 0],
    scale: [0, 0, 0]
  });
  world.setComponent(bombId, TWEENS, [
    {
      component: TRANSFORM,
      property: "scale",
      from: [0, 0, 0],
      to: BOMB_FINAL_SCALE,
      duration: SPAWN_POP_DURATION_S,
      ease: "easeOutBack"
    }
  ]);
  // Slightly tinted bomb so a player watching can tell revenge bombs
  // from regular ones — uses a warm rust accent on the standard dark
  // sphere. Cheap visual cue without a new mesh asset.
  world.setComponent(bombId, MESH_RENDERER, { mesh: "sphere", color: "#3a1410" });
  world.setComponent(bombId, GRID_POSITION, { gx, gz });
  world.setComponent(bombId, GRID_OCCUPANT, { layer: "bomb", blocksMovement: false, blocksBlast: false });
  world.setComponent(bombId, RIGID_BODY_3D, { type: "fixed" });
  world.setComponent(bombId, COLLIDER_3D, { kind: "sphere", radius: 0.175 });
  world.setComponent(bombId, BOMB, {
    fuseRemaining: REVENGE_BOMB_FUSE_S_DEFAULT,
    range,
    ownerId
  });
}
