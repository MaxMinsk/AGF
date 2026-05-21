// S108 KABOOM-BOMBER-FACE-MOVEMENT.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import {
  createKaboomBomberFaceMovementSystem,
  directionToYawDeg
} from "../../src/systems/bomber-face-movement-system";

function ctx(world: World) {
  return {
    world,
    time: { elapsed: 0, dt: 1 / 60, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  };
}

function addPlayer(world: World, opts: { gx?: number; gz?: number; lerp?: number; targetGx?: number; targetGz?: number; queued?: { dx: number; dz: number }; alive?: boolean }) {
  world.addEntity("player.1");
  world.setComponent("player.1", "PlayerControlled", { speed: 4 });
  world.setComponent("player.1", "BomberStats", { maxBombs: 1, range: 2, alive: opts.alive ?? true });
  world.setComponent("player.1", "GridPosition", { gx: opts.gx ?? 0, gz: opts.gz ?? 0 });
  world.setComponent("player.1", "GridMover", {
    speed: 4,
    currentLerp: opts.lerp ?? 0,
    queuedDirection: opts.queued ?? { dx: 0, dz: 0 },
    ...(opts.targetGx !== undefined ? { targetGx: opts.targetGx } : {}),
    ...(opts.targetGz !== undefined ? { targetGz: opts.targetGz } : {})
  });
  world.setComponent("player.1", "Transform", { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
}

describe("directionToYawDeg (S108 pure helper)", () => {
  it("zero direction = 0 yaw", () => {
    expect(directionToYawDeg(0, 0)).toBe(0);
  });
  it("(+X, 0) = +90°", () => {
    expect(directionToYawDeg(1, 0)).toBeCloseTo(90, 5);
  });
  it("(-X, 0) = -90°", () => {
    expect(directionToYawDeg(-1, 0)).toBeCloseTo(-90, 5);
  });
  it("(0, -Z) = 0° (Three.js default forward)", () => {
    expect(directionToYawDeg(0, -1)).toBeCloseTo(0, 5);
  });
  it("(0, +Z) = ±180°", () => {
    expect(Math.abs(directionToYawDeg(0, 1))).toBeCloseTo(180, 5);
  });
});

describe("createKaboomBomberFaceMovementSystem (S108)", () => {
  it("queuedDirection sets the yaw when not mid-lerp", () => {
    const world = new World();
    addPlayer(world, { queued: { dx: 1, dz: 0 } });
    const system = createKaboomBomberFaceMovementSystem();
    system.fixedUpdate!(ctx(world));
    const t = world.getComponent<{ rotation: ReadonlyArray<number> }>("player.1", "Transform")!;
    expect(t.rotation[1]!).toBeCloseTo(90, 3);
  });

  it("mid-lerp target overrides queued direction", () => {
    const world = new World();
    addPlayer(world, { gx: 2, gz: 2, lerp: 0.5, targetGx: 2, targetGz: 1, queued: { dx: 1, dz: 0 } });
    const system = createKaboomBomberFaceMovementSystem();
    system.fixedUpdate!(ctx(world));
    const t = world.getComponent<{ rotation: ReadonlyArray<number> }>("player.1", "Transform")!;
    // Target is (2, 1), pos (2, 2) → direction (0, -1) → yaw 0°.
    expect(t.rotation[1]!).toBeCloseTo(0, 3);
  });

  it("preserves yaw when bomber is stationary + no queued direction", () => {
    const world = new World();
    addPlayer(world, {});
    world.setComponent("player.1", "Transform", { position: [0, 0, 0], rotation: [0, 45, 0], scale: [1, 1, 1] });
    const system = createKaboomBomberFaceMovementSystem();
    system.fixedUpdate!(ctx(world));
    const t = world.getComponent<{ rotation: ReadonlyArray<number> }>("player.1", "Transform")!;
    expect(t.rotation[1]).toBe(45);
  });

  it("skips dead bombers (lets the ragdoll arc own rotation)", () => {
    const world = new World();
    addPlayer(world, { queued: { dx: 1, dz: 0 }, alive: false });
    world.setComponent("player.1", "Transform", { position: [0, 0, 0], rotation: [10, 33, 0], scale: [1, 1, 1] });
    const system = createKaboomBomberFaceMovementSystem();
    system.fixedUpdate!(ctx(world));
    const t = world.getComponent<{ rotation: ReadonlyArray<number> }>("player.1", "Transform")!;
    expect(t.rotation[1]).toBe(33);
  });
});
