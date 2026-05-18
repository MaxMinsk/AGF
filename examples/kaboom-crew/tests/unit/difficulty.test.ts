// S84 KABOOM-BOT-DIFFICULTY.

import { describe, expect, it } from "vitest";

import {
  difficultyComponentPatch,
  getDifficultyTuning,
  isDifficultyPreset,
  readDifficultyFromUrl
} from "../../src/difficulty";

describe("difficulty helpers (S84 KABOOM-BOT-DIFFICULTY)", () => {
  it("isDifficultyPreset narrows known values", () => {
    expect(isDifficultyPreset("easy")).toBe(true);
    expect(isDifficultyPreset("normal")).toBe(true);
    expect(isDifficultyPreset("hard")).toBe(true);
    expect(isDifficultyPreset("nightmare")).toBe(false);
    expect(isDifficultyPreset("")).toBe(false);
  });

  it("getDifficultyTuning returns the documented dial values", () => {
    expect(getDifficultyTuning("easy")).toEqual({ aggression: 0.25, decisionIntervalMs: 500, range: 2, speed: 2 });
    expect(getDifficultyTuning("normal")).toEqual({ aggression: 0.5, decisionIntervalMs: 200, range: 2, speed: 3 });
    expect(getDifficultyTuning("hard")).toEqual({ aggression: 0.85, decisionIntervalMs: 120, range: 3, speed: 4 });
  });

  it("readDifficultyFromUrl falls back to 'normal'", () => {
    expect(readDifficultyFromUrl(undefined)).toBe("normal");
    expect(readDifficultyFromUrl("")).toBe("normal");
    expect(readDifficultyFromUrl("?nope=1")).toBe("normal");
    expect(readDifficultyFromUrl("?difficulty=garbage")).toBe("normal");
  });

  it("readDifficultyFromUrl honours each preset", () => {
    expect(readDifficultyFromUrl("?difficulty=easy")).toBe("easy");
    expect(readDifficultyFromUrl("?difficulty=normal")).toBe("normal");
    expect(readDifficultyFromUrl("?difficulty=hard")).toBe("hard");
    expect(readDifficultyFromUrl("?project=kaboom-crew&difficulty=hard")).toBe("hard");
  });

  it("difficultyComponentPatch translates ms → seconds for BotBrain", () => {
    const patch = difficultyComponentPatch("hard");
    expect(patch.BotBrain.aggression).toBe(0.85);
    expect(patch.BotBrain.nextDecisionIn).toBe(0.12);
    expect(patch.BomberStats).toEqual({ maxBombs: 1, range: 3, activeBombs: 0, alive: true });
    expect(patch.GridMover).toEqual({ speed: 4 });
  });
});
