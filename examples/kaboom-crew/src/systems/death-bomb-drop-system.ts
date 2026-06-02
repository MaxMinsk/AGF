// S226 KABOOM-DEATH-BOMB-DROP (GDP-2026-06-02-001). When a bomber
// dies, automatically spawn ONE bomb on a cardinal cell adjacent to
// the death cell. The bomb is owned by the dead bomber (kill credit
// posthumously), fuses + blasts normally. Simpler replacement for
// the click-to-throw revenge-cart (S211 / S219) — same 1v1
// engagement gap closed without input / UI / protocol cost.
//
// Trigger: BomberStats.alive true → false edge (same pattern as the
// S132 ragdoll trigger + S208 loot drop).
//
// Cell pick:
//   1. Build candidate set = the 4 cardinals of the death cell.
//   2. Drop any cell that's out of grid bounds, hard-blocked, soft-
//      blocked, or already holding a bomb.
//   3. Pick one via seeded RNG keyed on
//      (bomberId, sceneSeed, roundNumber).
//   4. Fallback 1: if 0 candidates left, try the death cell itself
//      — only if it doesn't already hold a bomb.
//   5. Fallback 2: silent skip. Surrounded by hard blocks + live
//      bombs already, the death bomb can't squeeze in.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import type { GridOccupancyQuery } from "../../../../engine/core/systems/grid-occupancy-system";
import { createSeededRng } from "../../../../engine/core/util/seeded-rng";
import { getCellHeight } from "../../../../engine/grid/height-query";

import { BOMB_FINAL_SCALE } from "./bomb-placement-system";
import { spawnPuff } from "./spawn-puff";

const BOMBER_STATS: ComponentName = "BomberStats";
const GRID_POSITION: ComponentName = "GridPosition";
const BOMB: ComponentName = "Bomb";
const TRANSFORM: ComponentName = "Transform";
const MESH_RENDERER: ComponentName = "MeshRenderer";
const GRID_OCCUPANT: ComponentName = "GridOccupant";
const TWEENS: ComponentName = "Tweens";
const RIGID_BODY_3D: ComponentName = "RigidBody3D";
const COLLIDER_3D: ComponentName = "Collider3D";
const ROUND_STATE: ComponentName = "RoundState";

const ROUND_STATE_ID = "kaboom.round-state";

/** Bomb spawn-pop tween duration (matches bomb-placement S095). */
const SPAWN_POP_DURATION_S = 0.2;
/** Project seed salted into the per-death RNG so the cell pick is
 *  deterministic across runs of the same seed. */
export const DEATH_BOMB_SEED_DEFAULT = 0xd1ea701;
/** Default blast range of the death-drop bomb. Intentionally the
 *  baseline (2) rather than the dead bomber's actual range — keeps
 *  the mechanic predictable + uniform across all deaths. */
export const DEATH_BOMB_RANGE_DEFAULT = 2;
/** Default fuse — same as a normal player-placed bomb. */
export const DEATH_BOMB_FUSE_S_DEFAULT = 2.5;
/** Slight tint so survivors can read 'death bomb' at a glance —
 *  warmer red than the bomber-coloured #1a1a1a baseline. */
const DEATH_BOMB_HEX = "#3a1010";
/** Seconds we defer the bomb spawn after alive→false — gives the
 *  S128 ragdoll a chance to fly + settle. We read the torso mesh's
 *  final Transform.position at expiry and base the cardinal pick
 *  on THAT cell, matching user request "рядом с тем местом куда
 *  улетел рагдолл". Default 0.6 s matches the ragdoll despawn
 *  timeline from S105/S108. */
export const DEATH_BOMB_DEFER_S_DEFAULT = 0.6;

const DIRECTIONS: ReadonlyArray<{ dx: number; dz: number }> = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 }
];

type BomberStatsRead = { alive?: boolean };
type GridPos = { gx: number; gz: number };
type RoundStateRead = { roundNumber?: number };

