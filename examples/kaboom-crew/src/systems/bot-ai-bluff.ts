// S262 KABOOM-BOT-BLUFF (GDP-2026-05-29-010 Layer 3, hunter slice).
//
// Hunter "fake flee" — once per round, with a small probability, the
// hunter executes a psychological misdirection:
//
//   PHASE 1 (fleeing, 1.5s)
//     Direction = AWAY from the nearest player. The hunter LOOKS like
//     it's running away, baiting the player to chase or relax.
//   PHASE 2 (approaching)
//     Direction = TOWARD the player. Hunter loops back. Ends when
//     manhattan distance to the player drops to ≤ 3 (close enough
//     for a placed bomb to threaten the chaser).
//   PHASE 3 (committing, single tick)
//     Forces a PlaceBombRequest in the bot's CURRENT cell.
//   PHASE 4 (done)
//     Bluff is consumed for this round. Bot returns to normal
//     decision flow (anticipation, tally bias, etc).
//
// State is held in a per-bot `BotBluffState` ECS component (not in
// scene JSON — runtime-only). Cleared when RoundState.roundNumber
// advances so each round gets one fresh bluff chance per hunter.
//
// Coward "decoy bomb" + Miner "feign corner" are intentionally OUT
// of this slice; they can ship in follow-ups.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { World } from "../../../../engine/core/ecs/world";

export const BOT_BLUFF_STATE: ComponentName = "BotBluffState";

/** Phases of the fake-flee bluff state machine. */
export type BotBluffPhase = "fleeing" | "approaching" | "committing" | "done";

export type BotBluffStateComponent = {
  kind: "fake-flee";
  phase: BotBluffPhase;
  /** Elapsed time (seconds) since the bluff started — drives phase
   *  transitions. Decision system advances this each brain tick. */
  elapsed: number;
  /** Round number the bluff was started in. Used by the cleanup pass
   *  to drop the component when the round advances. */
  startedRound: number;
};

/** Probability per brain tick that a Hunter starts a fake-flee bluff
 *  during the early window of a round (when LRU-eligible). 10% per the
 *  GDP. With ~5 ticks/sec, expected bluff occurrence ~50% per second
 *  while eligible — so the bluff window resolves quickly. */
export const HUNTER_BLUFF_PROBABILITY_PER_TICK = 0.10;

/** Bluff fleeing window — bot moves away from player. */
export const BLUFF_FLEE_DURATION_S = 1.5;

/** Distance threshold at which the "approaching" phase commits. */
export const BLUFF_COMMIT_DISTANCE = 3;

/** Cool-down distance the bluff requires from the player at start.
 *  If the player is already adjacent, fleeing-then-approaching is
 *  redundant — just decide normally. */
export const BLUFF_MIN_START_DISTANCE = 4;

/** Hunter must see the player within this radius to consider bluffing.
 *  Matches the existing hunter sight ranges in `selectBotPersonalityGoal`. */
export const BLUFF_MAX_START_DISTANCE = 10;

type GridPos = { gx: number; gz: number };

function manhattan(ax: number, az: number, bx: number, bz: number): number {
  return Math.abs(ax - bx) + Math.abs(az - bz);
}

/** Pure helper — decide whether the bot should START a bluff this
 *  tick. Caller has already screened for personality === "hunter"
 *  and no in-progress bluff. */
export function shouldStartHunterBluff(
  pos: GridPos,
  playerCell: GridPos,
  rng: { next: () => number }
): boolean {
  const d = manhattan(pos.gx, pos.gz, playerCell.gx, playerCell.gz);
  if (d < BLUFF_MIN_START_DISTANCE) return false;
  if (d > BLUFF_MAX_START_DISTANCE) return false;
  return rng.next() < HUNTER_BLUFF_PROBABILITY_PER_TICK;
}

/** Pure helper — direction the bot should head while bluffing.
 *  Phase 1 ('fleeing'): vector away from player.
 *  Phase 2 ('approaching'): vector toward player.
 *  Outside those phases: undefined (caller defers to normal decision). */
