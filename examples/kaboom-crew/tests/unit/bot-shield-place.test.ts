// S222 KABOOM-BOT-SHIELD-PLACE (GDP-2026-05-29-009 SHIELD slice).
// Parallel to S221's REMOTE branch — bot with shield=true and an
// alive enemy in its bomb's blast radius from the current cell
// commits to placing a bomb. Best case the bot dashes out + kills
// clean; worst case the shield absorbs the trade hit.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";

import { createKaboomBotAISystem } from "../../src/systems/bot-ai-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0 }
  };
}

const NEVER_BLOCK = {
  blocked: () => false,
  occupants: () => [] as string[],
  occupiedCells: () => [] as Array<{ gx: number; gz: number }>
} as unknown as Parameters<typeof createKaboomBotAISystem>[0]["occupancy"];

function setupBot(
  world: World,
  id: string,
  gx: number,
  gz: number,
  shield: boolean,
  range = 3
): void {
  world.addEntity(id);
  world.setComponent(id, "BomberStats", {
    maxBombs: 1,
    range,
    activeBombs: 0,
    alive: true,
    shield
  });
  world.setComponent(id, "GridMover", { speed: 1 });
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "BotBrain", { aggression: 0.0, personality: "hunter", nextDecisionIn: 0 });
}

function setupEnemy(world: World, id: string, gx: number, gz: number): void {
  world.addEntity(id);
  world.setComponent(id, "BomberStats", { maxBombs: 1, range: 2, alive: true });
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "PlayerControlled", {});
}

function hasPlaceRequest(world: World, id: string): boolean {
  return world.hasComponent(id, "PlaceBombRequest");
}

describe("kaboom bot tactical shield (S222)", () => {
  it("bot with shield=true + enemy in range → emits PlaceBombRequest", () => {
    const world = new World();
    setupBot(world, "bot.1", 5, 5, true, 3);
    setupEnemy(world, "player.1", 7, 5);
    const sys = createKaboomBotAISystem({ occupancy: NEVER_BLOCK, seed: 1 });
    sys.fixedUpdate!(ctx(world));
    expect(hasPlaceRequest(world, "bot.1")).toBe(true);
  });

  it("bot WITHOUT shield (and no other tactical trigger) + same setup → no bomb", () => {
    const world = new World();
    setupBot(world, "bot.1", 5, 5, false, 3);
    setupEnemy(world, "player.1", 7, 5);
    const sys = createKaboomBotAISystem({ occupancy: NEVER_BLOCK, seed: 1 });
    sys.fixedUpdate!(ctx(world));
    expect(hasPlaceRequest(world, "bot.1")).toBe(false);
  });

  it("shielded bot + enemy OUT of range → no bomb (shield isn't a free bomber)", () => {
    const world = new World();
    setupBot(world, "bot.1", 5, 5, true, 2);
    setupEnemy(world, "player.1", 10, 5);
    const sys = createKaboomBotAISystem({ occupancy: NEVER_BLOCK, seed: 1 });
    sys.fixedUpdate!(ctx(world));
    expect(hasPlaceRequest(world, "bot.1")).toBe(false);
  });

  it("shielded bot + dead enemy in range → no bomb (only alive enemies count)", () => {
    const world = new World();
    setupBot(world, "bot.1", 5, 5, true, 3);
    setupEnemy(world, "player.1", 7, 5);
    const s = world.getComponent<Record<string, unknown>>("player.1", "BomberStats") ?? {};
    world.setComponent("player.1", "BomberStats", { ...s, alive: false });
    const sys = createKaboomBotAISystem({ occupancy: NEVER_BLOCK, seed: 1 });
    sys.fixedUpdate!(ctx(world));
    expect(hasPlaceRequest(world, "bot.1")).toBe(false);
  });
});
