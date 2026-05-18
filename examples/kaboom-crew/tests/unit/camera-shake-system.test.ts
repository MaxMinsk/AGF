// S87 KABOOM-CAMERA-SHAKE.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createKaboomCameraShakeSystem } from "../../src/systems/camera-shake-system";

function ctx(world: World, fixedDt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt: fixedDt, fixedDt, frameCount: 0, fixedStepCount: 0 }
  };
}

function addCamera(world: World, position: [number, number, number] = [7, 10, 10]): void {
  world.addEntity("camera.main");
  world.setComponent("camera.main", "Camera", { kind: "orthographic", active: true });
  world.setComponent("camera.main", "Transform", { position, rotation: [-55, 0, 0], scale: [1, 1, 1] });
}

function fireBlast(world: World, range = 3): void {
  const id = `blast-event-${Math.random().toString(16).slice(2)}`;
  world.addEntity(id);
  world.setComponent(id, "BlastEvent", { originGx: 0, originGz: 0, range, ownerId: "owner.1" });
}

describe("createKaboomCameraShakeSystem (S87 KABOOM-CAMERA-SHAKE)", () => {
  it("ramps intensity to non-zero on a BlastEvent", () => {
    const world = new World();
    addCamera(world);
    const system = createKaboomCameraShakeSystem({ rng: () => 0.5 });
    fireBlast(world, 3);
    system.fixedUpdate!(ctx(world));
    expect(system.intensity()).toBeGreaterThan(0);
  });

  it("decays back to 0 within ~1 s of fixed steps", () => {
    const world = new World();
    addCamera(world);
    // RNG = 0.5 means (rng()*2-1) = 0, so position stays at baseline and
    // the snap-back path also restores cleanly. Decay path is what we test.
    const system = createKaboomCameraShakeSystem({ rng: () => 0.5 });
    fireBlast(world, 3);
    system.fixedUpdate!(ctx(world));
    expect(system.intensity()).toBeGreaterThan(0);

    // No new BlastEvents are spawned.
    for (const id of world.createQuery(["BlastEvent"]).run()) world.removeEntity(id);

    // Default decayPerSecond is 6 → from 0.18 to below 0.001 ≈ 0.87 s
    // → 60 fixed steps at 1/60 s.
    for (let i = 0; i < 60; i += 1) {
      system.fixedUpdate!(ctx(world));
    }
    expect(system.intensity()).toBe(0);
  });

  it("snaps Transform.position back to baseline once intensity reaches 0", () => {
    const world = new World();
    addCamera(world, [7, 10, 10]);
    const system = createKaboomCameraShakeSystem({ rng: () => 0.5, decayPerSecond: 20 });
    fireBlast(world, 3);
    system.fixedUpdate!(ctx(world));
    // Remove the blast event so it can't re-bump.
    for (const id of world.createQuery(["BlastEvent"]).run()) world.removeEntity(id);

    // Let intensity decay completely.
    for (let i = 0; i < 60; i += 1) system.fixedUpdate!(ctx(world));
    const t = world.getComponent("camera.main", "Transform") as { position: number[] };
    expect(t.position).toEqual([7, 10, 10]);
  });

  it("higher blast range produces stronger shake", () => {
    const worldSmall = new World();
    addCamera(worldSmall);
    const small = createKaboomCameraShakeSystem({ rng: () => 0.5 });
    fireBlast(worldSmall, 1);
    small.fixedUpdate!(ctx(worldSmall));

    const worldBig = new World();
    addCamera(worldBig);
    const big = createKaboomCameraShakeSystem({ rng: () => 0.5 });
    fireBlast(worldBig, 5);
    big.fixedUpdate!(ctx(worldBig));

    expect(big.intensity()).toBeGreaterThan(small.intensity());
  });

  it("no-op when no active camera exists", () => {
    const world = new World();
    // BlastEvent without any camera.
    fireBlast(world, 4);
    const system = createKaboomCameraShakeSystem({ rng: () => 0.5 });
    expect(() => system.fixedUpdate!(ctx(world))).not.toThrow();
    expect(system.intensity()).toBe(0);
  });

  it("intensity is clamped by maxIntensity", () => {
    const world = new World();
    addCamera(world);
    const system = createKaboomCameraShakeSystem({
      rng: () => 0.5,
      intensityPerRange: 1,
      maxIntensity: 0.3
    });
    // Spawn several BlastEvents at high range — uncapped this would push past 1.
    for (let i = 0; i < 5; i += 1) fireBlast(world, 5);
    system.fixedUpdate!(ctx(world));
    expect(system.intensity()).toBeLessThanOrEqual(0.3);
  });
});