export type KaboomDeathBombDropOptions = {
  name?: string;
  occupancy: GridOccupancyQuery;
  /** `?deathBomb=off` disables the mechanic entirely. */
  disabled?: boolean;
  /** `?deathBombRange=N` — range of the spawned bomb (1..4). */
  range?: number;
  /** Seeded RNG salt. Combined with bomberId + roundNumber. */
  seed?: number;
  /** Override the post-death defer (ragdoll landing wait). 0 = spawn
   *  on the same tick the bomber dies (V1 behaviour, useful for
   *  tests). */
  deferS?: number;
  /** S226 — arena bounds in cells. When provided, candidate cardinals
   *  outside `[0..width-1, 0..depth-1]` are filtered out so the death
   *  bomb never spawns off-screen. Accepts a thunk so a mid-session
   *  map swap (S205 rotation) re-evaluates. */
  arenaSize?: { width: number; depth: number } | (() => { width: number; depth: number } | undefined);
  /** Optional id factory — tests use a deterministic counter. */
  nextBombId?: (ownerId: EntityId) => EntityId;
};

/** Deterministic seed for a given (bomberId, roundNumber, seed). */
function deathSeed(bomberId: EntityId, roundNumber: number, projectSeed: number): number {
  let h = projectSeed | 0;
  for (let i = 0; i < bomberId.length; i += 1) {
    h = Math.imul(h ^ bomberId.charCodeAt(i), 0x01000193);
  }
  h = Math.imul(h ^ roundNumber, 0x01000193);
  return (h | 1) >>> 0;
}

/** Pure helper — given the candidate-set predicate and an RNG, pick
 *  the destination cell for the death bomb. Returns undefined when
 *  no cardinal-adjacent cell is free — per user feedback the death
 *  bomb only ever spawns on an unobstructed CARDINAL CELL, never on
 *  the death cell itself. Surrounded → silent skip. Exported for
 *  unit tests. */
export function pickDeathBombCell(
  deathPos: { gx: number; gz: number },
  isAvailable: (cell: { gx: number; gz: number }) => boolean,
  rng: { next: () => number }
): { gx: number; gz: number } | undefined {
  const candidates: Array<{ gx: number; gz: number }> = [];
  for (const dir of DIRECTIONS) {
    const cell = { gx: deathPos.gx + dir.dx, gz: deathPos.gz + dir.dz };
    if (isAvailable(cell)) candidates.push(cell);
  }
  if (candidates.length === 0) return undefined;
  const idx = Math.floor(rng.next() * candidates.length);
  return candidates[Math.min(idx, candidates.length - 1)];
}

/** Pending-spawn entry — queued at the alive→false moment, fires
 *  after `deferRemainingS` ticks down to 0 so the ragdoll has time
 *  to settle. */
type PendingDeathBomb = {
  bomberId: EntityId;
  fallbackPos: { gx: number; gz: number };
  roundNumber: number;
  deferRemainingS: number;
};

