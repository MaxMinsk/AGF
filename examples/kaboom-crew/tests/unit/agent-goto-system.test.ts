// S82 KABOOM-AGENT-CONTROLS + KABOOM-AGENT-PATHFIND unit tests.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { bfsFirstStep, createKaboomAgentGotoSystem } from "../../src/systems/agent-goto-system";

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

  it("writes AgentGotoResult with outcome='arrived' on arrival", () => {
    const world = new World();
    setupEntity(world, 4, 7, 4, 7);
    const system = createKaboomAgentGotoSystem();
    system.frameUpdate!(ctx(world));
    const result = world.getComponent("player", "AgentGotoResult") as {
      outcome: string;
      finalGx: number;
      finalGz: number;
      targetGx: number;
      targetGz: number;
    };
    expect(result.outcome).toBe("arrived");
    expect(result.finalGx).toBe(4);
    expect(result.finalGz).toBe(7);
  });

  it("flags target as unreachable when it sits outside the grid bounds", () => {
    const world = new World();
    setupEntity(world, 1, 1, 5, 20);
    // Engine grid singleton — type GridConfig, stored under the "Grid"
    // component name (same convention as grid-movement-system).
    world.addEntity("grid.config");
    world.setComponent("grid.config", "Grid", { cellSize: 1, sizeX: 15, sizeZ: 11 });
    const system = createKaboomAgentGotoSystem();
    system.frameUpdate!(ctx(world));
    expect(world.hasComponent("player", "AgentGoto")).toBe(false);
    const result = world.getComponent("player", "AgentGotoResult") as { outcome: string };
    expect(result.outcome).toBe("unreachable");
  });

  it("flags target as unreachable when occupancy reports it blocked", () => {
    const world = new World();
    setupEntity(world, 1, 1, 5, 5);
    const blockedCells = new Set(["5,5"]);
    const occupancy = {
      occupants: () => [],
      blocked: (gx: number, gz: number) => blockedCells.has(`${gx},${gz}`),
      occupiedCells: () => []
    };
    const system = createKaboomAgentGotoSystem({ occupancy });
    system.frameUpdate!(ctx(world));
    expect(world.hasComponent("player", "AgentGoto")).toBe(false);
    const result = world.getComponent("player", "AgentGotoResult") as { outcome: string; finalGx: number; finalGz: number };
    expect(result.outcome).toBe("unreachable");
    expect(result.finalGx).toBe(1);
    expect(result.finalGz).toBe(1);
  });

  it("flags target as stuck when no progress for stuckGraceFrames", () => {
    const world = new World();
    setupEntity(world, 1, 1, 5, 1);
    const system = createKaboomAgentGotoSystem({ stuckGraceFrames: 3 });
    // Frame 1 — initial tracker, no progress yet (we haven't moved).
    system.frameUpdate!(ctx(world));
    expect(world.hasComponent("player", "AgentGoto")).toBe(true);
    // Three more frames without moving — counter hits stuckGraceFrames.
    system.frameUpdate!(ctx(world));
    system.frameUpdate!(ctx(world));
    system.frameUpdate!(ctx(world));
    expect(world.hasComponent("player", "AgentGoto")).toBe(false);
    const result = world.getComponent("player", "AgentGotoResult") as { outcome: string };
    expect(result.outcome).toBe("stuck");
  });

  it("resets the stuck counter when Manhattan distance decreases", () => {
    const world = new World();
    setupEntity(world, 1, 1, 5, 1);
    const system = createKaboomAgentGotoSystem({ stuckGraceFrames: 3 });
    system.frameUpdate!(ctx(world));
    system.frameUpdate!(ctx(world));
    // Simulate GridMovement advancing the entity by one cell — progress.
    world.setComponent("player", "GridPosition", { gx: 2, gz: 1 });
    system.frameUpdate!(ctx(world));
    // After progress, we should NOT be stuck even though several frames passed.
    expect(world.hasComponent("player", "AgentGoto")).toBe(true);
  });
});

