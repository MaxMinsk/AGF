// S81 KABOOM-GRID-OCCUPANCY unit tests.

import { describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import {
  GRID_OCCUPANT,
  GRID_POSITION,
  createGridOccupancySystem,
  type GridOccupancySystemHandle
} from "../../engine/core/systems/grid-occupancy-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  };
}

function placeBlock(world: World, id: string, gx: number, gz: number, opts: { blocksMovement?: boolean; layer?: string } = {}): void {
  world.addEntity(id);
  world.setComponent(id, GRID_POSITION, { gx, gz });
  world.setComponent(id, GRID_OCCUPANT, {
    blocksMovement: opts.blocksMovement ?? true,
    layer: opts.layer ?? "default"
  });
}

function tick(system: GridOccupancySystemHandle, world: World): void {
  system.frameUpdate!(ctx(world));
}

describe("createGridOccupancySystem (S81 KABOOM-GRID-OCCUPANCY)", () => {
  it("indexes entities by cell after the first frame", () => {
    const world = new World();
    placeBlock(world, "block.a", 3, 5);
    placeBlock(world, "block.b", 3, 5);
    placeBlock(world, "block.c", 1, 1);
    const system = createGridOccupancySystem();
    tick(system, world);
    expect(system.occupants(3, 5).slice().sort()).toEqual(["block.a", "block.b"]);
    expect(system.occupants(1, 1)).toEqual(["block.c"]);
    expect(system.occupants(9, 9)).toEqual([]);
  });

  it("moving an entity updates both old + new cell occupancy", () => {
    const world = new World();
    placeBlock(world, "mover", 0, 0);
    const system = createGridOccupancySystem();
    tick(system, world);
    expect(system.occupants(0, 0)).toEqual(["mover"]);
    world.setComponent("mover", GRID_POSITION, { gx: 4, gz: 2 });
    tick(system, world);
    expect(system.occupants(0, 0)).toEqual([]);
    expect(system.occupants(4, 2)).toEqual(["mover"]);
  });

  it("removeEntity clears all cells it was occupying", () => {
    const world = new World();
    placeBlock(world, "ghost", 7, 7);
    const system = createGridOccupancySystem();
    tick(system, world);
    expect(system.occupants(7, 7)).toEqual(["ghost"]);
    world.removeEntity("ghost");
    tick(system, world);
    expect(system.occupants(7, 7)).toEqual([]);
  });

  it("layer filter only returns occupants with the matching GridOccupant.layer", () => {
    const world = new World();
    placeBlock(world, "wall", 2, 2, { layer: "wall" });
    placeBlock(world, "pickup", 2, 2, { layer: "pickup", blocksMovement: false });
    const system = createGridOccupancySystem();
    tick(system, world);
    expect(system.occupants(2, 2).slice().sort()).toEqual(["pickup", "wall"]);
    expect(system.occupants(2, 2, "wall")).toEqual(["wall"]);
    expect(system.occupants(2, 2, "pickup")).toEqual(["pickup"]);
    expect(system.occupants(2, 2, "missing")).toEqual([]);
  });

  it("blocked() honours the movement / blast predicate", () => {
    const world = new World();
    world.addEntity("brick");
    world.setComponent("brick", GRID_POSITION, { gx: 0, gz: 0 });
    world.setComponent("brick", GRID_OCCUPANT, { blocksMovement: true, blocksBlast: false });
    world.addEntity("smoke");
    world.setComponent("smoke", GRID_POSITION, { gx: 1, gz: 0 });
    world.setComponent("smoke", GRID_OCCUPANT, { blocksMovement: false, blocksBlast: true });
    const system = createGridOccupancySystem();
    tick(system, world);
    expect(system.blocked(0, 0, "movement")).toBe(true);
    expect(system.blocked(0, 0, "blast")).toBe(false);
    expect(system.blocked(1, 0, "movement")).toBe(false);
    expect(system.blocked(1, 0, "blast")).toBe(true);
    expect(system.blocked(2, 0)).toBe(false);
  });

  it("incremental tick matches a fresh-rebuild from scratch (parity)", () => {
    // The system rebuilds the index every frame, so 'incremental' here
    // simply means "tick called multiple times across mutations". The
    // parity assertion is that the final state matches what a brand
    // new system instance produces against the same world.
    const world = new World();
    placeBlock(world, "a", 0, 0);
    placeBlock(world, "b", 5, 5);
    placeBlock(world, "c", 9, 9);
    const sysA = createGridOccupancySystem();
    tick(sysA, world);
    world.setComponent("b", GRID_POSITION, { gx: 5, gz: 6 });
    tick(sysA, world);
    world.removeEntity("c");
    placeBlock(world, "d", 3, 3);
    tick(sysA, world);

    const sysB = createGridOccupancySystem();
    tick(sysB, world);
    const cellsA = sysA.occupiedCells().map((c) => `${c.gx},${c.gz}=${c.count}`).slice().sort();
    const cellsB = sysB.occupiedCells().map((c) => `${c.gx},${c.gz}=${c.count}`).slice().sort();
    expect(cellsA).toEqual(cellsB);
  });

  it("world swap drops the cached query handle (HMR + replay safety)", () => {
    const world1 = new World();
    placeBlock(world1, "x", 1, 1);
    const system = createGridOccupancySystem();
    tick(system, world1);
    expect(system.occupants(1, 1)).toEqual(["x"]);

    const world2 = new World();
    placeBlock(world2, "y", 2, 2);
    tick(system, world2);
    expect(system.occupants(1, 1)).toEqual([]);
    expect(system.occupants(2, 2)).toEqual(["y"]);
  });
});
