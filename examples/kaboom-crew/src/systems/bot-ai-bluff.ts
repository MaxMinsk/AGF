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

/** Phases of the bluff state machines. The union covers every kind
 *  the system knows about — each `kind` walks its own subset of these
 *  phases (see `advanceBluffState`). */
export type BotBluffPhase =
  | "fleeing"        // fake-flee phase 1 — vector away from player
  | "approaching"    // fake-flee phase 2 — loop back toward player
  | "committing"     // fake-flee phase 3 — forces a bomb
  | "placing-decoy"  // decoy-bomb phase 1 — forces a visible bomb in front of player
  | "retreating"     // decoy-bomb phase 2 — vector away from player to set up the real trap
  | "placing-real"   // decoy-bomb phase 3 — forces the real trap bomb
  | "feigning"       // feign-corner phase 1 — hold position (looks cornered)
  | "slipping"       // feign-corner phase 2 — vector away, slip past the now-relaxed player
  | "done";

export type BotBluffKind = "fake-flee" | "decoy-bomb" | "feign-corner";

export type BotBluffStateComponent = {
  kind: BotBluffKind;
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

/** Probability per brain tick that a Coward starts a decoy-bomb bluff.
 *  GDP-2026-05-29-010 calls for 15% per round; we apply the same
 *  per-tick gate as the hunter — Coward fires slightly more often
 *  reflecting its less risky bluff path. */
export const COWARD_BLUFF_PROBABILITY_PER_TICK = 0.15;

/** Probability per brain tick that a Miner starts a feign-corner bluff.
 *  GDP-2026-05-29-010 calls for the rarest rate (5%) — the Miner's
 *  bluff is the most subtle of the three. */
export const MINER_BLUFF_PROBABILITY_PER_TICK = 0.05;

/** Bluff fleeing window — bot moves away from player. */
export const BLUFF_FLEE_DURATION_S = 1.5;

/** Decoy-bomb retreating window before the bot drops the REAL trap. */
export const BLUFF_RETREAT_DURATION_S = 1.5;

/** Feign-corner feigning window — bot holds position (looks cornered). */
export const BLUFF_FEIGN_DURATION_S = 1.5;

/** Feign-corner slipping window — bot bolts away after the feign. */
export const BLUFF_SLIP_DURATION_S = 1.5;

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

/** Pure helper — coward decoy-bomb trigger gate. Same distance band
 *  as the hunter (player within 4..10 cells) and same per-tick RNG
 *  shape; only the probability differs (15% vs 10%). */
export function shouldStartCowardBluff(
  pos: GridPos,
  playerCell: GridPos,
  rng: { next: () => number }
): boolean {
  const d = manhattan(pos.gx, pos.gz, playerCell.gx, playerCell.gz);
  if (d < BLUFF_MIN_START_DISTANCE) return false;
  if (d > BLUFF_MAX_START_DISTANCE) return false;
  return rng.next() < COWARD_BLUFF_PROBABILITY_PER_TICK;
}

/** Pure helper — miner feign-corner trigger gate. 5% per tick; same
 *  distance band as the other two bluffs. The miner-only path. */
export function shouldStartMinerBluff(
  pos: GridPos,
  playerCell: GridPos,
  rng: { next: () => number }
): boolean {
  const d = manhattan(pos.gx, pos.gz, playerCell.gx, playerCell.gz);
  if (d < BLUFF_MIN_START_DISTANCE) return false;
  if (d > BLUFF_MAX_START_DISTANCE) return false;
  return rng.next() < MINER_BLUFF_PROBABILITY_PER_TICK;
}

/** Pure helper — direction the bot should head while bluffing.
 *  - 'fleeing' / 'retreating' / 'slipping': vector AWAY from player.
 *  - 'approaching': vector TOWARD player.
 *  - 'feigning': {dx:0,dz:0} — bot holds position (looks cornered).
 *  - 'committing' / 'placing-decoy' / 'placing-real' / 'done': undefined.
 *    The caller still drops a bomb on the commit phases; the direction
 *    falls back to the normal decideDirection path so the bot doesn't
 *    freeze on the same cell. */
export function bluffPreferredDirection(
  state: BotBluffStateComponent,
  pos: GridPos,
  playerCell: GridPos
): { dx: number; dz: number } | undefined {
  if (state.phase === "feigning") return { dx: 0, dz: 0 };
  let sign = 0;
  if (
    state.phase === "fleeing"
    || state.phase === "retreating"
    || state.phase === "slipping"
  ) sign = -1;
  else if (state.phase === "approaching") sign = 1;
  else return undefined;
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

/** Pure helper — does the current bluff phase force a PlaceBombRequest?
 *  Centralised so the bot-ai integration doesn't have to know which
 *  phases are bomb-commit edges across both kinds. */
export function bluffForcesBomb(state: BotBluffStateComponent): boolean {
  return state.phase === "committing"
    || state.phase === "placing-decoy"
    || state.phase === "placing-real";
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
  if (state.phase === "done") return state;

  // Single-tick bomb-commit phases advance to the next slot the
  // moment the caller observes them. The caller forces the bomb on
  // the SAME tick (bluffForcesBomb returns true), then the next
  // tick we land here and step forward.
  if (state.phase === "committing") return { ...state, phase: "done" };
  if (state.phase === "placing-decoy") return { ...state, phase: "retreating", elapsed: 0 };
  if (state.phase === "placing-real") return { ...state, phase: "done" };

  const elapsed = state.elapsed + Math.max(0, dt);

  // Fake-flee — fleeing → approaching → committing.
  if (state.phase === "fleeing") {
    if (elapsed >= BLUFF_FLEE_DURATION_S) {
      return { ...state, phase: "approaching", elapsed };
    }
    return { ...state, elapsed };
  }
  if (state.phase === "approaching") {
    if (playerCell === undefined) {
      return { ...state, phase: "done", elapsed };
    }
    const d = manhattan(pos.gx, pos.gz, playerCell.gx, playerCell.gz);
    if (d <= BLUFF_COMMIT_DISTANCE) {
      return { ...state, phase: "committing", elapsed };
    }
    return { ...state, elapsed };
  }

  // Decoy-bomb — placing-decoy → retreating → placing-real.
  if (state.phase === "retreating") {
    if (elapsed >= BLUFF_RETREAT_DURATION_S) {
      return { ...state, phase: "placing-real", elapsed };
    }
    return { ...state, elapsed };
  }

  // Feign-corner — feigning → slipping → done. No bomb commit; the
  // bluff is purely psychological misdirection (player relaxes
  // thinking the miner is pinned, miner bolts past them).
  if (state.phase === "feigning") {
    if (elapsed >= BLUFF_FEIGN_DURATION_S) {
      return { ...state, phase: "slipping", elapsed: 0 };
    }
    return { ...state, elapsed };
  }
  if (state.phase === "slipping") {
    if (elapsed >= BLUFF_SLIP_DURATION_S) {
      return { ...state, phase: "done", elapsed };
    }
    return { ...state, elapsed };
  }

  // Defensive fallthrough — unknown phase, terminate.
  return { ...state, phase: "done", elapsed };
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
 *  loosely. True for every phase that's NOT terminal. */
export function isBluffActive(state: BotBluffStateComponent | undefined): boolean {
  if (state === undefined) return false;
  return state.phase !== "done";
}

/** Side-effectful helper — mount a fresh hunter fake-flee bluff. The
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

/** Side-effectful helper — mount a fresh coward decoy-bomb bluff.
 *  Caller has already validated personality + RNG + distance. The
 *  state opens at the `placing-decoy` phase so the next tick's
 *  `bluffForcesBomb` returns true and the decoy drops where the
 *  coward stands. */
export function startCowardBluff(
  world: World,
  botId: EntityId,
  roundNumber: number
): void {
  const state: BotBluffStateComponent = {
    kind: "decoy-bomb",
    phase: "placing-decoy",
    elapsed: 0,
    startedRound: roundNumber
  };
  world.setComponent(botId, BOT_BLUFF_STATE, state);
}

/** Side-effectful helper — mount a fresh miner feign-corner bluff.
 *  Caller has already validated personality + RNG + distance.
 *  The state opens at the `feigning` phase so the bot holds position
 *  for 1.5s (looks cornered), then `slipping` for 1.5s (vector away
 *  past the now-relaxed player). No bomb commit — the bluff is pure
 *  psychological misdirection. */
export function startMinerBluff(
  world: World,
  botId: EntityId,
  roundNumber: number
): void {
  const state: BotBluffStateComponent = {
    kind: "feign-corner",
    phase: "feigning",
    elapsed: 0,
    startedRound: roundNumber
  };
  world.setComponent(botId, BOT_BLUFF_STATE, state);
}
