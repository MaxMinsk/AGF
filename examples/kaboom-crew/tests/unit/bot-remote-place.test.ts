// S221 KABOOM-BOT-REMOTE-PLACE (GDP-2026-05-29-009 REMOTE slice).
// Bot with `remoteDetonateCharges > 0` and an alive enemy already
// inside the would-be bomb's blast radius from its CURRENT cell
// drops a bomb. Pure trap-with-trigger setup: S204
// `shouldRemoteDetonate` fires on the next tick as long as the
// enemy stays in range.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";

import {
  createKaboomBotAISystem,
  wouldKillEnemyAt
} from "../../src/systems/bot-ai-system";

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
  remoteCharges: number,
  range = 3
): void {
  world.addEntity(id);
  world.setComponent(id, "BomberStats", {
    maxBombs: 1,
    range,
    activeBombs: 0,
    alive: true,
    remoteDetonateCharges: remoteCharges
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

describe("kaboom bot tactical remote placement (S221)", () => {
  it("wouldKillEnemyAt: enemy on the same row within range → true", () => {
    const world = new World();
    setupEnemy(world, "player.1", 6, 5);
    expect(wouldKillEnemyAt(world, "bot.1", { gx: 5, gz: 5 }, 2)).toBe(true);
  });

  it("wouldKillEnemyAt: enemy out of range → false", () => {
    const world = new World();
    setupEnemy(world, "player.1", 9, 5);
    expect(wouldKillEnemyAt(world, "bot.1", { gx: 5, gz: 5 }, 2)).toBe(false);
  });

  it("wouldKillEnemyAt: only alive enemies count", () => {
    const world = new World();
    setupEnemy(world, "player.1", 6, 5);
    world.setComponent("player.1", "BomberStats", { maxBombs: 1, range: 2, alive: false });
    expect(wouldKillEnemyAt(world, "bot.1", { gx: 5, gz: 5 }, 2)).toBe(false);
  });

  it("wouldKillEnemyAt: self is not an enemy (no self-trap)", () => {
    const world = new World();
    world.addEntity("bot.1");
    world.setComponent("bot.1", "BomberStats", { maxBombs: 1, range: 2, alive: true });
    world.setComponent("bot.1", "GridPosition", { gx: 5, gz: 5 });
    expect(wouldKillEnemyAt(world, "bot.1", { gx: 5, gz: 5 }, 2)).toBe(false);
  });

  it("bot with remoteDetonateCharges>0 + enemy in range → emits PlaceBombRequest", () => {
    const world = new World();
    setupBot(world, "bot.1", 5, 5, 1, 3);
    setupEnemy(world, "player.1", 7, 5);
    const sys = createKaboomBotAISystem({ occupancy: NEVER_BLOCK, seed: 1 });
    sys.fixedUpdate!(ctx(world));
    expect(hasPlaceRequest(world, "bot.1")).toBe(true);
  });

  it("bot WITHOUT remote charges + same setup → does NOT bomb (no soft block adjacent, no boost)", () => {
    const world = new World();
    setupBot(world, "bot.1", 5, 5, 0, 3);
    setupEnemy(world, "player.1", 7, 5);
    const sys = createKaboomBotAISystem({ occupancy: NEVER_BLOCK, seed: 1 });
    sys.fixedUpdate!(ctx(world));
    expect(hasPlaceRequest(world, "bot.1")).toBe(false);
  });

  it("bot with remote charges but enemy OUT of range → does NOT bomb", () => {
    const world = new World();
    setupBot(world, "bot.1", 5, 5, 1, 2);
    setupEnemy(world, "player.1", 10, 5);
    const sys = createKaboomBotAISystem({ occupancy: NEVER_BLOCK, seed: 1 });
    sys.fixedUpdate!(ctx(world));
    expect(hasPlaceRequest(world, "bot.1")).toBe(false);
  });
});
