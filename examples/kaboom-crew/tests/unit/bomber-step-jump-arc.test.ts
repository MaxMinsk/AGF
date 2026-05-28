// S181 KABOOM-STEP-JUMP — bombers walking between cells whose height
// differs by 1 arc their Y along a parabola peaking 0.4 cells above the
// higher of the two cells; flat-flat / cliff (|Δh|>1) traversals fall
// back to the static cell height (the S178 behaviour).

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

function getLift(world: World, id: string): number | undefined {
  const c = world.getComponent<{ offsetY?: number }>(id, "HeightLift");
  return c?.offsetY;
}

describe("kaboom step-jump arc (S181)", () => {
  it("flat-to-flat traversal stamps HeightLift.offsetY=0 throughout the tween", () => {
    const world = makeWorld();
    addBomber(world, "bomber", 1, 1);
    setMover(world, "bomber", 2, 1, 0.5);
    const sys = createKaboomBomberHeightLiftSystem();
    sys.fixedUpdate!(ctx(world));
    expect(getLift(world, "bomber")).toBe(0);
  });

  it("delta=+1 tween at t=0.5 peaks at fromHeight + 0.5*delta + 0.4 (max arc)", () => {
    const world = makeWorld([
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0]
    ]);
    addBomber(world, "bomber", 0, 1); // fromHeight 0
    setMover(world, "bomber", 1, 1, 0.5); // toHeight 1, mid-tween
    const sys = createKaboomBomberHeightLiftSystem();
    sys.fixedUpdate!(ctx(world));
    // base = 0 + 1*0.5 = 0.5; arc = 0.4 * 4 * 0.5 * 0.5 = 0.4; total = 0.9
    expect(getLift(world, "bomber")).toBeCloseTo(0.9, 5);
  });

  it("delta=+1 tween at t=0 returns fromHeight (no arc at boundaries)", () => {
    const world = makeWorld([
      [0, 1, 0]
    ]);
    addBomber(world, "bomber", 0, 0);
    setMover(world, "bomber", 1, 0, 0); // boundary — no arc
    const sys = createKaboomBomberHeightLiftSystem();
    sys.fixedUpdate!(ctx(world));
    expect(getLift(world, "bomber")).toBe(0);
  });

  it("delta=-1 descent at t=0.5 arcs same way (symmetric)", () => {
    const world = makeWorld([
      [1, 0]
    ]);
    addBomber(world, "bomber", 0, 0);
    setMover(world, "bomber", 1, 0, 0.5);
    const sys = createKaboomBomberHeightLiftSystem();
    sys.fixedUpdate!(ctx(world));
    // base = 1 + (-1)*0.5 = 0.5; arc = 0.4; total = 0.9
    expect(getLift(world, "bomber")).toBeCloseTo(0.9, 5);
  });

  it("|delta|>1 cliff: falls back to cell height (no arc, S179 cliff rule still blocks the actual step)", () => {
    const world = makeWorld([
      [0, 2]
    ]);
    addBomber(world, "bomber", 0, 0);
    setMover(world, "bomber", 1, 0, 0.5);
    const sys = createKaboomBomberHeightLiftSystem();
    sys.fixedUpdate!(ctx(world));
    expect(getLift(world, "bomber")).toBe(0); // stays at fromHeight 0
  });

  it("no GridMover present: stand-on stays at static cell height", () => {
    const world = makeWorld([
      [0, 1, 0]
    ]);
    addBomber(world, "bomber", 1, 0); // standing on cell H=1
    const sys = createKaboomBomberHeightLiftSystem();
    sys.fixedUpdate!(ctx(world));
    expect(getLift(world, "bomber")).toBe(1);
  });
});
