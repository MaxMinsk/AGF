// S183 KABOOM-STEP-JUMP-LANDING-FX — verify a particle emitter spawns
// at the destination cell when a bomber crosses cells whose height
// differs by ±1. Flat traversals + |Δh|>1 jumps spawn no emitter.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createKaboomStepJumpFxSystem } from "../../src/systems/step-jump-fx-system";

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
}

function countEmitters(world: World): number {
  let n = 0;
  for (const id of world.entityIds()) {
    if (world.hasComponent(id, "ParticleEmitter") && id.startsWith("kaboom.step-jump-fx.")) {
      n += 1;
    }
  }
  return n;
}

describe("kaboom step-jump landing fx (S183)", () => {
  it("first tick (no prior cell): no emitter", () => {
    const world = makeWorld([
      [0, 1, 0]
    ]);
    addBomber(world, "bomber", 0, 0);
    const sys = createKaboomStepJumpFxSystem();
    sys.fixedUpdate!(ctx(world));
    expect(countEmitters(world)).toBe(0);
  });

  it("same cell across ticks: no emitter", () => {
    const world = makeWorld([
      [0, 1, 0]
    ]);
    addBomber(world, "bomber", 0, 0);
    const sys = createKaboomStepJumpFxSystem();
    sys.fixedUpdate!(ctx(world));
    sys.fixedUpdate!(ctx(world));
    expect(countEmitters(world)).toBe(0);
  });

  it("flat cell crossing (Δh=0): no emitter", () => {
    const world = makeWorld(); // flat
    addBomber(world, "bomber", 0, 0);
    const sys = createKaboomStepJumpFxSystem();
    sys.fixedUpdate!(ctx(world));
    world.setComponent("bomber", "GridPosition", { gx: 1, gz: 0 });
    sys.fixedUpdate!(ctx(world));
    expect(countEmitters(world)).toBe(0);
  });

  it("ascending step (Δh=+1): one emitter at landing cell, lifted by toHeight", () => {
    const world = makeWorld([
      [0, 1, 0]
    ]);
    addBomber(world, "bomber", 0, 0);
    const sys = createKaboomStepJumpFxSystem();
    sys.fixedUpdate!(ctx(world));
    world.setComponent("bomber", "GridPosition", { gx: 1, gz: 0 });
    sys.fixedUpdate!(ctx(world));
    expect(countEmitters(world)).toBe(1);
    // Locate the emitter + verify Y reflects the toHeight = 1.
    let foundY: number | undefined;
    for (const id of world.entityIds()) {
      if (!id.startsWith("kaboom.step-jump-fx.")) continue;
      const t = world.getComponent<{ position?: ReadonlyArray<number> }>(id, "Transform");
      foundY = t?.position?.[1];
    }
    expect(foundY).toBeCloseTo(1.05, 5);
  });

  it("descending step (Δh=-1): one emitter at landing cell", () => {
    const world = makeWorld([
      [1, 0]
    ]);
    addBomber(world, "bomber", 0, 0);
    const sys = createKaboomStepJumpFxSystem();
    sys.fixedUpdate!(ctx(world));
    world.setComponent("bomber", "GridPosition", { gx: 1, gz: 0 });
    sys.fixedUpdate!(ctx(world));
    expect(countEmitters(world)).toBe(1);
  });

  it("|Δh|>1 cliff jump (shouldn't happen with S179 rules, but defensive): no emitter", () => {
    const world = makeWorld([
      [0, 2]
    ]);
    addBomber(world, "bomber", 0, 0);
    const sys = createKaboomStepJumpFxSystem();
    sys.fixedUpdate!(ctx(world));
    world.setComponent("bomber", "GridPosition", { gx: 1, gz: 0 });
    sys.fixedUpdate!(ctx(world));
    expect(countEmitters(world)).toBe(0);
  });

  it("staircase ascent (H=0→1→2): emitter on each step", () => {
    const world = makeWorld([
      [0, 1, 2]
    ]);
    addBomber(world, "bomber", 0, 0);
    const sys = createKaboomStepJumpFxSystem();
    sys.fixedUpdate!(ctx(world));
    world.setComponent("bomber", "GridPosition", { gx: 1, gz: 0 });
    sys.fixedUpdate!(ctx(world));
    world.setComponent("bomber", "GridPosition", { gx: 2, gz: 0 });
    sys.fixedUpdate!(ctx(world));
    expect(countEmitters(world)).toBe(2);
  });
});
