// S200 — pickup-magnet-system slides a pickup's Transform X/Z toward
// the nearest alive bomber when within MAGNET_RANGE cells. Past that
// range it eases back to the authored cell position.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createKaboomPickupMagnetSystem } from "../../src/systems/pickup-magnet-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0 }
  };
}

function addPickup(world: World, id: string, gx: number, gz: number, y = 0.3): void {
  world.addEntity(id);
  world.setComponent(id, "Pickup", { kind: "bomb-up" });
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "Transform", {
    position: [gx, y, gz],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  });
}

function addBomber(world: World, id: string, x: number, z: number, alive = true): void {
  world.addEntity(id);
  world.setComponent(id, "BomberStats", { maxBombs: 1, range: 2, alive });
  world.setComponent(id, "Transform", {
    position: [x, 0.4, z],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  });
}

function xzOf(world: World, id: string): [number, number] {
  const t = world.getComponent<{ position?: ReadonlyArray<number> }>(id, "Transform");
  const p = t?.position ?? [0, 0, 0];
  return [p[0] ?? 0, p[2] ?? 0];
}

describe("kaboom pickup magnet (S200)", () => {
  it("no bombers in world: pickup stays at its authored position", () => {
    const world = new World();
    addPickup(world, "pickup", 5, 5);
    const sys = createKaboomPickupMagnetSystem();
    for (let i = 0; i < 30; i += 1) sys.fixedUpdate!(ctx(world));
    const [x, z] = xzOf(world, "pickup");
    expect(x).toBeCloseTo(5, 4);
    expect(z).toBeCloseTo(5, 4);
  });

  it("bomber within range pulls the pickup toward them", () => {
    const world = new World();
    addPickup(world, "pickup", 5, 5);
    addBomber(world, "p", 6, 5); // 1 cell east — inside range
    const sys = createKaboomPickupMagnetSystem();
    for (let i = 0; i < 30; i += 1) sys.fixedUpdate!(ctx(world));
    const [x, z] = xzOf(world, "pickup");
    // Pickup slides toward +x.
    expect(x).toBeGreaterThan(5.3);
    expect(z).toBeCloseTo(5, 2);
  });

  it("pull does not overshoot — capped at 0.65 cells offset from authored", () => {
    const world = new World();
    addPickup(world, "pickup", 5, 5);
    addBomber(world, "p", 6, 5);
    const sys = createKaboomPickupMagnetSystem();
    for (let i = 0; i < 200; i += 1) sys.fixedUpdate!(ctx(world));
    const [x] = xzOf(world, "pickup");
    expect(x - 5).toBeLessThanOrEqual(0.66);
  });

  it("bomber out of range: no pull", () => {
    const world = new World();
    addPickup(world, "pickup", 5, 5);
    addBomber(world, "p", 8, 5); // 3 cells away — outside MAGNET_RANGE=1.5
    const sys = createKaboomPickupMagnetSystem();
    for (let i = 0; i < 30; i += 1) sys.fixedUpdate!(ctx(world));
    const [x, z] = xzOf(world, "pickup");
    expect(x).toBeCloseTo(5, 3);
    expect(z).toBeCloseTo(5, 3);
  });

  it("dead bomber is ignored — alive=false does not pull", () => {
    const world = new World();
    addPickup(world, "pickup", 5, 5);
    addBomber(world, "p", 6, 5, false);
    const sys = createKaboomPickupMagnetSystem();
    for (let i = 0; i < 30; i += 1) sys.fixedUpdate!(ctx(world));
    const [x, z] = xzOf(world, "pickup");
    expect(x).toBeCloseTo(5, 3);
    expect(z).toBeCloseTo(5, 3);
  });

  it("pickup snaps back toward authored cell after bomber walks away", () => {
    const world = new World();
    addPickup(world, "pickup", 5, 5);
    addBomber(world, "p", 6, 5);
    const sys = createKaboomPickupMagnetSystem();
    for (let i = 0; i < 60; i += 1) sys.fixedUpdate!(ctx(world));
    const xPulled = xzOf(world, "pickup")[0];
    expect(xPulled).toBeGreaterThan(5.3);
    // Move the bomber far away.
    world.setComponent("p", "Transform", {
      position: [10, 0.4, 5],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    });
    for (let i = 0; i < 240; i += 1) sys.fixedUpdate!(ctx(world));
    const [xReleased] = xzOf(world, "pickup");
    expect(xReleased).toBeCloseTo(5, 1);
  });

  it("nearest of multiple bombers wins the pull direction", () => {
    const world = new World();
    addPickup(world, "pickup", 5, 5);
    addBomber(world, "near", 5, 4); // 1 cell north
    addBomber(world, "far", 5, 9); // 4 cells south — outside range
    const sys = createKaboomPickupMagnetSystem();
    for (let i = 0; i < 30; i += 1) sys.fixedUpdate!(ctx(world));
    const [, z] = xzOf(world, "pickup");
    // Pulled toward 'near' (z=4) — z should decrease.
    expect(z).toBeLessThan(4.9);
  });

  it("Y axis untouched — magnet only writes X/Z", () => {
    const world = new World();
    addPickup(world, "pickup", 5, 5, 1.7);
    addBomber(world, "p", 6, 5);
    const sys = createKaboomPickupMagnetSystem();
    sys.fixedUpdate!(ctx(world));
    const t = world.getComponent<{ position?: ReadonlyArray<number> }>("pickup", "Transform");
    expect(t?.position?.[1]).toBe(1.7);
  });
});
