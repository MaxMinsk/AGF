// S234 KABOOM-BOT-AI-REFACTOR-V0 (GDP-2026-06-02-002 first slice).
// Pure helpers extracted from bot-ai-system.ts so the orchestrator
// file shrinks toward a thin createKaboomBotAISystem entry. All
// functions are stateless reads against `World` — they don't own
// closures, RNG, or QueryHandle caches, so moving them out is
// behaviour-preserving + cleanly testable.
//
// What's here (all `export`-ed):
//   BotPersonality — type
//   BOT_ACCELERATION_* — S210 boost constants
//   botAccelerationBoost — S210 boost formula
//   countAliveBombers — S210 humans/bots counter
//   playerInDashLine — S206 dash-line detector
//   shouldRemoteDetonate — S204 remote-detonate decision
//   personalityTallyBias — S227 tally-driven personality bias
//   predictNextCell — S225 anticipation helper
//   countSoftBlocksInLine — S223 pierce-pattern detector
//   wouldKillEnemyAt — S221/S222 placement helper
//   maybeFireBotThrow — S224 throw-glove decision
//
// bot-ai-system.ts re-exports these so existing import paths
// (tests + downstream callers) keep working unchanged.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { World } from "../../../../engine/core/ecs/world";
import { cellKey } from "../../../../engine/core/grid";

const BOMBER_STATS: ComponentName = "BomberStats";
const GRID_POSITION: ComponentName = "GridPosition";
const BOMB: ComponentName = "Bomb";

/** Cardinal step deltas used by the perception + decision helpers. */
const DIRECTIONS_4: ReadonlyArray<{ dx: number; dz: number }> = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 }
];

/** S236 V1 — minimal QueryHandle shape the helpers need. Exporting it
 *  keeps the helper signatures decoupled from the live `QueryHandle<T>`
 *  type so unit tests can pass plain `{ run: () => [...] }` stubs. */
export type BotQueryHandleLike = { run(): Iterable<EntityId> };

/** S236 V1 — minimal GridOccupancyQuery surface the helpers consume.
 *  Matches `engine/core/systems/grid-occupancy-system::GridOccupancyQuery`
 *  but typed structurally so tests don't have to build a real one. */
export type BotOccupancyQuery = {
  blocked: (gx: number, gz: number, layer: "movement" | "blast") => boolean;
  occupants: (gx: number, gz: number, key?: string) => Iterable<EntityId>;
};

// S100 KABOOM-BOT-PERSONALITY-VARIANTS. Each personality biases two
// decisions: WHERE to wander + WHEN to drop a bomb.
export type BotPersonality = "hunter" | "coward" | "miner";

/** S210 KABOOM-BOT-ACCELERATION default base boost. */
export const BOT_ACCELERATION_BASE_BOOST_DEFAULT = 0.25;
/** S210 — boost added per 15 s elapsed since humans-all-dead. */
export const BOT_ACCELERATION_ESCALATION_STEP = 0.10;
/** S210 — max escalation bonus on top of the base boost. */
export const BOT_ACCELERATION_ESCALATION_CAP = 0.30;
/** S210 — escalation interval in seconds. */
export const BOT_ACCELERATION_ESCALATION_INTERVAL_S = 15;

/** S210 — given the timestamp humans first all died (or undefined
 *  when still alive), return the current aggression boost to add to
 *  `brain.aggression * personalityScale`. */
export function botAccelerationBoost(
  humansAllDeadAt: number | undefined,
  nowS: number,
  baseBoost: number = BOT_ACCELERATION_BASE_BOOST_DEFAULT
): number {
  if (humansAllDeadAt === undefined) return 0;
  const elapsed = Math.max(0, nowS - humansAllDeadAt);
  const steps = Math.floor(elapsed / BOT_ACCELERATION_ESCALATION_INTERVAL_S);
  const escalation = Math.min(BOT_ACCELERATION_ESCALATION_CAP, steps * BOT_ACCELERATION_ESCALATION_STEP);
  return baseBoost + escalation;
}

/** S210 — count alive PlayerControlled bombers + alive bots in one
 *  pass. Used by the bot-ai system to enter / exit HUMANS_DEAD mode. */
