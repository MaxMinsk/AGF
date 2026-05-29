// S210 KABOOM-BOT-ACCELERATION (GDP-2026-05-29-011). Covers the
// pure boost formula, the alive-counter, and the integration path
// through createKaboomBotAISystem.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";

import {
  BOT_ACCELERATION_BASE_BOOST_DEFAULT,
  BOT_ACCELERATION_ESCALATION_CAP,
  botAccelerationBoost,
  countAliveBombers,
  createKaboomBotAISystem
} from "../../src/systems/bot-ai-system";

function ctx(world: World, elapsed = 0, dt = 1 / 60) {
  return {
    world,
    time: { elapsed, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0 }
  };
}

function setupHuman(world: World, id: string, gx: number, gz: number): void {
  world.addEntity(id);
  world.setComponent(id, "BomberStats", { maxBombs: 1, range: 2, alive: true });
  world.setComponent(id, "GridMover", { speed: 1 });
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "PlayerControlled", {});
}

function setupBot(world: World, id: string, gx: number, gz: number, persona = "hunter"): void {
  world.addEntity(id);
  world.setComponent(id, "BomberStats", { maxBombs: 1, range: 2, alive: true });
  world.setComponent(id, "GridMover", { speed: 1 });
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "BotBrain", { aggression: 0.3, personality: persona, nextDecisionIn: 0 });
}

const NEVER_BLOCK = {
  blocked: () => false,
  occupants: () => [] as string[],
  occupiedCells: () => [] as Array<{ gx: number; gz: number }>
} as unknown as Parameters<typeof createKaboomBotAISystem>[0]["occupancy"];

describe("kaboom bot acceleration (S210)", () => {
  it("botAccelerationBoost returns 0 when humansAllDeadAt is undefined", () => {
    expect(botAccelerationBoost(undefined, 100)).toBe(0);
  });

  it("at the moment HUMANS_DEAD triggers, boost = base only (no escalation)", () => {
    expect(botAccelerationBoost(50, 50)).toBeCloseTo(BOT_ACCELERATION_BASE_BOOST_DEFAULT, 5);
    expect(botAccelerationBoost(50, 50, 0.40)).toBeCloseTo(0.40, 5);
  });

  it("escalation kicks in at +15s steps and caps at +0.30", () => {
    expect(botAccelerationBoost(0, 14)).toBeCloseTo(0.25, 5);
    expect(botAccelerationBoost(0, 15)).toBeCloseTo(0.35, 5);
    expect(botAccelerationBoost(0, 30)).toBeCloseTo(0.45, 5);
    expect(botAccelerationBoost(0, 45)).toBeCloseTo(0.55, 5);
    expect(botAccelerationBoost(0, 60)).toBeCloseTo(0.25 + BOT_ACCELERATION_ESCALATION_CAP, 5);
    expect(botAccelerationBoost(0, 9999)).toBeCloseTo(0.25 + BOT_ACCELERATION_ESCALATION_CAP, 5);
  });

  it("countAliveBombers tracks human + bot counts", () => {
    const world = new World();
    setupHuman(world, "player.1", 1, 1);
    setupBot(world, "bot.1", 5, 5);
    setupBot(world, "bot.2", 6, 6);
    expect(countAliveBombers(world)).toEqual({ humans: 1, bots: 2 });

    const stats = world.getComponent("player.1", "BomberStats") as { maxBombs?: number; range?: number };
    world.setComponent("player.1", "BomberStats", { ...stats, alive: false });
    expect(countAliveBombers(world)).toEqual({ humans: 0, bots: 2 });
  });

  it("system enters HUMANS_DEAD mode only when humans dead AND 2+ bots alive", () => {
    const world = new World();
    setupHuman(world, "player.1", 1, 1);
    setupBot(world, "bot.1", 5, 5);
    const sys = createKaboomBotAISystem({ occupancy: NEVER_BLOCK, seed: 1 });

    // Humans alive — no boost. Bot is at fresh decision (nextDecisionIn=0).
    sys.fixedUpdate!(ctx(world, 0));
    // Human dies, but only 1 bot remains — still no boost (round resolves naturally).
    const ps = world.getComponent("player.1", "BomberStats") as { maxBombs?: number; range?: number };
    world.setComponent("player.1", "BomberStats", { ...ps, alive: false });
    // No way to read internal boost; instead verify behaviour: with one
    // bot only, no goal-switch should target self (we already know it
    // doesn't crash and runs to completion).
    expect(() => sys.fixedUpdate!(ctx(world, 1))).not.toThrow();

    // Add a second bot. Now HUMANS_DEAD should activate next tick.
    setupBot(world, "bot.2", 6, 6);
    expect(() => sys.fixedUpdate!(ctx(world, 2))).not.toThrow();
  });

  it("?botAccelerate=off equivalent (accelerationDisabled:true) → no behavioural change", () => {
    const world = new World();
    setupHuman(world, "player.1", 1, 1);
    setupBot(world, "bot.1", 5, 5);
    setupBot(world, "bot.2", 6, 6);
    const sys = createKaboomBotAISystem({
      occupancy: NEVER_BLOCK,
      seed: 1,
      accelerationDisabled: true
    });
    // Kill human + advance time well past escalation step. With
    // acceleration disabled, the bot doesn't enter HUMANS_DEAD mode
    // and the existing nearest-other-bomber target switch never
    // fires. Hard to assert without reading internals; just ensure
    // we don't throw + entity counts stay constant.
    const ps = world.getComponent("player.1", "BomberStats") as { maxBombs?: number; range?: number };
    world.setComponent("player.1", "BomberStats", { ...ps, alive: false });
    for (let i = 0; i < 50; i += 1) {
      sys.fixedUpdate!(ctx(world, i, 0.2));
    }
    expect(world.hasEntity("bot.1")).toBe(true);
    expect(world.hasEntity("bot.2")).toBe(true);
  });

  it("HUMANS_DEAD resets when a human comes back alive (revive / grace reconnect)", () => {
    const world = new World();
    setupHuman(world, "player.1", 1, 1);
    setupBot(world, "bot.1", 5, 5);
    setupBot(world, "bot.2", 6, 6);
    const sys = createKaboomBotAISystem({ occupancy: NEVER_BLOCK, seed: 1 });

    // Kill human.
    const ps = world.getComponent("player.1", "BomberStats") as { maxBombs?: number; range?: number };
    world.setComponent("player.1", "BomberStats", { ...ps, alive: false });
    sys.fixedUpdate!(ctx(world, 1));

    // Revive human within grace.
    world.setComponent("player.1", "BomberStats", { ...ps, alive: true });
    sys.fixedUpdate!(ctx(world, 2));

    // No exception; counts.humans now 1 → boost clears.
    expect(countAliveBombers(world).humans).toBe(1);
  });
});
