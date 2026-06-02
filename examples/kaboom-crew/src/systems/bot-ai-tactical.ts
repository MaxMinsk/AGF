// S253 — fourth slice of the per-concern bot-ai-helpers split. After
// S250 (acceleration), S251 (perception), S252 (goals), this module
// owns the per-action tactical detectors + the throw / kick
// dispatchers. Every export decides whether to engage one specific
// tactical maneuver:
//
//   - shouldRemoteDetonate (S204)
//   - personalityTallyBias (S227)
//   - countSoftBlocksInLine (S223)
//   - wouldKillEnemyAt (S221)
//   - maybeFireBotThrow (S224)
//   - findBotKickOpportunity (S238)
//
// `bot-ai-helpers.ts` re-exports everything so call-sites stay
// unchanged. Imports the shared types + constants from
// bot-ai-perception.

import type { EntityId } from "../../../../engine/core/ecs/types";
import type { World } from "../../../../engine/core/ecs/world";
import {
  BOMBER_STATS,
  BOMB,
  DIRECTIONS_4,
  GRID_POSITION,
  type BotOccupancyQuery,
  type BotPersonality
} from "./bot-ai-perception";

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
 *  bomb-slide once the bot walks INTO the bomb cell. */
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
