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

// S250 — KABOOM-BOT-ACCELERATION concern lives in bot-ai-acceleration.ts.
// Re-exported here so existing call-sites (bot-ai-system.ts + unit tests)
// keep working unchanged. First slice of the per-concern split.
export {
  BOT_ACCELERATION_BASE_BOOST_DEFAULT,
  BOT_ACCELERATION_ESCALATION_STEP,
  BOT_ACCELERATION_ESCALATION_CAP,
  BOT_ACCELERATION_ESCALATION_INTERVAL_S,
  botAccelerationBoost,
  countAliveBombers
} from "./bot-ai-acceleration";

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

function manhattanCells(ax: number, az: number, bx: number, bz: number): number {
  return Math.abs(ax - bx) + Math.abs(az - bz);
}

/** S236 V2 — nearest Pickup within `maxDistance` cardinal cells, in
 *  danger-free cells only. Returns its cell coords or undefined. */
export function nearestBotPickup(
  world: World,
  pos: { gx: number; gz: number },
  danger: ReadonlySet<string>,
  pickups: BotQueryHandleLike,
  maxDistance: number
): { gx: number; gz: number } | undefined {
  let best: { gx: number; gz: number; dist: number } | undefined;
  for (const id of pickups.run()) {
    const p = world.getComponent<{ gx?: number; gz?: number }>(id, GRID_POSITION);
    if (p?.gx === undefined || p.gz === undefined) continue;
    if (danger.has(cellKey(p.gx, p.gz))) continue;
    const dist = manhattanCells(pos.gx, pos.gz, p.gx, p.gz);
    if (dist > maxDistance) continue;
    if (best === undefined || dist < best.dist) best = { gx: p.gx, gz: p.gz, dist };
  }
  return best === undefined ? undefined : { gx: best.gx, gz: best.gz };
}

/** S236 V2 — nearest soft block (movement-blocking, non-blast-blocking
 *  occupant) within `maxDistance` cells, in a danger-free cell. Uses
 *  `world.query` once per call (low-cadence — bot decision tick ≈ 5 Hz). */
export function nearestBotSoftBlock(
  world: World,
  pos: { gx: number; gz: number },
  danger: ReadonlySet<string>,
  maxDistance: number
): { gx: number; gz: number } | undefined {
  let best: { gx: number; gz: number; dist: number } | undefined;
  // agf-allow: world.query — runs at the bot DECISION_INTERVAL, not per-frame.
  for (const id of world.query([GRID_POSITION, "GridOccupant"])) {
    const p = world.getComponent<{ gx?: number; gz?: number }>(id, GRID_POSITION);
    if (p?.gx === undefined || p.gz === undefined) continue;
    const occ = world.getComponent<{ blocksMovement?: boolean; blocksBlast?: boolean }>(id, "GridOccupant");
    if (occ?.blocksMovement !== true || occ?.blocksBlast === true) continue;
    if (danger.has(cellKey(p.gx, p.gz))) continue;
    const dist = manhattanCells(pos.gx, pos.gz, p.gx, p.gz);
    if (dist > maxDistance) continue;
    if (best === undefined || dist < best.dist) best = { gx: p.gx, gz: p.gz, dist };
  }
  return best === undefined ? undefined : { gx: best.gx, gz: best.gz };
}

/** S236 V2 — nearest alive bomber (PlayerControlled OR BotBrain) other
 *  than `selfId`. Used by HUMANS_DEAD mode to make cowards engage. */
export function nearestBotOtherBomber(
  world: World,
  selfId: EntityId,
  pos: { gx: number; gz: number }
): { gx: number; gz: number } | undefined {
  let best: { gx: number; gz: number; dist: number } | undefined;
  for (const id of world.entityIds()) {
    if (id === selfId) continue;
    if (!world.hasComponent(id, BOMBER_STATS)) continue;
    const stats = world.getComponent<{ alive?: boolean }>(id, BOMBER_STATS);
    if (stats?.alive === false) continue;
    const p = world.getComponent<{ gx?: number; gz?: number }>(id, GRID_POSITION);
    if (p?.gx === undefined || p.gz === undefined) continue;
    const dist = manhattanCells(pos.gx, pos.gz, p.gx, p.gz);
    if (best === undefined || dist < best.dist) best = { gx: p.gx, gz: p.gz, dist };
  }
  return best === undefined ? undefined : { gx: best.gx, gz: best.gz };
}

