// S252 — third slice of the per-concern bot-ai-helpers split. After
// S250 (acceleration) and S251 (perception), this module owns the
// goal-finder helpers: spatial-target searches + the personality
// dispatcher that combines them into a single "where should the bot
// head?" answer.
//
// All exports are pure reads. The shared types + component-name
// constants come from bot-ai-perception (the base layer);
// `manhattanCells` is duplicated here as a 2-line private util to
// avoid cross-module coupling (decision will get its own copy when
// it extracts).
//
// bot-ai-helpers.ts re-exports everything so call-sites stay
// unchanged.

import type { EntityId } from "../../../../engine/core/ecs/types";
import type { World } from "../../../../engine/core/ecs/world";
import { cellKey } from "../../../../engine/core/grid";
import {
  BOMBER_STATS,
  GRID_POSITION,
  type BotPersonality,
  type BotQueryHandleLike
} from "./bot-ai-perception";

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

/** S239 — personality goal selector. Returns the cell that the bot's
 *  bias-toward path should chase, dispatching on personality:
 *    - 'coward' → undefined (just wander the safe pool)
 *    - 'miner' → nearer of nearest pickup vs nearest soft block
 *    - 'hunter' → anticipated player cell, falling back to pickup
 *
 *  Pure dispatcher; the actual nearest-* lookups are injected via
 *  `deps` so this helper has no QueryHandle / RNG / occupancy state. */
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
