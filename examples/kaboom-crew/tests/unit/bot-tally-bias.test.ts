// S227 + S266 KABOOM-BOT-TALLY-BIAS (GDP-2026-05-29-010 Layer 2).
// S227 shipped 2 of 6 mappings (Brave Coward + Patient Hunter); S266
// completes the table (Pure Coward, Reckless Hunter, Combat Miner,
// Pure Miner) and adds the HUD-label helper.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import {
  personalityTallyBias,
  shiftedPersonalityLabel,
  tallyBiasForDiff
} from "../../src/systems/bot-ai-system";

function setupTally(world: World, player: number, bot: number, draws = 0): void {
  if (!world.hasEntity("kaboom.round-state")) world.addEntity("kaboom.round-state");
  world.setComponent("kaboom.round-state", "RoundState", {
    phase: "playing",
    tally: { player, bot, draws }
  });
}

describe("kaboom personalityTallyBias (S227)", () => {
  it("coward + bots leading 2-0 → +0.2 bias", () => {
    const world = new World();
    setupTally(world, 0, 2);
    expect(personalityTallyBias(world, "coward")).toBeCloseTo(0.2, 5);
  });

  it("coward + bots leading 3-0 → +0.2 bias (no escalation)", () => {
    const world = new World();
    setupTally(world, 0, 3);
    expect(personalityTallyBias(world, "coward")).toBeCloseTo(0.2, 5);
  });

  it("coward + lead is only 1 → no bias", () => {
    const world = new World();
    setupTally(world, 0, 1);
    expect(personalityTallyBias(world, "coward")).toBe(0);
  });

  it("hunter + bots trailing 0-2 → -0.2 bias", () => {
    const world = new World();
    setupTally(world, 2, 0);
    expect(personalityTallyBias(world, "hunter")).toBeCloseTo(-0.2, 5);
  });

  it("hunter + lead within ±1 → no bias", () => {
    const world = new World();
    setupTally(world, 1, 0);
    expect(personalityTallyBias(world, "hunter")).toBe(0);
  });

  it("miner + leading 2+ → -0.1 (Pure Miner, ignore combat)", () => {
    const world = new World();
    setupTally(world, 0, 2);
    expect(personalityTallyBias(world, "miner")).toBeCloseTo(-0.1, 5);
  });

  it("miner + trailing 2+ → +0.2 (Combat Miner, panic combat)", () => {
    const world = new World();
    setupTally(world, 2, 0);
    expect(personalityTallyBias(world, "miner")).toBeCloseTo(0.2, 5);
  });

  it("miner + margin within ±1 → 0", () => {
    const world = new World();
    setupTally(world, 1, 0);
    expect(personalityTallyBias(world, "miner")).toBe(0);
    setupTally(world, 0, 1);
    expect(personalityTallyBias(world, "miner")).toBe(0);
  });

  it("coward + trailing 2+ → -0.1 (Pure Coward, too late to take chances)", () => {
    const world = new World();
    setupTally(world, 2, 0);
    expect(personalityTallyBias(world, "coward")).toBeCloseTo(-0.1, 5);
  });

  it("hunter + leading 2+ → +0.2 (Reckless Hunter, aggressive finisher)", () => {
    const world = new World();
    setupTally(world, 0, 2);
    expect(personalityTallyBias(world, "hunter")).toBeCloseTo(0.2, 5);
  });

  it("no RoundState entity → 0 bias for every personality", () => {
    const world = new World();
    expect(personalityTallyBias(world, "coward")).toBe(0);
    expect(personalityTallyBias(world, "hunter")).toBe(0);
    expect(personalityTallyBias(world, "miner")).toBe(0);
  });

  it("RoundState with no tally → 0 bias", () => {
    const world = new World();
    world.addEntity("kaboom.round-state");
    world.setComponent("kaboom.round-state", "RoundState", { phase: "playing" });
    expect(personalityTallyBias(world, "coward")).toBe(0);
    expect(personalityTallyBias(world, "hunter")).toBe(0);
  });
});

describe("tallyBiasForDiff (S266 pure helper)", () => {
  it("coward: brave (+0.2 at +2), fearful (-0.1 at -2), baseline 0 in ±1 band", () => {
    expect(tallyBiasForDiff("coward", 2)).toBeCloseTo(0.2, 5);
    expect(tallyBiasForDiff("coward", -2)).toBeCloseTo(-0.1, 5);
    expect(tallyBiasForDiff("coward", 1)).toBe(0);
    expect(tallyBiasForDiff("coward", -1)).toBe(0);
    expect(tallyBiasForDiff("coward", 0)).toBe(0);
  });

  it("hunter: reckless (+0.2 at +2), patient (-0.2 at -2), baseline 0 in ±1 band", () => {
    expect(tallyBiasForDiff("hunter", 2)).toBeCloseTo(0.2, 5);
    expect(tallyBiasForDiff("hunter", -2)).toBeCloseTo(-0.2, 5);
    expect(tallyBiasForDiff("hunter", 1)).toBe(0);
    expect(tallyBiasForDiff("hunter", -1)).toBe(0);
  });

  it("miner: calm (-0.1 at +2), combat (+0.2 at -2), baseline 0 in ±1 band", () => {
    expect(tallyBiasForDiff("miner", 2)).toBeCloseTo(-0.1, 5);
    expect(tallyBiasForDiff("miner", -2)).toBeCloseTo(0.2, 5);
    expect(tallyBiasForDiff("miner", 1)).toBe(0);
    expect(tallyBiasForDiff("miner", -1)).toBe(0);
  });
});

describe("shiftedPersonalityLabel (S266 HUD label)", () => {
  it("coward labels", () => {
    expect(shiftedPersonalityLabel("coward", 2)).toBe("brave");
    expect(shiftedPersonalityLabel("coward", -2)).toBe("fearful");
    expect(shiftedPersonalityLabel("coward", 0)).toBeUndefined();
    expect(shiftedPersonalityLabel("coward", 1)).toBeUndefined();
  });

  it("hunter labels", () => {
    expect(shiftedPersonalityLabel("hunter", 2)).toBe("reckless");
    expect(shiftedPersonalityLabel("hunter", -2)).toBe("patient");
    expect(shiftedPersonalityLabel("hunter", 1)).toBeUndefined();
  });

  it("miner labels", () => {
    expect(shiftedPersonalityLabel("miner", 2)).toBe("calm");
    expect(shiftedPersonalityLabel("miner", -2)).toBe("combat");
    expect(shiftedPersonalityLabel("miner", 0)).toBeUndefined();
  });
});
