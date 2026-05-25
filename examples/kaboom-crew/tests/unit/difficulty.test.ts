// S84 KABOOM-BOT-DIFFICULTY.

import { afterEach, describe, expect, it } from "vitest";

import {
  BOT_PERSONALITIES,
  _resetSessionBotPersonality,
  difficultyComponentPatch,
  getDifficultyTuning,
  isDifficultyPreset,
  pickRandomBotPersonality,
  readDifficultyFromUrl,
  resolveSessionBotPersonality
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

describe("bot personality (S100 + S139)", () => {
  afterEach(() => _resetSessionBotPersonality());

  it("BOT_PERSONALITIES is the canonical three-name list", () => {
    expect(BOT_PERSONALITIES).toEqual(["hunter", "coward", "miner"]);
  });

  it("pickRandomBotPersonality maps mod-3 rng deterministically", () => {
    expect(pickRandomBotPersonality(() => 0.0)).toBe("hunter");
    expect(pickRandomBotPersonality(() => 0.34)).toBe("coward");
    expect(pickRandomBotPersonality(() => 0.67)).toBe("miner");
    // 0.999... lands on the last bucket without overflowing — Math.floor
    // pins it to index 2.
    expect(pickRandomBotPersonality(() => 0.9999)).toBe("miner");
  });

  it("resolveSessionBotPersonality honours explicit URL override", () => {
    expect(resolveSessionBotPersonality("?botPersonality=hunter", () => 0.34)).toBe("hunter");
    expect(resolveSessionBotPersonality("?botPersonality=coward", () => 0)).toBe("coward");
    expect(resolveSessionBotPersonality("?botPersonality=miner", () => 0)).toBe("miner");
  });

  it("resolveSessionBotPersonality picks random when URL is empty / unknown", () => {
    expect(resolveSessionBotPersonality(undefined, () => 0)).toBe("hunter");
    _resetSessionBotPersonality();
    expect(resolveSessionBotPersonality("", () => 0.5)).toBe("coward");
    _resetSessionBotPersonality();
    expect(resolveSessionBotPersonality("?other=1", () => 0.9)).toBe("miner");
    _resetSessionBotPersonality();
    expect(resolveSessionBotPersonality("?botPersonality=garbage", () => 0.5)).toBe("coward");
  });

  it("resolveSessionBotPersonality memoises the random pick across calls without URL", () => {
    let calls = 0;
    const rng = (): number => {
      calls += 1;
      return calls === 1 ? 0.0 : 0.9; // first call hunter, second would be miner
    };
    const first = resolveSessionBotPersonality(undefined, rng);
    const second = resolveSessionBotPersonality(undefined, rng);
    const third = resolveSessionBotPersonality(undefined, rng);
    expect(first).toBe("hunter");
    expect(second).toBe("hunter"); // memoised — rng called only once total
    expect(third).toBe("hunter");
    expect(calls).toBe(1);
  });
});
