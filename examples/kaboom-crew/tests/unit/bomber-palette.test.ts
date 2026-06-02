// S259 — direct unit tests for the bomber palette helper extracted
// in S258. Locks the colour mapping as a stable contract so the
// four puff sites (S243 place / S228 death-bomb / S245 throw-land /
// S246 pickup-lift) consume a single source of truth.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { bomberPuffColor } from "../../src/systems/bomber-palette";

describe("bomberPuffColor (S258 KABOOM-PUFF-PALETTE)", () => {
  it("player.1 → sky.torsoTop", () => {
    const world = new World();
    world.addEntity("player.1");
    expect(bomberPuffColor(world, "player.1")).toBe("#3ab0ff");
  });

  it("bot with personality 'hunter' → ember.torsoTop", () => {
    const world = new World();
    world.addEntity("bot.1");
    world.setComponent("bot.1", "BotBrain", { aggression: 0, personality: "hunter" });
    expect(bomberPuffColor(world, "bot.1")).toBe("#e65a3a");
  });

  it("bot with personality 'coward' → slate.torsoTop", () => {
    const world = new World();
    world.addEntity("bot.2");
    world.setComponent("bot.2", "BotBrain", { aggression: 0, personality: "coward" });
    expect(bomberPuffColor(world, "bot.2")).toBe("#5a6a82");
  });

  it("bot with personality 'miner' → sand.torsoTop", () => {
    const world = new World();
    world.addEntity("bot.3");
    world.setComponent("bot.3", "BotBrain", { aggression: 0, personality: "miner" });
    expect(bomberPuffColor(world, "bot.3")).toBe("#c9a14d");
  });

  it("bot without BotBrain → undefined (caller falls back to preset)", () => {
    const world = new World();
    world.addEntity("bot.99");
    expect(bomberPuffColor(world, "bot.99")).toBeUndefined();
  });

  it("bot with BotBrain but no personality → undefined", () => {
    const world = new World();
    world.addEntity("bot.4");
    world.setComponent("bot.4", "BotBrain", { aggression: 0 });
    expect(bomberPuffColor(world, "bot.4")).toBeUndefined();
  });

  it("unknown player id (e.g. 'player.2' or 'rando.99') → undefined", () => {
    const world = new World();
    world.addEntity("player.2");
    expect(bomberPuffColor(world, "player.2")).toBeUndefined();
    world.addEntity("rando.99");
    expect(bomberPuffColor(world, "rando.99")).toBeUndefined();
  });
});
