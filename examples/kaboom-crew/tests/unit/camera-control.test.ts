// S195 KABOOM-CAMERA-CONTROL. Single-owner of camera.main position.
// Covers the new follow path + the inherited S87/S95 shake feel.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createKaboomCameraControlSystem } from "../../src/systems/camera-control-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0 }
  };
}

const AUTHORED: [number, number, number] = [7, 10, 5];

function seedCamera(world: World): void {
  world.addEntity("camera.main");
  world.setComponent("camera.main", "Camera", {
    kind: "orthographic",
    active: true,
    orthographicSize: 8,
    near: 0.1,
    far: 100
  });
  world.setComponent("camera.main", "Transform", {
    position: AUTHORED,
    rotation: [-55, 0, 0],
    scale: [1, 1, 1]
  });
}

function seedPlayer(world: World, x: number, z: number, y = 0.4): void {
  world.addEntity("player.1");
  world.setComponent("player.1", "Transform", {
    position: [x, y, z],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  });
}

function cameraPos(world: World): [number, number, number] {
  const t = world.getComponent<{ position?: ReadonlyArray<number> }>("camera.main", "Transform");
  const p = t?.position ?? [0, 0, 0];
  return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
}

function emitBlast(world: World, id: string, range = 2): void {
  world.addEntity(id);
  world.setComponent(id, "BlastEvent", { originGx: 0, originGz: 0, range, ownerId: "p" });
}

describe("kaboom camera-control (S195)", () => {
  it("idle: no player + no blast → camera stays at authored position", () => {
    const world = new World();
    seedCamera(world);
    const sys = createKaboomCameraControlSystem({ rng: () => 0.5 });
    for (let i = 0; i < 60; i += 1) sys.fixedUpdate!(ctx(world));
    const [x, y, z] = cameraPos(world);
    expect(x).toBeCloseTo(AUTHORED[0], 4);
    expect(y).toBeCloseTo(AUTHORED[1], 4);
    expect(z).toBeCloseTo(AUTHORED[2], 4);
  });

  it("follow=damped: player at offset (10,_,5) drifts camera toward +x over time", () => {
    const world = new World();
    seedCamera(world);
    seedPlayer(world, 10, 5);
    const sys = createKaboomCameraControlSystem({ rng: () => 0.5 });
    for (let i = 0; i < 90; i += 1) sys.fixedUpdate!(ctx(world));
    const [x, , z] = cameraPos(world);
    // Authored x=7, player x=10 → target dx=3 (== MAX_FOLLOW_OFFSET).
    // After ~1.5s @ rate 1.5/s lerp should be ≥80% of the gap.
    expect(x).toBeGreaterThan(AUTHORED[0] + 2);
    expect(z).toBeCloseTo(AUTHORED[2], 1); // player.z = authored.z
  });

  it("follow=off: player offset is ignored — camera stays at authored", () => {
    const world = new World();
    seedCamera(world);
    seedPlayer(world, 14, 0);
    const sys = createKaboomCameraControlSystem({ followMode: "off", rng: () => 0.5 });
    for (let i = 0; i < 60; i += 1) sys.fixedUpdate!(ctx(world));
    const [x, , z] = cameraPos(world);
    expect(x).toBeCloseTo(AUTHORED[0], 4);
    expect(z).toBeCloseTo(AUTHORED[2], 4);
  });

  it("follow=snap: player offset (12,_,8) immediately moves camera by capped delta", () => {
    const world = new World();
    seedCamera(world);
    seedPlayer(world, 12, 8);
    const sys = createKaboomCameraControlSystem({ followMode: "snap", rng: () => 0.5 });
    sys.fixedUpdate!(ctx(world));
    const [x, , z] = cameraPos(world);
    // dx=5 clamped to MAX_FOLLOW_OFFSET=3, dz=3 == MAX.
    expect(x).toBeCloseTo(AUTHORED[0] + 3, 3);
    expect(z).toBeCloseTo(AUTHORED[2] + 3, 3);
  });

  it("MAX_FOLLOW_OFFSET caps the drift — player at the far corner doesn't pull camera off the arena", () => {
    const world = new World();
    seedCamera(world);
    seedPlayer(world, 50, 50);
    const sys = createKaboomCameraControlSystem({ rng: () => 0.5 });
    for (let i = 0; i < 600; i += 1) sys.fixedUpdate!(ctx(world)); // 10s — fully settled
    const [x, , z] = cameraPos(world);
    expect(x - AUTHORED[0]).toBeCloseTo(3, 2);
    expect(z - AUTHORED[2]).toBeCloseTo(3, 2);
  });

  it("BlastEvent bumps shake intensity above zero", () => {
    const world = new World();
    seedCamera(world);
    emitBlast(world, "evt.1", 3);
    const sys = createKaboomCameraControlSystem({ rng: () => 1 });
    sys.fixedUpdate!(ctx(world));
    expect(sys.shakeIntensity()).toBeGreaterThan(0);
  });

  it("shake decays to zero within SHAKE_DURATION_S after the event is consumed", () => {
    const world = new World();
    seedCamera(world);
    emitBlast(world, "evt.1", 3);
    const sys = createKaboomCameraControlSystem({ rng: () => 1 });
    sys.fixedUpdate!(ctx(world));
    // Simulate blast-propagation consuming the event right after camera-
    // control observed it — in production those two systems run in the
    // same tick. Without this, the event would re-bump shake every tick.
    world.removeEntity("evt.1");
    // 0.45s / (1/60) = 27 ticks; run a bit more to settle.
    for (let i = 0; i < 40; i += 1) sys.fixedUpdate!(ctx(world));
    expect(sys.shakeIntensity()).toBe(0);
  });

  it("player removal during follow stops further drift but keeps camera near last target", () => {
    const world = new World();
    seedCamera(world);
    seedPlayer(world, 10, 5);
    const sys = createKaboomCameraControlSystem({ rng: () => 0.5 });
    for (let i = 0; i < 90; i += 1) sys.fixedUpdate!(ctx(world));
    const before = cameraPos(world)[0];
    world.removeEntity("player.1");
    for (let i = 0; i < 300; i += 1) sys.fixedUpdate!(ctx(world));
    const after = cameraPos(world)[0];
    // No player → target follow snaps to authored; lerp drifts back.
    expect(after).toBeLessThan(before);
    expect(after).toBeCloseTo(AUTHORED[0], 1);
  });
});
