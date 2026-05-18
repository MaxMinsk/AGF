// S82 KABOOM-BOT-AI unit tests.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createGridOccupancySystem } from "../../../../engine/core/systems/grid-occupancy-system";
import { createKaboomBotAISystem } from "../../src/systems/bot-ai-system";

function ctx(world: World, fixedDt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt: fixedDt, fixedDt, frameCount: 0, fixedStepCount: 0 }
  };
}

function addBot(world: World, id: string, gx: number, gz: number, aggression = 0): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "GridOccupant", { layer: id, blocksMovement: false, blocksBlast: false });
  world.setComponent(id, "BomberStats", { maxBombs: 1, range: 2, activeBombs: 0, alive: true });
  world.setComponent(id, "GridMover", { speed: 3, currentLerp: 0 });
  world.setComponent(id, "BotBrain", { aggression });
}

function addBomb(world: World, id: string, gx: number, gz: number, range = 2): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "GridOccupant", { layer: "bomb", blocksMovement: false, blocksBlast: false });
  world.setComponent(id, "Bomb", { fuseRemaining: 1, range, ownerId: "player.1" });
}

function addWall(world: World, id: string, gx: number, gz: number): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "GridOccupant", { layer: "wall", blocksMovement: true, blocksBlast: true });
}

describe("createKaboomBotAISystem (S82 KABOOM-BOT-AI)", () => {
  it("respects an in-flight decision cooldown — no rewrite while nextDecisionIn > dt", () => {
    const world = new World();
    addBot(world, "bot.1", 3, 3);
    world.setComponent("bot.1", "BotBrain", { aggression: 0, nextDecisionIn: 1 });
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const ai = createKaboomBotAISystem({ occupancy: occ, seed: 1 });
    ai.fixedUpdate!(ctx(world));
    const mover = world.getComponent("bot.1", "GridMover") as { queuedDirection?: unknown };
    expect(mover.queuedDirection).toBeUndefined();
    // Cooldown was decremented but is still > 0.
    const brain = world.getComponent("bot.1", "BotBrain") as { nextDecisionIn: number };
    expect(brain.nextDecisionIn).toBeCloseTo(1 - 1 / 60, 4);
  });

  it("picks a passable cardinal when wandering", () => {
    const world = new World();
    addBot(world, "bot.1", 3, 3);
    // Wall the west cell so we can verify the bot doesn't pick -X first.
    addWall(world, "wall.w", 2, 3);
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    // Force the decision: nudge nextDecisionIn to 0 before the tick.
    world.setComponent("bot.1", "BotBrain", { aggression: 0, nextDecisionIn: 0 });
    const ai = createKaboomBotAISystem({ occupancy: occ, seed: 7 });
    ai.fixedUpdate!(ctx(world));
    const mover = world.getComponent("bot.1", "GridMover") as { queuedDirection: { dx: number; dz: number } };
    expect(mover.queuedDirection).toBeDefined();
    // Whatever the RNG chose, it isn't toward the wall.
    expect(mover.queuedDirection).not.toEqual({ dx: -1, dz: 0 });
    // And it's a valid cardinal.
    const cardinal = JSON.stringify(mover.queuedDirection);
    expect(["{\"dx\":1,\"dz\":0}", "{\"dx\":0,\"dz\":1}", "{\"dx\":0,\"dz\":-1}"]).toContain(cardinal);
  });

  it("flees out of a danger cell when in a bomb's blast radius", () => {
    const world = new World();
    addBot(world, "bot.1", 3, 3);
    // Bomb 2 cells west — its blast (range 2) reaches the bot's cell.
    addBomb(world, "bomb.w", 1, 3, 2);
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    world.setComponent("bot.1", "BotBrain", { aggression: 0, nextDecisionIn: 0 });
    const ai = createKaboomBotAISystem({ occupancy: occ, seed: 1 });
    ai.fixedUpdate!(ctx(world));
    const mover = world.getComponent("bot.1", "GridMover") as { queuedDirection: { dx: number; dz: number } };
    // The danger axis is +/- X (same row as the bomb). A perpendicular
    // move (Z direction) escapes the blast row.
    expect(Math.abs(mover.queuedDirection.dz)).toBe(1);
    expect(mover.queuedDirection.dx).toBe(0);
  });

  it("never drops a bomb when aggression=0", () => {
    const world = new World();
    addBot(world, "bot.1", 3, 3, 0);
    addWall(world, "soft", 4, 3); // simulate a soft block via movement-blocking-only occupant
    world.setComponent("soft", "GridOccupant", { layer: "block", blocksMovement: true, blocksBlast: false });
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    world.setComponent("bot.1", "BotBrain", { aggression: 0, nextDecisionIn: 0 });
    const ai = createKaboomBotAISystem({ occupancy: occ, seed: 1 });
    ai.fixedUpdate!(ctx(world));
    expect(world.hasComponent("bot.1", "PlaceBombRequest")).toBe(false);
  });

  it("aggression=1 drops a bomb when a soft block is adjacent", () => {
    const world = new World();
    addBot(world, "bot.1", 3, 3, 1);
    // Soft block in the +X direction.
    world.addEntity("soft");
    world.setComponent("soft", "GridPosition", { gx: 4, gz: 3 });
    world.setComponent("soft", "GridOccupant", { layer: "block", blocksMovement: true, blocksBlast: false });
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    world.setComponent("bot.1", "BotBrain", { aggression: 1, nextDecisionIn: 0 });
    const ai = createKaboomBotAISystem({ occupancy: occ, seed: 1 });
    ai.fixedUpdate!(ctx(world));
    expect(world.hasComponent("bot.1", "PlaceBombRequest")).toBe(true);
  });

  it("skips dead bots", () => {
    const world = new World();
    addBot(world, "bot.1", 3, 3);
    world.setComponent("bot.1", "BomberStats", { maxBombs: 1, range: 2, alive: false });
    world.setComponent("bot.1", "BotBrain", { aggression: 1, nextDecisionIn: 0 });
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const ai = createKaboomBotAISystem({ occupancy: occ, seed: 1 });
    ai.fixedUpdate!(ctx(world));
    const mover = world.getComponent("bot.1", "GridMover") as { queuedDirection?: unknown };
    expect(mover.queuedDirection).toBeUndefined();
  });
});
