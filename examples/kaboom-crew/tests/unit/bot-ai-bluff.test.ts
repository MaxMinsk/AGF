// S262 KABOOM-BOT-BLUFF — unit tests for the bluff state machine
// (Hunter fake-flee slice of GDP-2026-05-29-010 Layer 3).

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import {
  BLUFF_COMMIT_DISTANCE,
  BLUFF_FLEE_DURATION_S,
  BLUFF_MAX_START_DISTANCE,
  BLUFF_MIN_START_DISTANCE,
  BOT_BLUFF_STATE,
  advanceBluffState,
  bluffPreferredDirection,
  clearStaleBluffStates,
  isBluffActive,
  shouldStartHunterBluff,
  startHunterBluff,
  type BotBluffStateComponent
} from "../../src/systems/bot-ai-bluff";

function makeRng(values: number[]): { next: () => number } {
  let i = 0;
  return { next: () => values[i++ % values.length] ?? 0 };
}

describe("shouldStartHunterBluff (S262 trigger gate)", () => {
  it("returns false when player is too close (< BLUFF_MIN_START_DISTANCE)", () => {
    const close = { gx: 5, gz: 5 };
    const player = { gx: 6, gz: 5 }; // manhattan 1
    expect(shouldStartHunterBluff(close, player, makeRng([0]))).toBe(false);
  });

  it("returns false when player is too far (> BLUFF_MAX_START_DISTANCE)", () => {
    const here = { gx: 0, gz: 0 };
    const far = { gx: BLUFF_MAX_START_DISTANCE + 5, gz: 0 };
    expect(shouldStartHunterBluff(here, far, makeRng([0]))).toBe(false);
  });

  it("returns true when in range AND rng roll passes", () => {
    const here = { gx: 0, gz: 0 };
    const player = { gx: BLUFF_MIN_START_DISTANCE, gz: 0 };
    expect(shouldStartHunterBluff(here, player, makeRng([0.05]))).toBe(true);
  });

  it("returns false when in range but rng roll fails", () => {
    const here = { gx: 0, gz: 0 };
    const player = { gx: BLUFF_MIN_START_DISTANCE, gz: 0 };
    expect(shouldStartHunterBluff(here, player, makeRng([0.5]))).toBe(false);
  });
});

describe("bluffPreferredDirection (S262 direction override)", () => {
  it("fleeing → vector AWAY from player on dominant cardinal", () => {
    const state: BotBluffStateComponent = { kind: "fake-flee", phase: "fleeing", elapsed: 0, startedRound: 1 };
    // Player to the east (positive X). Bot should flee west (-X).
    const d = bluffPreferredDirection(state, { gx: 5, gz: 5 }, { gx: 8, gz: 5 });
    expect(d).toEqual({ dx: -1, dz: 0 });
  });

  it("approaching → vector TOWARD player", () => {
    const state: BotBluffStateComponent = { kind: "fake-flee", phase: "approaching", elapsed: 1.5, startedRound: 1 };
    const d = bluffPreferredDirection(state, { gx: 5, gz: 5 }, { gx: 8, gz: 5 });
    expect(d).toEqual({ dx: 1, dz: 0 });
  });

  it("picks Z axis when dz dominates", () => {
    const state: BotBluffStateComponent = { kind: "fake-flee", phase: "fleeing", elapsed: 0, startedRound: 1 };
    const d = bluffPreferredDirection(state, { gx: 5, gz: 5 }, { gx: 5, gz: 9 });
    expect(d).toEqual({ dx: 0, dz: -1 });
  });

  it("undefined when state is committing / done", () => {
    const committing: BotBluffStateComponent = { kind: "fake-flee", phase: "committing", elapsed: 2, startedRound: 1 };
    expect(bluffPreferredDirection(committing, { gx: 5, gz: 5 }, { gx: 8, gz: 5 })).toBeUndefined();
    const done: BotBluffStateComponent = { kind: "fake-flee", phase: "done", elapsed: 2, startedRound: 1 };
    expect(bluffPreferredDirection(done, { gx: 5, gz: 5 }, { gx: 8, gz: 5 })).toBeUndefined();
  });

  it("undefined when bot and player share a cell", () => {
    const state: BotBluffStateComponent = { kind: "fake-flee", phase: "fleeing", elapsed: 0, startedRound: 1 };
    expect(bluffPreferredDirection(state, { gx: 5, gz: 5 }, { gx: 5, gz: 5 })).toBeUndefined();
  });
});

