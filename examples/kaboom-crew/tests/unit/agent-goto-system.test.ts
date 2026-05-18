// S82 KABOOM-AGENT-CONTROLS unit tests for the AgentGotoSystem.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createKaboomAgentGotoSystem } from "../../src/systems/agent-goto-system";

function ctx(world: World) {
  return {
    world,
    time: { elapsed: 0, dt: 1 / 60, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  };
}

function setupEntity(world: World, gx: number, gz: number, targetGx: number, targetGz: number): void {
  world.addEntity("player");
  world.setComponent("player", "GridPosition", { gx, gz });
  world.setComponent("player", "GridMover", { speed: 4, currentLerp: 0 });
  world.setComponent("player", "AgentGoto", { targetGx, targetGz });
}

describe("createKaboomAgentGotoSystem (S82 KABOOM-AGENT-CONTROLS)", () => {
  it("writes +X queuedDirection when the target is east", () => {
    const world = new World();
    setupEntity(world, 1, 1, 5, 1);
    const system = createKaboomAgentGotoSystem();
    system.frameUpdate!(ctx(world));
    const mover = world.getComponent("player", "GridMover") as { queuedDirection: { dx: number; dz: number } };
    expect(mover.queuedDirection).toEqual({ dx: 1, dz: 0 });
  });

  it("writes -Z queuedDirection when the target is north (same column, smaller gz)", () => {
    const world = new World();
    setupEntity(world, 5, 5, 5, 2);
    const system = createKaboomAgentGotoSystem();
    system.frameUpdate!(ctx(world));
    const mover = world.getComponent("player", "GridMover") as { queuedDirection: { dx: number; dz: number } };
    expect(mover.queuedDirection).toEqual({ dx: 0, dz: -1 });
  });

  it("prefers reducing |dx| first when both axes differ", () => {
    const world = new World();
    setupEntity(world, 1, 1, 7, 9);
    const system = createKaboomAgentGotoSystem();
    system.frameUpdate!(ctx(world));
    const mover = world.getComponent("player", "GridMover") as { queuedDirection: { dx: number; dz: number } };
    expect(mover.queuedDirection).toEqual({ dx: 1, dz: 0 });
  });

  it("clears AgentGoto + stops motion when the entity has arrived", () => {
    const world = new World();
    setupEntity(world, 4, 7, 4, 7);
    const system = createKaboomAgentGotoSystem();
    system.frameUpdate!(ctx(world));
    expect(world.hasComponent("player", "AgentGoto")).toBe(false);
    const mover = world.getComponent("player", "GridMover") as { queuedDirection: { dx: number; dz: number } };
    expect(mover.queuedDirection).toEqual({ dx: 0, dz: 0 });
  });

  it("entities without AgentGoto are left alone", () => {
    const world = new World();
    world.addEntity("ghost");
    world.setComponent("ghost", "GridPosition", { gx: 3, gz: 3 });
    world.setComponent("ghost", "GridMover", { speed: 4, currentLerp: 0 });
    const system = createKaboomAgentGotoSystem();
    system.frameUpdate!(ctx(world));
    const mover = world.getComponent("ghost", "GridMover") as { queuedDirection?: unknown };
    expect(mover.queuedDirection).toBeUndefined();
  });

  it("only re-stamps queuedDirection when it actually changes", () => {
    const world = new World();
    setupEntity(world, 1, 1, 5, 1);
    const system = createKaboomAgentGotoSystem();
    system.frameUpdate!(ctx(world));
    const after1 = world.getComponent("player", "GridMover");
    system.frameUpdate!(ctx(world));
    const after2 = world.getComponent("player", "GridMover");
    expect(after1).toBe(after2);
  });
});
