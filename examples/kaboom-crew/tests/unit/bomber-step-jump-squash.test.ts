// S182 KABOOM-STEP-JUMP-SQUASH — bomber Y-scale dips at the takeoff
// and landing windows of a ±1 step-jump arc, X/Z stretch slightly so
// the volume reads as a squash rather than a shrink. Outside the
// step-jump window scale stays at the authored baseline.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createKaboomBomberHeightLiftSystem } from "../../src/systems/bomber-height-lift-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0 }
  };
}

function makeWorld(heightmap?: number[][]): World {
  const world = new World();
  world.addEntity("grid.config");
  world.setComponent("grid.config", "Grid", {
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

function addBomber(world: World, id: string, gx: number, gz: number): void {
  world.addEntity(id);
  world.setComponent(id, "BomberStats", { maxBombs: 1, range: 2 });
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "Transform", {
    position: [gx, 0.4, gz],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  });
  world.setComponent(id, "BenchAnimationState", { kind: "walk" });
}

function setMover(world: World, id: string, targetGx: number, targetGz: number, t: number): void {
  world.setComponent(id, "GridMover", {
    speed: 4,
    queuedDirection: { dx: targetGx, dz: targetGz },
    currentLerp: t,
    targetGx,
    targetGz
  });
}

function scaleOf(world: World, id: string): [number, number, number] {
  const t = world.getComponent<{ scale?: ReadonlyArray<number> }>(id, "Transform");
  const s = t?.scale ?? [1, 1, 1];
  return [s[0] ?? 1, s[1] ?? 1, s[2] ?? 1];
}

describe("kaboom step-jump squash (S182)", () => {
  it("idle bomber (no step-jump): scale stays at authored baseline", () => {
    const world = makeWorld();
    addBomber(world, "bomber", 1, 1);
    const sys = createKaboomBomberHeightLiftSystem();
    sys.fixedUpdate!(ctx(world));
    const [sx, sy, sz] = scaleOf(world, "bomber");
    expect(sx).toBeCloseTo(1, 5);
    expect(sy).toBeCloseTo(1, 5);
    expect(sz).toBeCloseTo(1, 5);
  });

  it("step-jump at t=0.5 (mid-air): scale stays at baseline (squash windows are at the ends)", () => {
    const world = makeWorld([
      [0, 1, 0]
    ]);
    addBomber(world, "bomber", 0, 0);
    setMover(world, "bomber", 1, 0, 0.5);
    const sys = createKaboomBomberHeightLiftSystem();
    sys.fixedUpdate!(ctx(world));
    const [, sy] = scaleOf(world, "bomber");
    expect(sy).toBeCloseTo(1, 5);
  });

  it("step-jump near takeoff (t small): Y-scale dips below 1, X/Z stretch above 1", () => {
    const world = makeWorld([
      [0, 1, 0]
    ]);
    addBomber(world, "bomber", 0, 0);
    // t inside SQUASH_WIDTH=0.18 → in takeoff window
    setMover(world, "bomber", 1, 0, 0.05);
    const sys = createKaboomBomberHeightLiftSystem();
    sys.fixedUpdate!(ctx(world));
    const [sx, sy, sz] = scaleOf(world, "bomber");
    expect(sy).toBeLessThan(1);
    expect(sx).toBeGreaterThan(1);
    expect(sz).toBeGreaterThan(1);
  });

  it("step-jump near landing (t close to 1): Y-scale dips below 1 as well (symmetric)", () => {
    const world = makeWorld([
      [0, 1, 0]
    ]);
    addBomber(world, "bomber", 0, 0);
    setMover(world, "bomber", 1, 0, 0.97);
    const sys = createKaboomBomberHeightLiftSystem();
    sys.fixedUpdate!(ctx(world));
    const [, sy] = scaleOf(world, "bomber");
    expect(sy).toBeLessThan(1);
  });

  it("|delta|>1 cliff: no squash (the cliff blocks the actual move; squash is for ±1 only)", () => {
    const world = makeWorld([
      [0, 2]
    ]);
    addBomber(world, "bomber", 0, 0);
    setMover(world, "bomber", 1, 0, 0.05);
    const sys = createKaboomBomberHeightLiftSystem();
    sys.fixedUpdate!(ctx(world));
    const [, sy] = scaleOf(world, "bomber");
    expect(sy).toBeCloseTo(1, 5);
  });

  it("flat traversal: no squash even at small t", () => {
    const world = makeWorld();
    addBomber(world, "bomber", 1, 1);
    setMover(world, "bomber", 2, 1, 0.05);
    const sys = createKaboomBomberHeightLiftSystem();
    sys.fixedUpdate!(ctx(world));
    const [, sy] = scaleOf(world, "bomber");
    expect(sy).toBeCloseTo(1, 5);
  });
});