export function createKaboomDeathBombDropSystem(
  options: KaboomDeathBombDropOptions
): System {
  const name = options.name ?? "kaboom.death-bomb-drop";
  const disabled = options.disabled === true;
  const range = Math.max(1, Math.min(4, Math.floor(options.range ?? DEATH_BOMB_RANGE_DEFAULT)));
  const projectSeed = options.seed ?? DEATH_BOMB_SEED_DEFAULT;
  const deferS = Math.max(0, options.deferS ?? DEATH_BOMB_DEFER_S_DEFAULT);
  const arenaSizeGetter: () => { width: number; depth: number } | undefined =
    typeof options.arenaSize === "function"
      ? options.arenaSize
      : (() => options.arenaSize as { width: number; depth: number } | undefined);
  let counter = 0;
  const nextBombId =
    options.nextBombId ??
    ((ownerId: EntityId): EntityId => {
      counter += 1;
      return `death-bomb.${ownerId}.${counter}`;
    });

  const prevAlive = new Map<EntityId, boolean>();
  const pending: PendingDeathBomb[] = [];
  let cachedWorld: World | undefined;
  let bombers: QueryHandle | undefined;
  // S228 hotfix — track round boundary so a pending spawn queued
  // in the previous round can't fire across the restart. The
  // user reported a death-bomb appearing next to the freshly
  // respawned player at round-start; root cause was the pending
  // queue surviving the round-resolve gap (world reference stays
  // the same across scene.load, so the world-change cache reset
  // never fired).
  let prevRoundNumber: number | undefined;
  let prevRoundPhase: string | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      bombers = world.createQuery([BOMBER_STATS]);
      cachedWorld = world;
      prevAlive.clear();
      pending.length = 0;
      prevRoundNumber = undefined;
      prevRoundPhase = undefined;
    }
    if (disabled) return;

    // Round boundary edge — bumped roundNumber OR phase resumed
    // 'playing' from a resolved phase. Either edge means a new
    // round is starting; pending spawns from the prior round are
    // stale and must be discarded.
    const round = world.hasEntity(ROUND_STATE_ID)
      ? world.getComponent<{ phase?: string; roundNumber?: number }>(ROUND_STATE_ID, ROUND_STATE)
      : undefined;
    const roundNumber = round?.roundNumber;
    const phase = round?.phase;
    const roundChanged =
      roundNumber !== undefined && prevRoundNumber !== undefined && roundNumber !== prevRoundNumber;
    const phaseResumed =
      phase === "playing" && prevRoundPhase !== undefined && prevRoundPhase !== "playing";
    if (roundChanged || phaseResumed) {
      pending.length = 0;
      // Re-seed prevAlive so bombers freshly respawned at round-
      // start don't read a stale `alive=false` from the previous
      // round + immediately fire the death edge.
      prevAlive.clear();
    }
    prevRoundNumber = roundNumber;
    prevRoundPhase = phase;

    const dt = Math.max(0, context.time.fixedDt);

    // Detect alive true → false transitions; queue a pending spawn.
    const current = new Map<EntityId, boolean>();
    for (const id of bombers!.run()) {
      const stats = world.getComponent<BomberStatsRead>(id, BOMBER_STATS);
      current.set(id, stats?.alive !== false);
    }
    for (const [id, nowAlive] of current) {
      const wasAlive = prevAlive.get(id) ?? true;
      if (wasAlive && !nowAlive) queueDeath(world, id);
    }
    for (const id of prevAlive.keys()) {
      if (!current.has(id)) prevAlive.delete(id);
    }
    for (const [id, alive] of current) prevAlive.set(id, alive);

    // Tick pending entries; fire any whose timer reached 0.
    for (let i = pending.length - 1; i >= 0; i -= 1) {
      const entry = pending[i]!;
      entry.deferRemainingS -= dt;
      if (entry.deferRemainingS > 0) continue;
      // Try to read the ragdoll torso's final position. S132 detaches
      // the bomber's 10 mesh entities + their ids follow the pattern
      // `${bomberRoot}.torso`. After the ragdoll runs, the torso's
      // Transform.position.xz is "where the ragdoll landed". If the
      // torso entity is gone (engine ragdoll module despawned it
      // already) we fall back to the savedDeath cell.
      const basis = readRagdollLandingCell(world, entry.bomberId) ?? entry.fallbackPos;
      const rng = createSeededRng(deathSeed(entry.bomberId, entry.roundNumber, projectSeed));
      const arena = arenaSizeGetter();
      const isAvailable = (cell: { gx: number; gz: number }): boolean => {
        // S226 — never spawn off-screen. When arenaSize is known,
        // restrict to [0..width-1, 0..depth-1]; without bounds the
        // legacy "anything goes" behaviour stays (tests + projects
        // that don't ship MAP_DIMS).
        if (arena !== undefined) {
          if (cell.gx < 0 || cell.gz < 0) return false;
          if (cell.gx >= arena.width || cell.gz >= arena.depth) return false;
        }
        if (options.occupancy.blocked(cell.gx, cell.gz, "movement")) return false;
        if (options.occupancy.occupants(cell.gx, cell.gz, "bomb").length > 0) return false;
        return true;
      };
      const target = pickDeathBombCell(basis, isAvailable, rng);
      pending.splice(i, 1);
      if (target === undefined) continue;
      spawnDeathBomb(world, entry.bomberId, target, range, nextBombId);
    }
  };

  function queueDeath(world: World, bomberId: EntityId): void {
    const pos = world.getComponent<GridPos>(bomberId, GRID_POSITION);
    if (pos === undefined) return;
    const roundNumber = world.hasEntity(ROUND_STATE_ID)
      ? world.getComponent<RoundStateRead>(ROUND_STATE_ID, ROUND_STATE)?.roundNumber ?? 1
      : 1;
    pending.push({
      bomberId,
      fallbackPos: { gx: pos.gx, gz: pos.gz },
      roundNumber,
      deferRemainingS: deferS
    });
  }

  return { name, fixedUpdate };
}