/** S238 — KICK opportunity detector. For each cardinal direction D,
 *  returns D iff:
 *    - canKick is true,
 *    - the cell ahead (pos + D) holds one of botId's own bombs,
 *    - the cell beyond (pos + 2·D) is movement-passable,
 *    - some alive enemy bomber sits between 2 and 6 cells from the
 *      bot along D, line-of-sight stopping at any movement-blocking
 *      cell beyond step 2.
 *  Returns undefined when no cardinal qualifies. Pure read — the
 *  caller overrides direction; bomb-kick-system does the actual
 *  bomb-slide once the bot walks INTO the bomb cell.
 *
 *  Extracted from bot-ai-system.ts (S220) for the GDP-2026-06-02-002
 *  refactor; behaviour-preserving. */
export function findBotKickOpportunity(
  world: World,
  botId: EntityId,
  pos: { gx: number; gz: number },
  canKick: boolean,
  occupancy: BotOccupancyQuery
): { dx: number; dz: number } | undefined {
  if (!canKick) return undefined;
  for (const dir of DIRECTIONS_4) {
    const aheadGx = pos.gx + dir.dx;
    const aheadGz = pos.gz + dir.dz;
    let ownBombHere = false;
    for (const id of occupancy.occupants(aheadGx, aheadGz, "bomb")) {
      const bomb = world.getComponent<{ ownerId?: string }>(id, BOMB);
      if (bomb?.ownerId === botId) { ownBombHere = true; break; }
    }
    if (!ownBombHere) continue;
    const beyondGx = aheadGx + dir.dx;
    const beyondGz = aheadGz + dir.dz;
    if (occupancy.blocked(beyondGx, beyondGz, "movement")) continue;
    for (let step = 2; step <= 6; step += 1) {
      const probeGx = pos.gx + dir.dx * step;
      const probeGz = pos.gz + dir.dz * step;
      if (step > 2 && occupancy.blocked(probeGx, probeGz, "movement")) break;
      for (const id of world.entityIds()) {
        if (id === botId) continue;
        if (!world.hasComponent(id, BOMBER_STATS)) continue;
        const s = world.getComponent<{ alive?: boolean }>(id, BOMBER_STATS);
        if (s?.alive === false) continue;
        const p = world.getComponent<{ gx?: number; gz?: number }>(id, GRID_POSITION);
        if (p?.gx === undefined || p.gz === undefined) continue;
        if (p.gx === probeGx && p.gz === probeGz) {
          return { dx: dir.dx, dz: dir.dz };
        }
      }
    }
  }
  return undefined;
}

/** S241 — bot direction picker. Chooses one of:
 *    - {dx:0, dz:0} when boxed in (no passable neighbours)
 *    - in danger: uniform-random from the safe pool (no last-heading
 *      bias — that's what got the bot into danger)
 *    - pickup goal: any neighbour that strictly reduces manhattan
 *      distance to the goal (and is safe)
 *    - wander: 60% bias toward continuing the last heading, else
 *      uniform-random from the safe pool
 *
 *  Pure — `deps` carries the passable-neighbour function + the RNG.
 *  Behaviour-preserving extract of `decideDirection`. */
