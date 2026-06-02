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

import type { EntityId } from "../../../../engine/core/ecs/types";
import type { World } from "../../../../engine/core/ecs/world";
import { cellKey } from "../../../../engine/core/grid";
// S251 — perception primitives + shared constants/types live in
// bot-ai-perception.ts. Re-exported here so existing call-sites stay
// unchanged; imported back below for the still-inline tactical /
// goal / decision helpers.
import {
  BOMBER_STATS,
  BOMB,
  DIRECTIONS_4,
  GRID_POSITION,
  type BotOccupancyQuery,
  type BotPersonality,
  type BotQueryHandleLike
} from "./bot-ai-perception";

export {
  BOMBER_STATS,
  BOMB,
  DIRECTIONS_4,
  GRID_POSITION,
  botPassableNeighbours,
  buildBotDangerMap,
  playerInDashLine,
  predictNextCell
} from "./bot-ai-perception";
export type { BotOccupancyQuery, BotPersonality, BotQueryHandleLike } from "./bot-ai-perception";

// S250 — KABOOM-BOT-ACCELERATION concern lives in bot-ai-acceleration.ts.
// S252 — goal-finder concern lives in bot-ai-goals.ts.
// Re-exported here so existing call-sites stay unchanged.
export {
  BOT_ACCELERATION_BASE_BOOST_DEFAULT,
  BOT_ACCELERATION_ESCALATION_STEP,
  BOT_ACCELERATION_ESCALATION_CAP,
  BOT_ACCELERATION_ESCALATION_INTERVAL_S,
  botAccelerationBoost,
  countAliveBombers
} from "./bot-ai-acceleration";

export {
  nearestBotPickup,
  nearestBotSoftBlock,
  nearestBotOtherBomber,
  nearestBotPlayer,
  selectBotPersonalityGoal
} from "./bot-ai-goals";

// S253 — tactical detectors + per-action dispatchers.
export {
  shouldRemoteDetonate,
  personalityTallyBias,
  countSoftBlocksInLine,
  wouldKillEnemyAt,
  maybeFireBotThrow,
  findBotKickOpportunity
} from "./bot-ai-tactical";
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