/** Pure helper — try to read the torso mesh entity's grid cell from
 *  Transform.position.xz. Returns undefined when the entity is gone
 *  (engine ragdoll despawned it) or the position is invalid. */
export function readRagdollLandingCell(
  world: World,
  bomberRootId: EntityId
): { gx: number; gz: number } | undefined {
  const torsoId = `${bomberRootId}.torso`;
  if (!world.hasEntity(torsoId)) return undefined;
  const t = world.getComponent<{ position?: ReadonlyArray<number> }>(torsoId, TRANSFORM);
  const pos = t?.position;
  if (pos === undefined) return undefined;
  const x = pos[0];
  const z = pos[2];
  if (typeof x !== "number" || typeof z !== "number") return undefined;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return undefined;
  return { gx: Math.round(x), gz: Math.round(z) };
}

function spawnDeathBomb(
  world: World,
  ownerId: EntityId,
  cell: { gx: number; gz: number },
  range: number,
  nextId: (ownerId: EntityId) => EntityId
): void {
  const bombId = nextId(ownerId);
  if (world.hasEntity(bombId)) return;
  const cellHeight = getCellHeight(world, cell.gx, cell.gz);
  world.addEntity(bombId);
  world.setComponent(bombId, TRANSFORM, {
    position: [cell.gx, 0.35 + cellHeight, cell.gz],
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
  world.setComponent(bombId, MESH_RENDERER, { mesh: "sphere", color: DEATH_BOMB_HEX });
  world.setComponent(bombId, GRID_POSITION, { gx: cell.gx, gz: cell.gz });
  world.setComponent(bombId, GRID_OCCUPANT, { layer: "bomb", blocksMovement: false, blocksBlast: false });
  world.setComponent(bombId, RIGID_BODY_3D, { type: "fixed" });
  world.setComponent(bombId, COLLIDER_3D, { kind: "sphere", radius: 0.175 });
  world.setComponent(bombId, BOMB, {
    fuseRemaining: DEATH_BOMB_FUSE_S_DEFAULT,
    range,
    ownerId
  });
  // S228 KABOOM-DEATH-BOMB-TELEGRAPH (GDP-2026-06-02-001 visual cue).
  // Co-spawn a short-lived spark emitter so survivors visually parse
  // "death bomb just appeared here" vs a normal placement. (S247
  // shared `spawnPuff` helper — self-cleans on elapsed-reaches-lifetime.)
  spawnPuff(world, {
    id: `${bombId}.puff`,
    position: [cell.gx, 0.5 + cellHeight, cell.gz],
    preset: "spark",
    lifetime: 0.4,
    rate: 40,
    maxParticles: 14
  });
}
