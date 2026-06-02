// S254 — fifth and final slice of the per-concern bot-ai-helpers
// split. After S250 (acceleration), S251 (perception), S252 (goals),
// and S253 (tactical), this module owns the two top-level decision
// orchestrators that combine the lower-layer helpers into the
// per-tick bot output:
//
//   - pickBotDirection (S241) — direction picker (boxed-in / flee /
//     pickup-magnet / last-heading-biased wander)
//   - decideBotShouldDropBomb (S240) — bomb-drop decision tree
//     (REMOTE / SHIELD / PIERCE / ADJACENT-SOFT / BOOST-EMPTY)
//
// Both pure functions; deps are passed in by the orchestrator
// (bot-ai-system.ts), which keeps the closure state.
//
// bot-ai-helpers.ts is now a pure re-export barrel — every concern
// lives in its own file.

import type { EntityId } from "../../../../engine/core/ecs/types";
import type { World } from "../../../../engine/core/ecs/world";
import { cellKey } from "../../../../engine/core/grid";
import {
  BOMBER_STATS,
  DIRECTIONS_4,
  type BotOccupancyQuery,
  type BotPersonality
} from "./bot-ai-perception";
import {
  countSoftBlocksInLine,
  personalityTallyBias,
  wouldKillEnemyAt
} from "./bot-ai-tactical";

function manhattanCells(ax: number, az: number, bx: number, bz: number): number {
  return Math.abs(ax - bx) + Math.abs(az - bz);
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
 *  Pure — `deps` carries the passable-neighbour function + the RNG. */
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
 *       with probability scaled by `boost`. */
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