export function pickBotDirection(
  pos: { gx: number; gz: number },
  brain: { lastDecisionDx?: number; lastDecisionDz?: number },
  danger: ReadonlySet<string>,
  pickupGoal: { gx: number; gz: number } | undefined,
  deps: {
    passableNeighbours: (
      pos: { gx: number; gz: number }
    ) => Array<{ dx: number; dz: number; gx: number; gz: number }>;
    rng: { next: () => number };
  }
): { dx: number; dz: number } {
  const neighbours = deps.passableNeighbours(pos);
  if (neighbours.length === 0) return { dx: 0, dz: 0 };

  const inDanger = danger.has(cellKey(pos.gx, pos.gz));
  const safeNeighbours = neighbours.filter((n) => !danger.has(cellKey(n.gx, n.gz)));
  const pool = safeNeighbours.length > 0 ? safeNeighbours : neighbours;

  if (inDanger) {
    const choice = pool[Math.floor(deps.rng.next() * pool.length)]!;
    return { dx: choice.dx, dz: choice.dz };
  }

  if (pickupGoal !== undefined) {
    const here = manhattanCells(pos.gx, pos.gz, pickupGoal.gx, pickupGoal.gz);
    const closer = pool.filter((n) => manhattanCells(n.gx, n.gz, pickupGoal.gx, pickupGoal.gz) < here);
    if (closer.length > 0) {
      const choice = closer[Math.floor(deps.rng.next() * closer.length)]!;
      return { dx: choice.dx, dz: choice.dz };
    }
  }

  if (
    brain.lastDecisionDx !== undefined &&
    brain.lastDecisionDz !== undefined &&
    (brain.lastDecisionDx !== 0 || brain.lastDecisionDz !== 0) &&
    deps.rng.next() < 0.6
  ) {
    const match = pool.find((n) => n.dx === brain.lastDecisionDx && n.dz === brain.lastDecisionDz);
    if (match !== undefined) return { dx: match.dx, dz: match.dz };
  }
  const choice = pool[Math.floor(deps.rng.next() * pool.length)]!;
  return { dx: choice.dx, dz: choice.dz };
}

/** S240 — bot bomb-drop decision tree. Returns true iff the bot
 *  should drop a bomb THIS tick.
 *
 *  Branches (in priority order):
 *    1. Never bomb a cell already in the danger map (would step into
 *       own blast).
 *    2. Skip if dead / at maxBombs cap.
 *    3. REMOTE-DETONATE (S221): if remoteDetonateCharges > 0 + would
 *       kill an enemy → commit.
 *    4. SHIELD (S222): if shield up + would kill an enemy → commit.
 *    5. PIERCE (S223): if pierce up + a cardinal line has 2+ soft
 *       blocks → commit.
 *    6. ADJACENT-SOFT (S82): a cardinal cell holds a soft block →
 *       roll vs aggression × personality × tally × boost.
 *    7. BOOST-EMPTY (S210): under HUMANS_DEAD boost, bomb open cells
 *       with probability scaled by `boost`.
 *
 *  Pure — deps are passed via `deps`. Behaviour-preserving extract
 *  of `shouldDropBomb` originally inline in bot-ai-system.ts. */
export function decideBotShouldDropBomb(
  world: World,
  botId: EntityId,
  pos: { gx: number; gz: number },
  brain: { aggression: number; personality?: BotPersonality },
  danger: ReadonlySet<string>,
  boost: number,
  deps: {
    occupancy: BotOccupancyQuery;
    rng: { next: () => number };
  }
): boolean {
  if (danger.has(cellKey(pos.gx, pos.gz))) return false; // not while fleeing
  const stats = world.getComponent<{
    activeBombs?: number;
    maxBombs: number;
    range?: number;
    alive?: boolean;
    remoteDetonateCharges?: number;
    shield?: boolean;
    pierce?: boolean;
  }>(botId, BOMBER_STATS);
  if (stats === undefined || stats.alive === false) return false;
  if ((stats.activeBombs ?? 0) >= stats.maxBombs) return false;

  // S221 — REMOTE-DETONATE tactical placement.
  if ((stats.remoteDetonateCharges ?? 0) > 0) {
    const range = Math.max(1, Math.floor(stats.range ?? 2));
    if (wouldKillEnemyAt(world, botId, pos, range)) return true;
  }

  // S222 — SHIELD tactical placement.
  if (stats.shield === true) {
    const range = Math.max(1, Math.floor(stats.range ?? 2));
    if (wouldKillEnemyAt(world, botId, pos, range)) return true;
  }

  // S100 — personality scales the base aggression. 'coward' /
  // 'miner' bomb more eagerly. S210 — `boost` is additive HUMANS_DEAD
  // acceleration. S227 — `tallyBias` adds round-tally feedback.
  const persona = brain.personality ?? "hunter";
  const aggressionScale = persona === "coward" ? 1.5 : persona === "miner" ? 1.4 : 1.0;
  const tallyBias = personalityTallyBias(world, persona);
  const aggression = Math.min(1, Math.max(0, brain.aggression * aggressionScale + boost + tallyBias));
  const boosting = boost > 0;

  // S223 — PIERCE: if 2+ soft blocks in any cardinal line → commit.
  if (stats.pierce === true) {
    for (const dir of DIRECTIONS_4) {
      if (countSoftBlocksInLine(deps.occupancy, pos, dir, 2) >= 2) return true;
    }
  }

  // Adjacent soft block? Movement-blocking + non-blast-blocking
  // occupant in a cardinal → roll vs aggression.
  for (const dir of DIRECTIONS_4) {
    const gx = pos.gx + dir.dx;
    const gz = pos.gz + dir.dz;
    if (deps.occupancy.blocked(gx, gz, "movement") && !deps.occupancy.blocked(gx, gz, "blast")) {
      return deps.rng.next() < aggression;
    }
  }

  // BOOST-EMPTY (S210): under acceleration, bomb open cells too with
  // probability scaled by `boost`.
  if (boosting) return deps.rng.next() < Math.min(1, boost);
  return false;
}