export function countAliveBombers(world: World): { humans: number; bots: number } {
  let humans = 0;
  let bots = 0;
  for (const id of world.entityIds()) {
    if (!world.hasComponent(id, "BomberStats")) continue;
    const stats = world.getComponent<{ alive?: boolean }>(id, "BomberStats");
    if (stats?.alive === false) continue;
    if (world.hasComponent(id, "PlayerControlled")) humans += 1;
    else if (world.hasComponent(id, "BotBrain")) bots += 1;
  }
  return { humans, bots };
}

/** S206 — true when an alive player.* bomber sits 2 or 3 cells in
 *  `(dx, dz)` direction from `(pos.gx, pos.gz)`, on the same row or
 *  column as the bot. */
export function playerInDashLine(
  world: World,
  pos: { gx: number; gz: number },
  direction: { dx: number; dz: number }
): boolean {
  if (direction.dx === 0 && direction.dz === 0) return false;
  if (direction.dx !== 0 && direction.dz !== 0) return false; // cardinal only
  for (const id of world.entityIds()) {
    if (!id.startsWith("player.")) continue;
    if (!world.hasComponent(id, BOMBER_STATS)) continue;
    const stats = world.getComponent<{ alive?: boolean }>(id, BOMBER_STATS);
    if (stats?.alive === false) continue;
    const gp = world.getComponent<{ gx?: number; gz?: number }>(id, GRID_POSITION);
    if (gp?.gx === undefined || gp?.gz === undefined) continue;
    const stepGx = gp.gx - pos.gx;
    const stepGz = gp.gz - pos.gz;
    if (direction.dx !== 0) {
      if (stepGz !== 0) continue;
      const dist = stepGx * Math.sign(direction.dx);
      if (dist === 2 || dist === 3) return true;
    } else {
      if (stepGx !== 0) continue;
      const dist = stepGz * Math.sign(direction.dz);
      if (dist === 2 || dist === 3) return true;
    }
  }
  return false;
}

/** S204 — returns true when this bot owns at least one paused bomb
 *  AND some enemy alive bomber sits inside any of those bombs' blast
 *  radius cells. */
export function shouldRemoteDetonate(world: World, ownerId: EntityId): boolean {
  const pausedBombs: Array<{ gx: number; gz: number; range: number }> = [];
  for (const id of world.entityIds()) {
    if (!world.hasComponent(id, BOMB)) continue;
    const b = world.getComponent<{ fuseRemaining?: number; range?: number; ownerId?: string }>(id, BOMB);
    if (b === undefined) continue;
    if (b.ownerId !== ownerId) continue;
    if (Number.isFinite(b.fuseRemaining)) continue; // paused only
    const gp = world.getComponent<{ gx?: number; gz?: number }>(id, GRID_POSITION);
    if (gp?.gx === undefined || gp?.gz === undefined) continue;
    pausedBombs.push({ gx: gp.gx, gz: gp.gz, range: b.range ?? 2 });
  }
  if (pausedBombs.length === 0) return false;
  const enemyCells = collectAliveEnemyCells(world, ownerId);
  if (enemyCells.length === 0) return false;
  for (const bomb of pausedBombs) {
    for (const enemy of enemyCells) {
      if (cellInBlast(bomb, enemy.gx, enemy.gz)) return true;
    }
  }
  return false;
}

/** Module-private — alive enemy bomber cells, excluding `ownerId`. */
function collectAliveEnemyCells(world: World, ownerId: EntityId): Array<{ gx: number; gz: number }> {
  const out: Array<{ gx: number; gz: number }> = [];
  for (const id of world.entityIds()) {
    if (id === ownerId) continue;
    if (!world.hasComponent(id, BOMBER_STATS)) continue;
    const stats = world.getComponent<{ alive?: boolean }>(id, BOMBER_STATS);
    if (stats?.alive === false) continue;
    const gp = world.getComponent<{ gx?: number; gz?: number }>(id, GRID_POSITION);
    if (gp?.gx === undefined || gp?.gz === undefined) continue;
    out.push({ gx: gp.gx, gz: gp.gz });
  }
  return out;
}

