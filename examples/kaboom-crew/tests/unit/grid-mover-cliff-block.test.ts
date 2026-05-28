// S173 GDP-2026-05-28-010 — bomber walking refuses to cross a cliff
// edge. The engine grid-movement-system consults the Heightmap
// singleton via engine/grid/height-query and treats height-deltas
// between cardinal-adjacent cells as impassable (same outcome as a
// hard wall) until Ramps land in GDP-2026-05-28-011.

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

function buildWorld(heightmap?: number[][]): World {
  const world = new World();
  world.addEntity("grid.config");
  world.setComponent("grid.config", GRID, {
    cellSize: 1,
    sizeX: 8,
    sizeZ: 8,
    originX: 0,
    originZ: 0
  });
  if (heightmap !== undefined) {
    world.setComponent("grid.config", "Heightmap", { values: heightmap });
  }
  return world;
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

describe("grid-mover cliff block (S173)", () => {
  it("bomber walking east into a +2 cliff never commits to the plateau cell (lane-assist may pick a perpendicular flat fallback, but the eastern cliff cell is impassable)", () => {
    // Plateau column at gx=2 height 2; everything else flat. Lane-assist
    // will try the east cardinal first (refused by cliff), then the
    // perpendiculars (1,2) and (1,4) which are flat 0 == origin 0 — so
    // a fallback move is legal. We assert the bomber never ends up on
    // the plateau column.
    const heightmap: number[][] = [];
    for (let gz = 0; gz < 8; gz += 1) {
      const row: number[] = [];
      for (let gx = 0; gx < 8; gx += 1) {
        row.push(gx === 2 ? 2 : 0);
      }
      heightmap.push(row);
    }
    const world = buildWorld(heightmap);
    addMover(world, "bomber", 1, 3, { dx: 1, dz: 0 });

    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const mover = createGridMovementSystem({ occupancy: occ });
    mover.frameUpdate!(ctx(world));

    const m = world.getComponent<{ targetGx?: number; targetGz?: number }>("bomber", GRID_MOVER);
    // The eastern cliff is never crossed — targetGx is never set to 2.
    if (m?.targetGx !== undefined) {
      expect(m.targetGx).not.toBe(2);
    }
  });

  it("bomber walking east into a +2 cliff with no perpendicular fallback stays put", () => {
    // Surround the bomber with cliffs on east AND perpendiculars so the
    // lane-assist has no legal cardinal to pick. Bomber must stay put.
    // Cells differ from origin: (2,3) height 2 (east cliff), (1,2)
    // height 2 (north cliff), (1,4) height 2 (south cliff). Bomber at
    // (1,3) height 0.
    const heightmap: number[][] = [];
    for (let gz = 0; gz < 8; gz += 1) {
      const row: number[] = [];
      for (let gx = 0; gx < 8; gx += 1) {
        row.push(0);
      }
      heightmap.push(row);
    }
    heightmap[3]![2] = 2; // east
    heightmap[2]![1] = 2; // north (gz=2, gx=1)
    heightmap[4]![1] = 2; // south
    const world = buildWorld(heightmap);
    addMover(world, "bomber", 1, 3, { dx: 1, dz: 0 });

    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const mover = createGridMovementSystem({ occupancy: occ });
    mover.frameUpdate!(ctx(world));

    const pos = world.getComponent<{ gx: number; gz: number }>("bomber", GRID_POSITION);
    const m = world.getComponent<{ targetGx?: number; targetGz?: number }>("bomber", GRID_MOVER);
    expect(pos).toEqual({ gx: 1, gz: 3 });
    expect(m?.targetGx).toBeUndefined();
    expect(m?.targetGz).toBeUndefined();
  });

  it("bomber on plateau can't step down (-2 cliff is symmetric)", () => {
    const heightmap: number[][] = [];
    for (let gz = 0; gz < 8; gz += 1) {
      const row: number[] = [];
      for (let gx = 0; gx < 8; gx += 1) {
        row.push(gx === 2 ? 2 : 0);
      }
      heightmap.push(row);
    }
    const world = buildWorld(heightmap);
    // Bomber on plateau cell (2, 3); attempts to walk west to flat (1, 3).
    addMover(world, "bomber", 2, 3, { dx: -1, dz: 0 });

    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const mover = createGridMovementSystem({ occupancy: occ });
    mover.frameUpdate!(ctx(world));

    const pos = world.getComponent<{ gx: number; gz: number }>("bomber", GRID_POSITION);
    expect(pos).toEqual({ gx: 2, gz: 3 });
  });

  it("bomber walks normally across same-height cells (flat plain)", () => {
    const world = buildWorld(); // no heightmap → flat
    addMover(world, "bomber", 1, 3, { dx: 1, dz: 0 });

    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const mover = createGridMovementSystem({ occupancy: occ });
    mover.frameUpdate!(ctx(world));

    const m = world.getComponent<{ targetGx?: number; targetGz?: number }>("bomber", GRID_MOVER);
    // Motion was committed: targetGx/targetGz point at the eastern neighbour.
    expect(m?.targetGx).toBe(2);
    expect(m?.targetGz).toBe(3);
  });

  it("lane-assist does not bypass a cliff: perpendicular cells across the cliff are also refused", () => {
    // L-shaped cliff: gx>=2 is height 2. Bomber at (1, 3) holding east is
    // refused; perpendicular fallback north (1, 2) is height 0 same as
    // origin, so lane-assist legitimately commits there. We want to make
    // sure the cliff doesn't silently allow movement.
    const heightmap: number[][] = [];
    for (let gz = 0; gz < 8; gz += 1) {
      const row: number[] = [];
      for (let gx = 0; gx < 8; gx += 1) {
        row.push(gx >= 2 ? 2 : 0);
      }
      heightmap.push(row);
    }
    const world = buildWorld(heightmap);
    addMover(world, "bomber", 1, 3, { dx: 1, dz: 0 });

    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const mover = createGridMovementSystem({ occupancy: occ });
    mover.frameUpdate!(ctx(world));

    const m = world.getComponent<{ targetGx?: number; targetGz?: number }>("bomber", GRID_MOVER);
    // The eastern cell (2,3) is across the cliff; perpendicular fallbacks
    // (1,2) and (1,4) are at the SAME height (0) as origin (1,3) so
    // lane-assist picks one of them. We don't care which fallback —
    // we care that the bomber never lands on the plateau (gx >= 2).
    if (m?.targetGx !== undefined) {
      expect(m.targetGx).toBeLessThan(2);
    }
  });
});
