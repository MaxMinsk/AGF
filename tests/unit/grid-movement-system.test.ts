// S81 KABOOM-GRID-MOVER unit tests.

import { describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import {
  GRID_OCCUPANT,
  GRID_POSITION,
  createGridOccupancySystem
} from "../../engine/core/systems/grid-occupancy-system";
import {
  GRID,
  GRID_MOVER,
  TRANSFORM,
  createGridMovementSystem
} from "../../engine/core/systems/grid-movement-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  };
}

function buildWorld(gridSize = 5): World {
  const world = new World();
  world.addEntity("grid.config");
  world.setComponent("grid.config", GRID, { cellSize: 1, sizeX: gridSize, sizeZ: gridSize, originX: 0, originZ: 0 });
  return world;
}

function addMover(world: World, id: string, gx: number, gz: number, opts: { speed?: number; direction?: { dx: number; dz: number } } = {}): void {
  world.addEntity(id);
  world.setComponent(id, GRID_POSITION, { gx, gz });
  world.setComponent(id, TRANSFORM, { position: [gx, 0.5, gz], rotation: [0, 0, 0], scale: [1, 1, 1] });
  world.setComponent(id, GRID_MOVER, {
    speed: opts.speed ?? 4,
    queuedDirection: opts.direction,
    currentLerp: 0
  });
}

function addBlock(world: World, id: string, gx: number, gz: number): void {
  world.addEntity(id);
  world.setComponent(id, GRID_POSITION, { gx, gz });
  world.setComponent(id, GRID_OCCUPANT, { blocksMovement: true });
}

describe("createGridMovementSystem (S81 KABOOM-GRID-MOVER)", () => {
  it("snaps Transform to the current cell when no queuedDirection is set", () => {
    const world = buildWorld();
    addMover(world, "player", 2, 2);
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const mover = createGridMovementSystem({ occupancy: occ });
    mover.frameUpdate!(ctx(world));
    const pos = (world.getComponent("player", TRANSFORM) as { position: number[] }).position;
    expect(pos[0]).toBeCloseTo(2, 4);
    expect(pos[2]).toBeCloseTo(2, 4);
  });

  it("moves the entity across a cell at the configured speed and snaps on arrival", () => {
    // speed = 4 cells/sec ⇒ 0.25 s per cell ⇒ 15 frames at 1/60.
    // Held queuedDirection means the mover keeps walking — after 20
    // frames it's mid-way across the SECOND cell. We assert the first
    // cell was reached (gx ≥ 1) and the cell-arrival snap fired.
    const world = buildWorld();
    addMover(world, "player", 0, 0, { speed: 4, direction: { dx: 1, dz: 0 } });
    const occ = createGridOccupancySystem();
    const mover = createGridMovementSystem({ occupancy: occ });
    for (let i = 0; i < 20; i++) {
      occ.frameUpdate!(ctx(world));
      mover.frameUpdate!(ctx(world));
    }
    const pos = world.getComponent("player", GRID_POSITION) as { gx: number; gz: number };
    expect(pos.gx).toBeGreaterThanOrEqual(1);
    expect(pos.gz).toBe(0);
    const transform = world.getComponent("player", TRANSFORM) as { position: number[] };
    expect(transform.position[0]).toBeGreaterThan(0.99);
  });

  it("mid-tween Transform position is between start and target", () => {
    const world = buildWorld();
    addMover(world, "player", 0, 0, { speed: 4, direction: { dx: 1, dz: 0 } });
    const occ = createGridOccupancySystem();
    const mover = createGridMovementSystem({ occupancy: occ });
    // 5 frames @ 1/60 = ~0.083 s, speed 4 ⇒ lerp ≈ 0.333.
    for (let i = 0; i < 5; i++) {
      occ.frameUpdate!(ctx(world));
      mover.frameUpdate!(ctx(world));
    }
    const pos = (world.getComponent("player", TRANSFORM) as { position: number[] }).position;
    expect(pos[0]).toBeGreaterThan(0);
    expect(pos[0]).toBeLessThan(1);
    // Still at the start cell — GridPosition hasn't snapped yet.
    const grid = world.getComponent("player", GRID_POSITION) as { gx: number; gz: number };
    expect(grid.gx).toBe(0);
  });

  it("lane-assist: a blocked queued direction falls back to a perpendicular cardinal", () => {
    const world = buildWorld();
    // Player at (1,1) wants to move +X but the cell at (2,1) is a wall.
    // Lane assist tries +Z (dx=0, dz=1) first → (1,2) is free, so motion
    // starts toward (1,2).
    addMover(world, "player", 1, 1, { speed: 4, direction: { dx: 1, dz: 0 } });
    addBlock(world, "wall", 2, 1);
    const occ = createGridOccupancySystem();
    const mover = createGridMovementSystem({ occupancy: occ });
    occ.frameUpdate!(ctx(world));
    mover.frameUpdate!(ctx(world));
    // After 1 frame the system has chosen a target. Tick until it commits.
    for (let i = 0; i < 25; i++) {
      occ.frameUpdate!(ctx(world));
      mover.frameUpdate!(ctx(world));
    }
    const pos = world.getComponent("player", GRID_POSITION) as { gx: number; gz: number };
    // The mover landed at one of the perpendicular cardinals (1,2 or 1,0).
    expect([JSON.stringify({ gx: 1, gz: 2 }), JSON.stringify({ gx: 1, gz: 0 })]).toContain(JSON.stringify(pos));
  });

  it("blocked + no lane-assist option (cornered) keeps the mover at its current cell", () => {
    const world = buildWorld(3);
    // Player at corner (0,0) wants +X. Block (1,0). Lane assist tries +Z
    // → (0,1) which is also blocked. Result: no motion.
    addMover(world, "player", 0, 0, { speed: 4, direction: { dx: 1, dz: 0 } });
    addBlock(world, "wall.x", 1, 0);
    addBlock(world, "wall.z", 0, 1);
    const occ = createGridOccupancySystem();
    const mover = createGridMovementSystem({ occupancy: occ });
    for (let i = 0; i < 30; i++) {
      occ.frameUpdate!(ctx(world));
      mover.frameUpdate!(ctx(world));
    }
    const pos = world.getComponent("player", GRID_POSITION) as { gx: number; gz: number };
    expect(pos).toEqual({ gx: 0, gz: 0 });
  });

  it("zero queuedDirection ({0,0}) does not start motion", () => {
    const world = buildWorld();
    addMover(world, "player", 2, 2, { speed: 4, direction: { dx: 0, dz: 0 } });
    const occ = createGridOccupancySystem();
    const mover = createGridMovementSystem({ occupancy: occ });
    for (let i = 0; i < 10; i++) {
      occ.frameUpdate!(ctx(world));
      mover.frameUpdate!(ctx(world));
    }
    const pos = world.getComponent("player", GRID_POSITION) as { gx: number; gz: number };
    expect(pos).toEqual({ gx: 2, gz: 2 });
  });

  it("no Grid singleton ⇒ system is a no-op (engine boot stays robust)", () => {
    const world = new World();
    addMover(world, "player", 0, 0, { speed: 4, direction: { dx: 1, dz: 0 } });
    const occ = createGridOccupancySystem();
    const mover = createGridMovementSystem({ occupancy: occ });
    expect(() => mover.frameUpdate!(ctx(world))).not.toThrow();
    const pos = world.getComponent("player", GRID_POSITION) as { gx: number; gz: number };
    expect(pos).toEqual({ gx: 0, gz: 0 });
  });
});