export function bluffPreferredDirection(
  state: BotBluffStateComponent,
  pos: GridPos,
  playerCell: GridPos
): { dx: number; dz: number } | undefined {
  if (state.phase !== "fleeing" && state.phase !== "approaching") return undefined;
  const sign = state.phase === "fleeing" ? -1 : 1;
  // Pick the dominant cardinal so we don't issue diagonals (grid is
  // 4-connected).
  const dx = playerCell.gx - pos.gx;
  const dz = playerCell.gz - pos.gz;
  if (dx === 0 && dz === 0) return undefined;
  if (Math.abs(dx) >= Math.abs(dz)) {
    return { dx: sign * Math.sign(dx), dz: 0 };
  }
  return { dx: 0, dz: sign * Math.sign(dz) };
}

/** Pure helper — advance the bluff phase based on elapsed time +
 *  current player distance. Returns the NEXT state (no mutation).
 *
 *  Inputs:
 *    state         — current BotBluffState component
 *    pos           — bot's current cell
 *    playerCell    — nearest live player's current cell (or undefined
 *                    when no player is alive / visible)
 *    dt            — seconds since last advance (typically the brain
 *                    tick interval; advancement is coarse-grained — the
 *                    fleeing phase ends when accumulated elapsed >=
 *                    BLUFF_FLEE_DURATION_S)
 */
export function advanceBluffState(
  state: BotBluffStateComponent,
  pos: GridPos,
  playerCell: GridPos | undefined,
  dt: number
): BotBluffStateComponent {
  // Done / committing: caller drives external effects; the state is
  // immutable beyond elapsed accumulation.
  if (state.phase === "done") return state;
  if (state.phase === "committing") {
    // After firing PlaceBombRequest the same tick, the caller will
    // transition us to 'done'. Until that happens, stay parked.
    return { ...state, phase: "done" };
  }
  const elapsed = state.elapsed + Math.max(0, dt);
  if (state.phase === "fleeing") {
    if (elapsed >= BLUFF_FLEE_DURATION_S) {
      return { ...state, phase: "approaching", elapsed };
    }
    return { ...state, elapsed };
  }
  // phase === "approaching"
  if (playerCell === undefined) {
    // Player out of sight — bluff lost its target. Bail to done so
    // the bot returns to normal decision flow.
    return { ...state, phase: "done", elapsed };
  }
  const d = manhattan(pos.gx, pos.gz, playerCell.gx, playerCell.gz);
  if (d <= BLUFF_COMMIT_DISTANCE) {
    return { ...state, phase: "committing", elapsed };
  }
  return { ...state, elapsed };
}

/** Drop stale BotBluffState components when the round number advances
 *  so each hunter gets one fresh bluff chance per round. Caller passes
 *  the live RoundState.roundNumber.
 *
 *  This is a side-effectful helper meant for the brain-tick loop. */
export function clearStaleBluffStates(world: World, currentRoundNumber: number): void {
  for (const id of world.entityIds()) {
    if (!world.hasComponent(id, BOT_BLUFF_STATE)) continue;
    const state = world.getComponent<BotBluffStateComponent>(id, BOT_BLUFF_STATE);
    if (state === undefined) continue;
    if (state.startedRound !== currentRoundNumber) {
      world.removeComponent(id, BOT_BLUFF_STATE);
    }
  }
}

/** Convenience type guard for callers that read the component
 *  loosely. */
export function isBluffActive(state: BotBluffStateComponent | undefined): boolean {
  if (state === undefined) return false;
  return state.phase === "fleeing" || state.phase === "approaching" || state.phase === "committing";
}

/** Side-effectful helper — mount a fresh bluff state on a bot. The
 *  caller (`bot-ai-system`) has already validated personality + RNG +
 *  distance. */
export function startHunterBluff(
  world: World,
  botId: EntityId,
  roundNumber: number
): void {
  const state: BotBluffStateComponent = {
    kind: "fake-flee",
    phase: "fleeing",
    elapsed: 0,
    startedRound: roundNumber
  };
  world.setComponent(botId, BOT_BLUFF_STATE, state);
}