describe("bfsFirstStep (S82 KABOOM-AGENT-PATHFIND)", () => {
  const open = () => false;

  it("returns {0,0} when start equals target", () => {
    const step = bfsFirstStep(3, 3, 3, 3, { sizeX: 10, sizeZ: 10 }, open);
    expect(step).toEqual({ dx: 0, dz: 0 });
  });

  it("on an empty grid, first step is +x toward an eastern target", () => {
    const step = bfsFirstStep(1, 1, 5, 1, { sizeX: 10, sizeZ: 10 }, open);
    // BFS explores cardinals in DIRECTIONS order — +x is first, so a
    // straight east target picks +x.
    expect(step).toEqual({ dx: 1, dz: 0 });
  });

  it("walks around a wall blocking the straight path", () => {
    // Direct neighbour (2,1) is walled — BFS must NOT pick +x as the
    // first step (it would be blocked). Only +z, -z or -x are open.
    // -x walks west (away from a target to the east, longer path), so
    // the optimal first step is +z.
    const wall = new Set(["2,1"]);
    const isBlocked = (gx: number, gz: number) => wall.has(`${gx},${gz}`);
    const step = bfsFirstStep(1, 1, 4, 1, { sizeX: 6, sizeZ: 6 }, isBlocked);
    expect(step?.dx).toBe(0);
    // Either +z or -z is fine; +z is what BFS picks because it enumerates
    // cardinals in (+x, -x, +z, -z) order — +x blocked, -x blocked by
    // bounds (gx=0 is open but -x lengthens the path), +z wins.
    expect(step?.dz).toBe(1);
  });

  it("returns undefined when the target is fully walled off", () => {
    // Sealing target (4,4) by walls at (3,4) (4,3) (5,4) (4,5).
    const wall = new Set(["3,4", "4,3", "5,4", "4,5"]);
    const isBlocked = (gx: number, gz: number) => wall.has(`${gx},${gz}`);
    const step = bfsFirstStep(1, 1, 4, 4, { sizeX: 8, sizeZ: 8 }, isBlocked);
    expect(step).toBeUndefined();
  });

  it("BFS-end-game: AgentGotoSystem uses BFS when occupancy + Grid are wired", () => {
    // Real system test — wire occupancy with a wall blocking the
    // straight-line route + a detour via gz=2.
    const world = new World();
    world.addEntity("grid.config");
    world.setComponent("grid.config", "Grid", { cellSize: 1, sizeX: 6, sizeZ: 6 });
    setupEntity(world, 1, 1, 4, 1);
    const blocked = new Set(["2,1", "3,1"]); // walls between us + target
    const occupancy = {
      occupants: () => [],
      blocked: (gx: number, gz: number) => blocked.has(`${gx},${gz}`),
      occupiedCells: () => []
    };
    const system = createKaboomAgentGotoSystem({ occupancy });
    system.frameUpdate!(ctx(world));
    const mover = world.getComponent("player", "GridMover") as { queuedDirection: { dx: number; dz: number } };
    // Cannot go +x (blocked), so the BFS first step is +z (south detour).
    expect(mover.queuedDirection).toEqual({ dx: 0, dz: 1 });
  });

  it("BFS-end-game: AgentGotoSystem reports unreachable when no path exists", () => {
    const world = new World();
    world.addEntity("grid.config");
    world.setComponent("grid.config", "Grid", { cellSize: 1, sizeX: 6, sizeZ: 6 });
    setupEntity(world, 1, 1, 4, 4);
    // Wall off (4,4) on all four sides.
    const sealed = new Set(["3,4", "4,3", "5,4", "4,5"]);
    const occupancy = {
      occupants: () => [],
      blocked: (gx: number, gz: number) => sealed.has(`${gx},${gz}`),
      occupiedCells: () => []
    };
    const system = createKaboomAgentGotoSystem({ occupancy });
    system.frameUpdate!(ctx(world));
    expect(world.hasComponent("player", "AgentGoto")).toBe(false);
    const result = world.getComponent("player", "AgentGotoResult") as { outcome: string };
    expect(result.outcome).toBe("unreachable");
  });
});
