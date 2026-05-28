// S174 GDP-2026-05-28-011 — Ramps. The engine grid-movement-system now
// consults `isPassableEdge` (cliff-aware + ramp-aware) instead of the
// raw `isCliffEdge`. Bombers can step from H=0 onto a ramp cell, and
// from the ramp cell onto the H=1 to-cell.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import {
  GRID,
  GRID_MOVER,
  GRID_POSITION,
  TRANSFORM,
  createGridMovementSystem
} from "../../../../engine/core/systems/grid-movement-system";
import { createGridOccupancySystem } from "../../../../engine/core/systems/grid-occupancy-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  };
}

function buildWorld(heightmap: number[][]): World {
  const world = new World();
  world.addEntity("grid.config");
  world.setComponent("grid.config", GRID, {
    cellSize: 1,
    sizeX: 12,
    sizeZ: 12,
    originX: 0,
    originZ: 0
  });
  world.setComponent("grid.config", "Heightmap", { values: heightmap });
  return world;
}

function addRamp(
  world: World,
  id: string,
  gx: number,
  gz: number,
  fromHeight: number,
  toHeight: number,
  direction: "N" | "E" | "S" | "W"
): void {
  world.addEntity(id);
  world.setComponent(id, GRID_POSITION, { gx, gz });
  world.setComponent(id, "Ramp", { fromHeight, toHeight, direction });
}

function addMover(world: World, id: string, gx: number, gz: number, direction: { dx: number; dz: number }): void {
  world.addEntity(id);
  world.setComponent(id, GRID_POSITION, { gx, gz });
  world.setComponent(id, TRANSFORM, { position: [gx, 0.5, gz], rotation: [0, 0, 0], scale: [1, 1, 1] });
  world.setComponent(id, GRID_MOVER, {
    speed: 4,
    queuedDirection: direction,
    currentLerp: 0
  });
}

describe("grid mover walks ramp (S174)", () => {
  it("bomber on a flat cell steps onto a ramp cell (cliff edge → suppressed by ramp)", () => {
    // Plateau column at gx >= 5 height 1; ramp at (gx=4, gz=5) bridges
    // (4,5) → (5,5). Bomber at (3, 5) walking east should be allowed to
    // commit to (4, 5) — the ramp cell.
    const heightmap: number[][] = [];
    for (let gz = 0; gz < 12; gz += 1) {
      const row: number[] = [];
      for (let gx = 0; gx < 12; gx += 1) {
        row.push(gx >= 5 ? 1 : 0);
      }
      heightmap.push(row);
    }
    const world = buildWorld(heightmap);
    addRamp(world, "ramp.east", 4, 5, 0, 1, "E");
    addMover(world, "bomber", 3, 5, { dx: 1, dz: 0 });

    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const mover = createGridMovementSystem({ occupancy: occ });
    mover.frameUpdate!(ctx(world));

    const m = world.getComponent<{ targetGx?: number; targetGz?: number }>("bomber", GRID_MOVER);
    expect(m?.targetGx).toBe(4);
    expect(m?.targetGz).toBe(5);
  });

  it("bomber on a ramp cell steps onto the plateau to-cell (ramp suppresses the +1 cliff)", () => {
    const heightmap: number[][] = [];
    for (let gz = 0; gz < 12; gz += 1) {
      const row: number[] = [];
      for (let gx = 0; gx < 12; gx += 1) {
        // (gx=4, gz=5) is the ramp cell at fromHeight=0; (gx=5, gz=5)
        // is the plateau at H=1.
        row.push(gx >= 5 ? 1 : 0);
      }
      heightmap.push(row);
    }
    const world = buildWorld(heightmap);
    addRamp(world, "ramp.east", 4, 5, 0, 1, "E");
    // Bomber on the ramp cell (4, 5) walking east → (5, 5).
    addMover(world, "bomber", 4, 5, { dx: 1, dz: 0 });

    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const mover = createGridMovementSystem({ occupancy: occ });
    mover.frameUpdate!(ctx(world));

    const m = world.getComponent<{ targetGx?: number; targetGz?: number }>("bomber", GRID_MOVER);
    expect(m?.targetGx).toBe(5);
    expect(m?.targetGz).toBe(5);
  });

  it("bomber descending the ramp (from plateau back to flat) is allowed", () => {
    const heightmap: number[][] = [];
    for (let gz = 0; gz < 12; gz += 1) {
      const row: number[] = [];
      for (let gx = 0; gx < 12; gx += 1) {
        row.push(gx >= 5 ? 1 : 0);
      }
      heightmap.push(row);
    }
    const world = buildWorld(heightmap);
    addRamp(world, "ramp.east", 4, 5, 0, 1, "E");
    // Bomber on plateau cell (5, 5) walking west → (4, 5).
    addMover(world, "bomber", 5, 5, { dx: -1, dz: 0 });

    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const mover = createGridMovementSystem({ occupancy: occ });
    mover.frameUpdate!(ctx(world));

    const m = world.getComponent<{ targetGx?: number; targetGz?: number }>("bomber", GRID_MOVER);
    expect(m?.targetGx).toBe(4);
    expect(m?.targetGz).toBe(5);
  });

  it("the ramp does NOT bypass an unrelated cliff edge of the same cell pair", () => {
    // Row gz=4 has no ramp; (4,4) → (5,4) is still a cliff. The ramp
    // at (4,5) suppresses ONLY the (4,5) ↔ (5,5) edge.
    const heightmap: number[][] = [];
    for (let gz = 0; gz < 12; gz += 1) {
      const row: number[] = [];
      for (let gx = 0; gx < 12; gx += 1) {
        row.push(gx >= 5 ? 1 : 0);
      }
      heightmap.push(row);
    }
    const world = buildWorld(heightmap);
    addRamp(world, "ramp.east", 4, 5, 0, 1, "E");
    // Bomber on (4, 4) walking east → (5, 4) — cliff, not ramp.
    addMover(world, "bomber", 4, 4, { dx: 1, dz: 0 });

    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const mover = createGridMovementSystem({ occupancy: occ });
    mover.frameUpdate!(ctx(world));

    const m = world.getComponent<{ targetGx?: number; targetGz?: number }>("bomber", GRID_MOVER);
    // The eastern cliff is refused; lane-assist may still pick a
    // perpendicular flat cell. The hard assertion is the bomber never
    // commits to gx=5 on row gz=4.
    if (m?.targetGx !== undefined && m?.targetGz === 4) {
      expect(m.targetGx).not.toBe(5);
    }
  });
});
