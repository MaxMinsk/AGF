// S262 KABOOM-BOT-BLUFF — unit tests for the bluff state machine
// (Hunter fake-flee slice of GDP-2026-05-29-010 Layer 3).

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import {
  BLUFF_COMMIT_DISTANCE,
  BLUFF_FEIGN_DURATION_S,
  BLUFF_FLEE_DURATION_S,
  BLUFF_MAX_START_DISTANCE,
  BLUFF_MIN_START_DISTANCE,
  BLUFF_RETREAT_DURATION_S,
  BLUFF_SLIP_DURATION_S,
  BOT_BLUFF_STATE,
  advanceBluffState,
  bluffForcesBomb,
  bluffPreferredDirection,
  clearStaleBluffStates,
  isBluffActive,
  shouldStartCowardBluff,
  shouldStartHunterBluff,
  shouldStartMinerBluff,
  startCowardBluff,
  startHunterBluff,
  startMinerBluff,
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

describe("shouldStartCowardBluff (S263 trigger gate)", () => {
  it("uses the 15% probability slot — rng 0.10 fires, 0.20 doesn't", () => {
    const here = { gx: 0, gz: 0 };
    const player = { gx: BLUFF_MIN_START_DISTANCE, gz: 0 };
    expect(shouldStartCowardBluff(here, player, makeRng([0.10]))).toBe(true);
    expect(shouldStartCowardBluff(here, player, makeRng([0.20]))).toBe(false);
  });

  it("rejects too-close + too-far players (same distance band as Hunter)", () => {
    const here = { gx: 0, gz: 0 };
    expect(shouldStartCowardBluff(here, { gx: 1, gz: 0 }, makeRng([0]))).toBe(false);
    expect(shouldStartCowardBluff(here, { gx: BLUFF_MAX_START_DISTANCE + 1, gz: 0 }, makeRng([0]))).toBe(false);
  });
});

describe("startCowardBluff (S263 mount)", () => {
  it("opens at placing-decoy phase (caller forces the decoy bomb the same tick)", () => {
    const world = new World();
    world.addEntity("bot.2");
    startCowardBluff(world, "bot.2", 4);
    const state = world.getComponent<BotBluffStateComponent>("bot.2", BOT_BLUFF_STATE)!;
    expect(state.kind).toBe("decoy-bomb");
    expect(state.phase).toBe("placing-decoy");
    expect(state.elapsed).toBe(0);
    expect(state.startedRound).toBe(4);
  });
});

describe("bluffForcesBomb (S263 commit predicate)", () => {
  it("true for committing / placing-decoy / placing-real", () => {
    expect(bluffForcesBomb({ kind: "fake-flee", phase: "committing", elapsed: 2, startedRound: 1 })).toBe(true);
    expect(bluffForcesBomb({ kind: "decoy-bomb", phase: "placing-decoy", elapsed: 0, startedRound: 1 })).toBe(true);
    expect(bluffForcesBomb({ kind: "decoy-bomb", phase: "placing-real", elapsed: 1.5, startedRound: 1 })).toBe(true);
  });

  it("false for non-commit phases", () => {
    expect(bluffForcesBomb({ kind: "fake-flee", phase: "fleeing", elapsed: 0, startedRound: 1 })).toBe(false);
    expect(bluffForcesBomb({ kind: "fake-flee", phase: "approaching", elapsed: 1.5, startedRound: 1 })).toBe(false);
    expect(bluffForcesBomb({ kind: "decoy-bomb", phase: "retreating", elapsed: 0, startedRound: 1 })).toBe(false);
    expect(bluffForcesBomb({ kind: "fake-flee", phase: "done", elapsed: 5, startedRound: 1 })).toBe(false);
  });
});

describe("advanceBluffState (S263 decoy-bomb machine)", () => {
  it("placing-decoy → retreating (single tick)", () => {
    const out = advanceBluffState(
      { kind: "decoy-bomb", phase: "placing-decoy", elapsed: 0, startedRound: 1 },
      { gx: 5, gz: 5 },
      { gx: 8, gz: 5 },
      0.2
    );
    expect(out.phase).toBe("retreating");
    expect(out.elapsed).toBe(0);
  });

  it("retreating → placing-real after BLUFF_RETREAT_DURATION_S", () => {
    const out = advanceBluffState(
      { kind: "decoy-bomb", phase: "retreating", elapsed: 0, startedRound: 1 },
      { gx: 5, gz: 5 },
      { gx: 8, gz: 5 },
      BLUFF_RETREAT_DURATION_S
    );
    expect(out.phase).toBe("placing-real");
  });

  it("retreating stays retreating before timeout", () => {
    const out = advanceBluffState(
      { kind: "decoy-bomb", phase: "retreating", elapsed: 0, startedRound: 1 },
      { gx: 5, gz: 5 },
      { gx: 8, gz: 5 },
      0.5
    );
    expect(out.phase).toBe("retreating");
    expect(out.elapsed).toBeCloseTo(0.5, 6);
  });

  it("placing-real → done (single tick)", () => {
    const out = advanceBluffState(
      { kind: "decoy-bomb", phase: "placing-real", elapsed: 1.5, startedRound: 1 },
      { gx: 5, gz: 5 },
      { gx: 8, gz: 5 },
      0.2
    );
    expect(out.phase).toBe("done");
  });
});

describe("shouldStartMinerBluff (S264 trigger gate)", () => {
  it("uses the 5% probability slot — rng 0.04 fires, 0.06 doesn't", () => {
    const here = { gx: 0, gz: 0 };
    const player = { gx: BLUFF_MIN_START_DISTANCE, gz: 0 };
    expect(shouldStartMinerBluff(here, player, makeRng([0.04]))).toBe(true);
    expect(shouldStartMinerBluff(here, player, makeRng([0.06]))).toBe(false);
  });

  it("rejects too-close + too-far players", () => {
    const here = { gx: 0, gz: 0 };
    expect(shouldStartMinerBluff(here, { gx: 1, gz: 0 }, makeRng([0]))).toBe(false);
    expect(shouldStartMinerBluff(here, { gx: BLUFF_MAX_START_DISTANCE + 1, gz: 0 }, makeRng([0]))).toBe(false);
  });
});

describe("startMinerBluff (S264 mount)", () => {
  it("opens at feigning phase", () => {
    const world = new World();
    world.addEntity("bot.3");
    startMinerBluff(world, "bot.3", 5);
    const state = world.getComponent<BotBluffStateComponent>("bot.3", BOT_BLUFF_STATE)!;
    expect(state.kind).toBe("feign-corner");
    expect(state.phase).toBe("feigning");
    expect(state.elapsed).toBe(0);
    expect(state.startedRound).toBe(5);
  });
});

describe("advanceBluffState (S264 feign-corner machine)", () => {
  it("feigning → slipping after BLUFF_FEIGN_DURATION_S; elapsed resets", () => {
    const out = advanceBluffState(
      { kind: "feign-corner", phase: "feigning", elapsed: 0, startedRound: 1 },
      { gx: 5, gz: 5 },
      { gx: 8, gz: 5 },
      BLUFF_FEIGN_DURATION_S
    );
    expect(out.phase).toBe("slipping");
    expect(out.elapsed).toBe(0);
  });

  it("feigning stays feigning before timeout", () => {
    const out = advanceBluffState(
      { kind: "feign-corner", phase: "feigning", elapsed: 0, startedRound: 1 },
      { gx: 5, gz: 5 },
      { gx: 8, gz: 5 },
      0.5
    );
    expect(out.phase).toBe("feigning");
    expect(out.elapsed).toBeCloseTo(0.5, 6);
  });

  it("slipping → done after BLUFF_SLIP_DURATION_S", () => {
    const out = advanceBluffState(
      { kind: "feign-corner", phase: "slipping", elapsed: 0, startedRound: 1 },
      { gx: 5, gz: 5 },
      { gx: 8, gz: 5 },
      BLUFF_SLIP_DURATION_S
    );
    expect(out.phase).toBe("done");
  });
});

describe("bluffPreferredDirection (S264 feign-corner)", () => {
  it("feigning → {0, 0} (hold position)", () => {
    const d = bluffPreferredDirection(
      { kind: "feign-corner", phase: "feigning", elapsed: 0, startedRound: 1 },
      { gx: 5, gz: 5 },
      { gx: 8, gz: 5 }
    );
    expect(d).toEqual({ dx: 0, dz: 0 });
  });

  it("slipping → vector AWAY from player (mirrors fleeing/retreating)", () => {
    const d = bluffPreferredDirection(
      { kind: "feign-corner", phase: "slipping", elapsed: 0, startedRound: 1 },
      { gx: 5, gz: 5 },
      { gx: 8, gz: 5 }
    );
    expect(d).toEqual({ dx: -1, dz: 0 });
  });
});

describe("bluffForcesBomb (S264 — feign-corner never forces a bomb)", () => {
  it("false for feigning and slipping (no bomb commit in feign-corner)", () => {
    expect(bluffForcesBomb({ kind: "feign-corner", phase: "feigning", elapsed: 0, startedRound: 1 })).toBe(false);
    expect(bluffForcesBomb({ kind: "feign-corner", phase: "slipping", elapsed: 1, startedRound: 1 })).toBe(false);
  });
});

describe("bluffPreferredDirection (S263 decoy-bomb direction)", () => {
  it("retreating → vector AWAY from player", () => {
    const d = bluffPreferredDirection(
      { kind: "decoy-bomb", phase: "retreating", elapsed: 0, startedRound: 1 },
      { gx: 5, gz: 5 },
      { gx: 8, gz: 5 }
    );
    expect(d).toEqual({ dx: -1, dz: 0 });
  });

  it("placing-decoy / placing-real → undefined (caller falls back to normal direction)", () => {
    expect(
      bluffPreferredDirection(
        { kind: "decoy-bomb", phase: "placing-decoy", elapsed: 0, startedRound: 1 },
        { gx: 5, gz: 5 },
        { gx: 8, gz: 5 }
      )
    ).toBeUndefined();
    expect(
      bluffPreferredDirection(
        { kind: "decoy-bomb", phase: "placing-real", elapsed: 1.5, startedRound: 1 },
        { gx: 5, gz: 5 },
        { gx: 8, gz: 5 }
      )
    ).toBeUndefined();
  });
});
