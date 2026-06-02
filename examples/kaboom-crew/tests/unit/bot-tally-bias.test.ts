// S227 KABOOM-BOT-TALLY-BIAS (GDP-2026-05-29-010 Layer 2). Pure
// helper tests for `personalityTallyBias` — coward bolder when
// bots lead 2+; hunter cautious when bots trail 2+. Miner /
// margins ≤ 1 / missing tally → 0 bias.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { personalityTallyBias } from "../../src/systems/bot-ai-system";

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

  it("miner ignores the tally regardless of margin", () => {
    const world = new World();
    setupTally(world, 0, 5);
    expect(personalityTallyBias(world, "miner")).toBe(0);
    setupTally(world, 5, 0);
    expect(personalityTallyBias(world, "miner")).toBe(0);
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