/** True when (gx, gz) is within `bomb.range` cardinal cells of the
 *  bomb's centre. Over-trigger preferable to under-trigger here. */
function cellInBlast(bomb: { gx: number; gz: number; range: number }, gx: number, gz: number): boolean {
  if (bomb.gx === gx && bomb.gz === gz) return true;
  if (bomb.gx === gx && Math.abs(bomb.gz - gz) <= bomb.range) return true;
  if (bomb.gz === gz && Math.abs(bomb.gx - gx) <= bomb.range) return true;
  return false;
}

/** S227 — additive aggression bias driven by RoundState.tally. */
export function personalityTallyBias(world: World, persona: BotPersonality): number {
  const round = world.hasEntity("kaboom.round-state")
    ? world.getComponent<{ tally?: { player?: number; bot?: number } }>("kaboom.round-state", "RoundState")
    : undefined;
  const playerWins = round?.tally?.player ?? 0;
  const botWins = round?.tally?.bot ?? 0;
  const diff = botWins - playerWins;
  if (persona === "coward" && diff >= 2) return 0.2;
  if (persona === "hunter" && diff <= -2) return -0.2;
  return 0;
}

/** S225 — predict next cell from straight-line trajectory. */
export function predictNextCell(
  recent: ReadonlyArray<{ gx: number; gz: number }>
): { gx: number; gz: number } | undefined {
  if (recent.length < 3) return undefined;
  const a = recent[recent.length - 3]!;
  const b = recent[recent.length - 2]!;
  const c = recent[recent.length - 1]!;
  const dx1 = b.gx - a.gx;
  const dz1 = b.gz - a.gz;
  const dx2 = c.gx - b.gx;
  const dz2 = c.gz - b.gz;
  if (dx1 !== dx2 || dz1 !== dz2) return undefined;
  if (Math.abs(dx1) + Math.abs(dz1) !== 1) return undefined;
  return { gx: c.gx + dx1, gz: c.gz + dz1 };
}

/** S223 — count soft blocks in line along `dir` starting from
 *  `centre + dir`. Soft block = movement-blocked + NOT blast-blocked. */
export function countSoftBlocksInLine(
  occupancy: { blocked: (gx: number, gz: number, layer: "movement" | "blast") => boolean },
  centre: { gx: number; gz: number },
  dir: { dx: number; dz: number },
  cap: number
): number {
  let count = 0;
  for (let step = 1; step <= cap; step += 1) {
    const gx = centre.gx + dir.dx * step;
    const gz = centre.gz + dir.dz * step;
    const movement = occupancy.blocked(gx, gz, "movement");
    const blast = occupancy.blocked(gx, gz, "blast");
    if (movement && !blast) {
      count += 1;
      continue;
    }
    break;
  }
  return count;
}

/** S221 — true when a bomb of the given range placed at `centre`
 *  would catch at least one alive enemy bomber. */
export function wouldKillEnemyAt(
  world: World,
  ownerId: EntityId,
  centre: { gx: number; gz: number },
  range: number
): boolean {
  const enemies = collectAliveEnemyCells(world, ownerId);
  if (enemies.length === 0) return false;
  for (const enemy of enemies) {
    if (cellInBlast({ gx: centre.gx, gz: centre.gz, range }, enemy.gx, enemy.gz)) return true;
  }
  return false;
}

/** S224 — throw probability per brain tick when the bot stands on
 *  top of its own bomb with canThrow. */
const BOT_THROW_PICKUP_PROBABILITY = 0.3;

/** S224 — bot THROW slice. If already carrying a bomb, fire a
 *  ThrowBombRequest; else if standing on own bomb + canThrow, roll
 *  the pickup chance + fire a PickupBombRequest. */