/** S239 — personality goal selector. Returns the cell that the bot's
 *  bias-toward path should chase, dispatching on personality:
 *    - 'coward' → undefined (just wander the safe pool)
 *    - 'miner' → nearer of nearest pickup vs nearest soft block
 *    - 'hunter' → anticipated player cell, falling back to pickup
 *
 *  Pure dispatcher; the actual nearest-* lookups are injected via
 *  `deps` so this helper has no QueryHandle / RNG / occupancy state.
 *  Extracted from `personalityGoal` in bot-ai-system.ts (S100). */
export function selectBotPersonalityGoal(
  world: World,
  pos: { gx: number; gz: number },
  personality: BotPersonality,
  danger: ReadonlySet<string>,
  deps: {
    nearestPickup: (
      world: World,
      pos: { gx: number; gz: number },
      danger: ReadonlySet<string>
    ) => { gx: number; gz: number } | undefined;
    nearestSoftBlock: (
      world: World,
      pos: { gx: number; gz: number },
      danger: ReadonlySet<string>
    ) => { gx: number; gz: number } | undefined;
    anticipatedPlayer: (
      world: World,
      pos: { gx: number; gz: number }
    ) => { gx: number; gz: number } | undefined;
  }
): { gx: number; gz: number } | undefined {
  if (personality === "coward") return undefined;
  if (personality === "miner") {
    const pickupGoal = deps.nearestPickup(world, pos, danger);
    const softGoal = deps.nearestSoftBlock(world, pos, danger);
    if (pickupGoal === undefined) return softGoal;
    if (softGoal === undefined) return pickupGoal;
    const dPickup = manhattanCells(pos.gx, pos.gz, pickupGoal.gx, pickupGoal.gz);
    const dSoft = manhattanCells(pos.gx, pos.gz, softGoal.gx, softGoal.gz);
    return dPickup <= dSoft ? pickupGoal : softGoal;
  }
  // 'hunter' (default): anticipated player, fall through to pickup.
  const playerGoal = deps.anticipatedPlayer(world, pos);
  if (playerGoal !== undefined) return playerGoal;
  return deps.nearestPickup(world, pos, danger);
}

/** S236 V2 — nearest PlayerControlled bomber within `maxDistance` cells. */
export function nearestBotPlayer(
  world: World,
  pos: { gx: number; gz: number },
  maxDistance: number
): { gx: number; gz: number } | undefined {
  let best: { gx: number; gz: number; dist: number } | undefined;
  // agf-allow: world.query — runs at the bot DECISION_INTERVAL, not per-frame.
  for (const id of world.query(["PlayerControlled", GRID_POSITION])) {
    const p = world.getComponent<{ gx?: number; gz?: number }>(id, GRID_POSITION);
    if (p?.gx === undefined || p.gz === undefined) continue;
    const dist = manhattanCells(pos.gx, pos.gz, p.gx, p.gz);
    if (dist > maxDistance) continue;
    if (best === undefined || dist < best.dist) best = { gx: p.gx, gz: p.gz, dist };
  }
  return best === undefined ? undefined : { gx: best.gx, gz: best.gz };
}
