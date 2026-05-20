// S90 KABOOM-MINIMAP-DANGER-OVERLAY.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createGridOccupancySystem } from "../../../../engine/core/systems/grid-occupancy-system";
import { projectedBlastCells } from "../../src/danger";

function ctx(world: World) {
  return {
    world,
    time: { elapsed: 0, dt: 1 / 60, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  };
}

function addBomb(world: World, id: string, gx: number, gz: number, range = 2): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "GridOccupant", { layer: "bomb", blocksMovement: false, blocksBlast: false });
  world.setComponent(id, "Bomb", { fuseRemaining: 1, range, ownerId: "player.1" });
}

function addHardWall(world: World, id: string, gx: number, gz: number): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "GridOccupant", { layer: "wall", blocksMovement: true, blocksBlast: true });
}

describe("projectedBlastCells (S90 KABOOM-MINIMAP-DANGER-OVERLAY)", () => {
  it("returns the origin + the four cardinal arms up to bomb range", () => {
    const world = new World();
    addBomb(world, "b.1", 5, 5, 2);
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const cells = projectedBlastCells(world, occ);
    const keys = new Set(cells.map((c) => `${c.gx},${c.gz}`));
    // Origin + 2 cells in each cardinal = 1 + 8 = 9.
    expect(keys.has("5,5")).toBe(true);
    expect(keys.has("6,5")).toBe(true);
    expect(keys.has("7,5")).toBe(true);
    expect(keys.has("3,5")).toBe(true);
    expect(keys.has("4,5")).toBe(true);
    expect(keys.has("5,4")).toBe(true);
    expect(keys.has("5,3")).toBe(true);
    expect(keys.has("5,6")).toBe(true);
    expect(keys.has("5,7")).toBe(true);
    expect(keys.size).toBe(9);
  });

  it("stops at a hard wall — wall cell + beyond are NOT included", () => {
    const world = new World();
    addBomb(world, "b.1", 5, 5, 3);
    addHardWall(world, "wall.east", 7, 5); // hard wall east, blocks blast at (7,5)
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const cells = projectedBlastCells(world, occ);
    const keys = new Set(cells.map((c) => `${c.gx},${c.gz}`));
    expect(keys.has("6,5")).toBe(true);   // before wall
    expect(keys.has("7,5")).toBe(false);  // wall itself
    expect(keys.has("8,5")).toBe(false);  // beyond wall
  });

  it("dedupes overlapping arms from multiple bombs", () => {
    const world = new World();
    addBomb(world, "b.1", 5, 5, 1);
    addBomb(world, "b.2", 7, 5, 1);
    const occ = createGridOccupancySystem();
    occ.frameUpdate!(ctx(world));
    const cells = projectedBlastCells(world, occ);
    const keys = new Set(cells.map((c) => `${c.gx},${c.gz}`));
    // Bomb 1: (5,5) + (4,5) (6,5) (5,4) (5,6) = 5
    // Bomb 2: (7,5) + (6,5) (8,5) (7,4) (7,6) = 5
    // (6,5) overlaps → union 9.
    expect(keys.size).toBe(9);
  });
});