export function maybeFireBotThrow(
  world: World,
  botId: EntityId,
  pos: { gx: number; gz: number },
  rng: { next: () => number }
): void {
  const stats = world.getComponent<{ canThrow?: boolean; carryingBombId?: string; alive?: boolean }>(botId, BOMBER_STATS);
  if (stats?.canThrow !== true || stats.alive === false) return;
  if (typeof stats.carryingBombId === "string" && stats.carryingBombId.length > 0) {
    if (!world.hasComponent(botId, "ThrowBombRequest")) {
      world.setComponent(botId, "ThrowBombRequest", {});
    }
    return;
  }
  let ownBombId: string | undefined;
  for (const id of world.entityIds()) {
    if (!world.hasComponent(id, BOMB)) continue;
    const bomb = world.getComponent<{ ownerId?: string }>(id, BOMB);
    if (bomb?.ownerId !== botId) continue;
    const gp = world.getComponent<{ gx?: number; gz?: number }>(id, GRID_POSITION);
    if (gp?.gx === pos.gx && gp.gz === pos.gz) {
      ownBombId = id;
      break;
    }
  }
  if (ownBombId === undefined) return;
  if (rng.next() >= BOT_THROW_PICKUP_PROBABILITY) return;
  if (world.hasComponent(botId, "PickupBombRequest")) return;
  world.setComponent(botId, "PickupBombRequest", { bombId: ownBombId });
}

/** S236 V1 — danger map for bot pathfinding. For each Bomb in
 *  `bombs.run()`, mark its origin cell + every cell up to `bomb.range`
 *  along each cardinal, stopping at blast-blocking occupants OR at the
 *  first soft block (which absorbs the blast). Also marks every live
 *  BlastTile cell so the bot won't walk INTO an in-flight explosion.
 *
 *  Pure function — no closure over the bot-ai system's options. Tests
 *  can pass any structurally-typed deps. Behaviour-preserving extract
 *  of `buildDangerMap` originally inline in bot-ai-system.ts. */
export function buildBotDangerMap(
  world: World,
  deps: {
    occupancy: BotOccupancyQuery;
    bombs: BotQueryHandleLike;
    blastTiles?: BotQueryHandleLike;
  }
): Set<string> {
  const danger = new Set<string>();
  // S88 — live BlastTile cells: walking onto one means instant death.
  if (deps.blastTiles !== undefined) {
    for (const id of deps.blastTiles.run()) {
      const pos = world.getComponent<{ gx?: number; gz?: number }>(id, GRID_POSITION);
      if (pos?.gx === undefined || pos.gz === undefined) continue;
      danger.add(cellKey(pos.gx, pos.gz));
    }
  }
  for (const id of deps.bombs.run()) {
    const pos = world.getComponent<{ gx?: number; gz?: number }>(id, GRID_POSITION);
    const bomb = world.getComponent<{ range?: number }>(id, BOMB);
    if (pos?.gx === undefined || pos.gz === undefined) continue;
    if (bomb?.range === undefined) continue;
    danger.add(cellKey(pos.gx, pos.gz));
    for (const dir of DIRECTIONS_4) {
      for (let step = 1; step <= bomb.range; step += 1) {
        const gx = pos.gx + dir.dx * step;
        const gz = pos.gz + dir.dz * step;
        if (deps.occupancy.blocked(gx, gz, "blast")) break;
        danger.add(cellKey(gx, gz));
        // Soft blocks shield further cells. `blocked('blast')` is
        // hard-walls only; a movement-blocking occupant that isn't
        // blast-blocking is a soft block.
        let softHere = false;
        for (const occId of deps.occupancy.occupants(gx, gz)) {
          if (deps.occupancy.blocked(gx, gz, "movement") && !deps.occupancy.blocked(gx, gz, "blast")) {
            softHere = true;
            break;
          }
          void occId;
        }
        if (softHere) break;
      }
    }
  }
  return danger;
}

/** S236 V1 — cardinals from `pos` that are movement-passable. Pure
 *  read; no allocation beyond the result array. */
export function botPassableNeighbours(
  pos: { gx: number; gz: number },
  occupancy: BotOccupancyQuery
): Array<{ dx: number; dz: number; gx: number; gz: number }> {
  const out: Array<{ dx: number; dz: number; gx: number; gz: number }> = [];
  for (const dir of DIRECTIONS_4) {
    const gx = pos.gx + dir.dx;
    const gz = pos.gz + dir.dz;
    if (occupancy.blocked(gx, gz, "movement")) continue;
    out.push({ dx: dir.dx, dz: dir.dz, gx, gz });
  }
  return out;
}
