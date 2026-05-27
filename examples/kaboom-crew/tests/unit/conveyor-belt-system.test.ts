// S146 KABOOM-CONVEYOR-BELT — unit tests for the new arena module.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createGridOccupancySystem } from "../../../../engine/core/systems/grid-occupancy-system";
import { createKaboomConveyorBeltSystem } from "../../src/systems/conveyor-belt-system";

const FIXED_DT = 1 / 60;

function ctx(world: World, fixedDt = FIXED_DT) {
  return { world, time: { elapsed: 0, dt: fixedDt, fixedDt, frameCount: 0, fixedStepCount: 0 } };
}

function addBelt(world: World, id: string, gx: number, gz: number, dx: number, dz: number, speedMs = 400): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "Transform", { position: [gx, 0.06, gz], rotation: [0, 0, 0], scale: [0.95, 0.05, 0.95] });
  world.setComponent(id, "ConveyorBelt", { directionDx: dx, directionDz: dz, speedMs });
}

function addBomber(world: World, id: string, gx: number, gz: number): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "Transform", { position: [gx, 0.4, gz], rotation: [0, 0, 0], scale: [0.4, 0.4, 0.4] });
  world.setComponent(id, "GridOccupant", { layer: id, blocksMovement: false, blocksBlast: false });
  world.setComponent(id, "BomberStats", { maxBombs: 1, range: 2, alive: true });
  world.setComponent(id, "GridMover", { speed: 4 });
}

function addBomb(world: World, id: string, gx: number, gz: number): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "Transform", { position: [gx, 0.35, gz], rotation: [0, 0, 0], scale: [0.35, 0.35, 0.35] });
  world.setComponent(id, "GridOccupant", { layer: "bomb", blocksMovement: false, blocksBlast: false });
  world.setComponent(id, "Bomb", { fuseRemaining: 2.0, range: 2, ownerId: "player.1" });
}

function addHardWall(world: World, id: string, gx: number, gz: number): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "GridOccupant", { layer: "wall", blocksMovement: true, blocksBlast: true });
}

/** Tick the belt system N times, refreshing the occupancy each call. */
function tickN(world: World, occ: ReturnType<typeof createGridOccupancySystem>, sys: ReturnType<typeof createKaboomConveyorBeltSystem>, n: number): void {
  for (let i = 0; i < n; i += 1) {
    occ.frameUpdate!(ctx(world));
    sys.fixedUpdate!(ctx(world));
  }
}

describe("createKaboomConveyorBeltSystem (S146)", () => {
  it("bomber on a +X belt drifts one cell after speedMs accumulates", () => {
    const world = new World();
    addBelt(world, "belt.east", 5, 5, 1, 0, 400);
    addBomber(world, "player.1", 5, 5);
    const occ = createGridOccupancySystem();
    const sys = createKaboomConveyorBeltSystem({ occupancy: occ });
    // 400 ms / (1000/60 ms per tick) = 24 ticks to hit the threshold.
    tickN(world, occ, sys, 25);
    const pos = world.getComponent<{ gx: number; gz: number }>("player.1", "GridPosition")!;
    expect(pos.gx).toBe(6);
    expect(pos.gz).toBe(5);
  });

  it("bomb on belt drifts the same way", () => {
    const world = new World();
    addBelt(world, "belt.east", 5, 5, 1, 0, 400);
    addBomb(world, "bomb.a", 5, 5);
    const occ = createGridOccupancySystem();
    const sys = createKaboomConveyorBeltSystem({ occupancy: occ });
    tickN(world, occ, sys, 25);
    const pos = world.getComponent<{ gx: number; gz: number }>("bomb.a", "GridPosition")!;
    expect(pos.gx).toBe(6);
    expect(pos.gz).toBe(5);
  });

  it("destination blocked by hard wall → push silently fails", () => {
    const world = new World();
    addBelt(world, "belt.east", 5, 5, 1, 0, 400);
    addBomber(world, "player.1", 5, 5);
    addHardWall(world, "wall.east", 6, 5);
    const occ = createGridOccupancySystem();
    const sys = createKaboomConveyorBeltSystem({ occupancy: occ });
    tickN(world, occ, sys, 25);
    const pos = world.getComponent<{ gx: number; gz: number }>("player.1", "GridPosition")!;
    expect(pos.gx).toBe(5); // unchanged
  });

  it("destination already holds a bomb → bomb push fails", () => {
    const world = new World();
    addBelt(world, "belt.east", 5, 5, 1, 0, 400);
    addBomb(world, "bomb.a", 5, 5);
    addBomb(world, "bomb.b", 6, 5);
    const occ = createGridOccupancySystem();
    const sys = createKaboomConveyorBeltSystem({ occupancy: occ });
    tickN(world, occ, sys, 25);
    const posA = world.getComponent<{ gx: number; gz: number }>("bomb.a", "GridPosition")!;
    expect(posA.gx).toBe(5); // stays put
  });

  it("sub-speedMs ticks don't push (timer accumulates)", () => {
    const world = new World();
    addBelt(world, "belt.east", 5, 5, 1, 0, 400);
    addBomber(world, "player.1", 5, 5);
    const occ = createGridOccupancySystem();
    const sys = createKaboomConveyorBeltSystem({ occupancy: occ });
    // 5 ticks ≈ 83ms — well under 400ms threshold.
    tickN(world, occ, sys, 5);
    const pos = world.getComponent<{ gx: number; gz: number }>("player.1", "GridPosition")!;
    expect(pos.gx).toBe(5);
    expect(pos.gz).toBe(5);
    // Belt's elapsedMs should have accumulated.
    const belt = world.getComponent<{ elapsedMs?: number }>("belt.east", "ConveyorBelt")!;
    expect(belt.elapsedMs).toBeGreaterThan(0);
    expect(belt.elapsedMs).toBeLessThan(400);
  });

  it("zero-vector belt is a no-op (defensive)", () => {
    const world = new World();
    addBelt(world, "belt.dead", 5, 5, 0, 0, 400);
    addBomber(world, "player.1", 5, 5);
    const occ = createGridOccupancySystem();
    const sys = createKaboomConveyorBeltSystem({ occupancy: occ });
    tickN(world, occ, sys, 25);
    const pos = world.getComponent<{ gx: number; gz: number }>("player.1", "GridPosition")!;
    expect(pos.gx).toBe(5);
    expect(pos.gz).toBe(5);
  });

  it("multiple belts deterministically push their own occupants — entity-id tie-break", () => {
    const world = new World();
    addBelt(world, "belt.a", 3, 3, 1, 0, 400);
    addBelt(world, "belt.b", 3, 4, 0, 1, 400);
    addBomber(world, "player.1", 3, 3);
    addBomber(world, "bot.1", 3, 4);
    const occ = createGridOccupancySystem();
    const sys = createKaboomConveyorBeltSystem({ occupancy: occ });
    tickN(world, occ, sys, 25);
    expect(world.getComponent<{ gx: number; gz: number }>("player.1", "GridPosition")!.gx).toBe(4);
    expect(world.getComponent<{ gx: number; gz: number }>("bot.1", "GridPosition")!.gz).toBe(5);
  });
});
