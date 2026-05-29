// S194 — camera-zoom-system widens the camera's orthographicSize when
// the arena gets busy (multiple live bombs, active blast tiles,
// sudden death). Eases back when things quiet down.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createKaboomCameraZoomSystem } from "../../src/systems/camera-zoom-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0 }
  };
}

function seedCamera(world: World, orthographicSize = 8): void {
  world.addEntity("camera.main");
  world.setComponent("camera.main", "Camera", {
    kind: "orthographic",
    active: true,
    orthographicSize,
    near: 0.1,
    far: 100
  });
  world.setComponent("camera.main", "Transform", {
    position: [0, 10, 0],
    rotation: [-55, 0, 0],
    scale: [1, 1, 1]
  });
}

function spawnBomb(world: World, id: string): void {
  world.addEntity(id);
  world.setComponent(id, "Bomb", { fuseRemaining: 1, range: 2, ownerId: "player.1" });
}

function spawnBlastTile(world: World, id: string): void {
  world.addEntity(id);
  world.setComponent(id, "BlastTile", { lifetimeRemaining: 0.2, ownerId: "player.1" });
}

function setSuddenDeath(world: World, activated: boolean): void {
  if (!world.hasEntity("kaboom.game-state")) world.addEntity("kaboom.game-state");
  world.setComponent("kaboom.game-state", "SuddenDeathState", { activated });
}

function ortho(world: World): number {
  return world.getComponent<{ orthographicSize?: number }>("camera.main", "Camera")?.orthographicSize ?? 0;
}

describe("kaboom camera zoom on action (S194)", () => {
  it("idle arena (1 bomb max — counts as 0 boost): stays at baseline", () => {
    const world = new World();
    seedCamera(world, 8);
    spawnBomb(world, "bomb.1");
    const sys = createKaboomCameraZoomSystem();
    for (let i = 0; i < 60; i += 1) sys.fixedUpdate!(ctx(world));
    expect(ortho(world)).toBeCloseTo(8, 2);
  });

  it("three live bombs widen the camera above baseline", () => {
    const world = new World();
    seedCamera(world, 8);
    spawnBomb(world, "bomb.1");
    spawnBomb(world, "bomb.2");
    spawnBomb(world, "bomb.3");
    const sys = createKaboomCameraZoomSystem();
    // Run for ~1s so the lerp settles close to target.
    for (let i = 0; i < 90; i += 1) sys.fixedUpdate!(ctx(world));
    // Target boost = (3 - 1) * 0.16 = 0.32. Allow for lerp residual.
    expect(ortho(world)).toBeGreaterThan(8.2);
    expect(ortho(world)).toBeLessThan(8.4);
  });

  it("eases back to baseline when bombs disappear", () => {
    const world = new World();
    seedCamera(world, 8);
    spawnBomb(world, "bomb.1");
    spawnBomb(world, "bomb.2");
    spawnBomb(world, "bomb.3");
    const sys = createKaboomCameraZoomSystem();
    for (let i = 0; i < 90; i += 1) sys.fixedUpdate!(ctx(world));
    expect(ortho(world)).toBeGreaterThan(8.2);
    world.removeEntity("bomb.1");
    world.removeEntity("bomb.2");
    world.removeEntity("bomb.3");
    for (let i = 0; i < 180; i += 1) sys.fixedUpdate!(ctx(world));
    // After ~3s of decay the boost should be well below the per-tick
    // write threshold (0.001). Assert within 0.05 of baseline.
    expect(Math.abs(ortho(world) - 8)).toBeLessThan(0.05);
  });

  it("sudden death activated adds a large boost on top of bomb count", () => {
    const world = new World();
    seedCamera(world, 8);
    setSuddenDeath(world, true);
    const sys = createKaboomCameraZoomSystem();
    for (let i = 0; i < 120; i += 1) sys.fixedUpdate!(ctx(world));
    expect(ortho(world)).toBeGreaterThan(8 + 0.5);
  });

  it("boost is capped (lots of blast tiles don't blow past MAX_BOOST=2)", () => {
    const world = new World();
    seedCamera(world, 8);
    for (let i = 0; i < 200; i += 1) spawnBlastTile(world, `tile.${i}`);
    const sys = createKaboomCameraZoomSystem();
    for (let i = 0; i < 120; i += 1) sys.fixedUpdate!(ctx(world));
    expect(ortho(world)).toBeLessThanOrEqual(8 + 2 + 0.05);
  });

  it("non-orthographic cameras are ignored", () => {
    const world = new World();
    world.addEntity("camera.main");
    world.setComponent("camera.main", "Camera", { kind: "perspective", active: true, fov: 50 });
    spawnBomb(world, "bomb.1");
    spawnBomb(world, "bomb.2");
    spawnBomb(world, "bomb.3");
    const sys = createKaboomCameraZoomSystem();
    for (let i = 0; i < 60; i += 1) sys.fixedUpdate!(ctx(world));
    const cam = world.getComponent<{ orthographicSize?: number; fov?: number }>("camera.main", "Camera");
    expect(cam?.orthographicSize).toBeUndefined();
    expect(cam?.fov).toBe(50);
  });
});