describe("advanceBluffState (S262 phase machine)", () => {
  it("fleeing → approaching when elapsed >= BLUFF_FLEE_DURATION_S", () => {
    const state: BotBluffStateComponent = { kind: "fake-flee", phase: "fleeing", elapsed: 0, startedRound: 1 };
    const out = advanceBluffState(state, { gx: 5, gz: 5 }, { gx: 8, gz: 5 }, BLUFF_FLEE_DURATION_S);
    expect(out.phase).toBe("approaching");
    expect(out.elapsed).toBeCloseTo(BLUFF_FLEE_DURATION_S, 6);
  });

  it("fleeing → stays fleeing while elapsed < threshold", () => {
    const state: BotBluffStateComponent = { kind: "fake-flee", phase: "fleeing", elapsed: 0, startedRound: 1 };
    const out = advanceBluffState(state, { gx: 5, gz: 5 }, { gx: 8, gz: 5 }, 0.5);
    expect(out.phase).toBe("fleeing");
    expect(out.elapsed).toBeCloseTo(0.5, 6);
  });

  it("approaching → committing when distance <= BLUFF_COMMIT_DISTANCE", () => {
    const state: BotBluffStateComponent = { kind: "fake-flee", phase: "approaching", elapsed: 2, startedRound: 1 };
    const out = advanceBluffState(state, { gx: 5, gz: 5 }, { gx: 5 + BLUFF_COMMIT_DISTANCE, gz: 5 }, 0.2);
    expect(out.phase).toBe("committing");
  });

  it("approaching → stays approaching when too far from player", () => {
    const state: BotBluffStateComponent = { kind: "fake-flee", phase: "approaching", elapsed: 2, startedRound: 1 };
    const out = advanceBluffState(state, { gx: 0, gz: 0 }, { gx: BLUFF_COMMIT_DISTANCE + 5, gz: 0 }, 0.2);
    expect(out.phase).toBe("approaching");
  });

  it("approaching → done when player disappears (out of sight)", () => {
    const state: BotBluffStateComponent = { kind: "fake-flee", phase: "approaching", elapsed: 2, startedRound: 1 };
    const out = advanceBluffState(state, { gx: 5, gz: 5 }, undefined, 0.2);
    expect(out.phase).toBe("done");
  });

  it("committing → done", () => {
    const state: BotBluffStateComponent = { kind: "fake-flee", phase: "committing", elapsed: 2, startedRound: 1 };
    const out = advanceBluffState(state, { gx: 5, gz: 5 }, { gx: 6, gz: 5 }, 0.2);
    expect(out.phase).toBe("done");
  });

  it("done → done (terminal)", () => {
    const state: BotBluffStateComponent = { kind: "fake-flee", phase: "done", elapsed: 5, startedRound: 1 };
    const out = advanceBluffState(state, { gx: 5, gz: 5 }, { gx: 6, gz: 5 }, 0.2);
    expect(out.phase).toBe("done");
    expect(out.elapsed).toBe(5);
  });
});

describe("clearStaleBluffStates (S262 round-edge cleanup)", () => {
  it("drops components whose startedRound != currentRound", () => {
    const world = new World();
    world.addEntity("bot.1");
    world.setComponent("bot.1", BOT_BLUFF_STATE, {
      kind: "fake-flee",
      phase: "fleeing",
      elapsed: 0,
      startedRound: 1
    } satisfies BotBluffStateComponent);
    clearStaleBluffStates(world, 2);
    expect(world.hasComponent("bot.1", BOT_BLUFF_STATE)).toBe(false);
  });

  it("keeps components from the current round", () => {
    const world = new World();
    world.addEntity("bot.2");
    world.setComponent("bot.2", BOT_BLUFF_STATE, {
      kind: "fake-flee",
      phase: "approaching",
      elapsed: 1.5,
      startedRound: 3
    } satisfies BotBluffStateComponent);
    clearStaleBluffStates(world, 3);
    expect(world.hasComponent("bot.2", BOT_BLUFF_STATE)).toBe(true);
  });
});

describe("isBluffActive (S262 active predicate)", () => {
  it("true for fleeing, approaching, committing", () => {
    expect(isBluffActive({ kind: "fake-flee", phase: "fleeing", elapsed: 0, startedRound: 1 })).toBe(true);
    expect(isBluffActive({ kind: "fake-flee", phase: "approaching", elapsed: 1.5, startedRound: 1 })).toBe(true);
    expect(isBluffActive({ kind: "fake-flee", phase: "committing", elapsed: 2, startedRound: 1 })).toBe(true);
  });

  it("false for done / undefined", () => {
    expect(isBluffActive({ kind: "fake-flee", phase: "done", elapsed: 2, startedRound: 1 })).toBe(false);
    expect(isBluffActive(undefined)).toBe(false);
  });
});

describe("startHunterBluff (S262 mount)", () => {
  it("writes a fresh fleeing state on the bot", () => {
    const world = new World();
    world.addEntity("bot.1");
    startHunterBluff(world, "bot.1", 7);
    const state = world.getComponent<BotBluffStateComponent>("bot.1", BOT_BLUFF_STATE)!;
    expect(state.kind).toBe("fake-flee");
    expect(state.phase).toBe("fleeing");
    expect(state.elapsed).toBe(0);
    expect(state.startedRound).toBe(7);
  });
});
