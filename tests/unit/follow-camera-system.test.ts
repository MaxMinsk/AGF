import { describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import { createFollowCameraSystem } from "../../engine/render/systems/follow-camera-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  };
}

function setup(targetPos: number[], opts: Record<string, unknown>): World {
  const world = new World();
  world.addEntity("target");
  world.setComponent("target", "Transform", { position: targetPos });
  world.addEntity("camera");
  world.setComponent("camera", "Transform", { position: [0, 0, 0] });
  world.setComponent("camera", "FollowCamera", { target: "target", ...opts });
  return world;
}

describe("FollowCameraSystem (M21-cam-follow)", () => {
  it("snaps the camera to target + offset by default (smoothing=1)", () => {
    const world = setup([10, 2, -3], { offset: [0, 5, 8] });
    const system = createFollowCameraSystem();
    system.frameUpdate?.(ctx(world));
    const pos = (world.getComponent("camera", "Transform") as { position: number[] }).position;
    expect(pos[0]).toBeCloseTo(10, 6);
    expect(pos[1]).toBeCloseTo(7, 6);
    expect(pos[2]).toBeCloseTo(5, 6);
  });

  it("looks at the target from above (negative pitch)", () => {
    const world = setup([0, 0, 0], { offset: [0, 5, 5] });
    const system = createFollowCameraSystem();
    system.frameUpdate?.(ctx(world));
    const rot = (world.getComponent("camera", "Transform") as { rotation: number[] }).rotation;
    // Camera at (0, 5, 5) looking at (0, 0, 0): pitch should be -45°.
    expect(rot[0]).toBeCloseTo(-45, 4);
    expect(rot[1]).toBeCloseTo(0, 4);
    expect(rot[2]).toBeCloseTo(0, 4);
  });

  it("applies lookAtOffset so the camera tilts down past the target", () => {
    const world = setup([0, 0, 0], { offset: [0, 0, 10], lookAtOffset: [0, -5, 0] });
    const system = createFollowCameraSystem();
    system.frameUpdate?.(ctx(world));
    const rot = (world.getComponent("camera", "Transform") as { rotation: number[] }).rotation;
    // Camera at (0, 0, 10) looking at (0, -5, 0): direction = (0, -5, -10),
    // planar = 10, pitch = atan2(-5, 10) ≈ -26.57° (nodding down).
    expect(rot[0]).toBeCloseTo(-26.565, 2);
  });

  it("smoothing < 1 keeps the camera mid-way the first frame", () => {
    const world = setup([10, 0, 0], { offset: [0, 0, 0], smoothing: 0.5 });
    const system = createFollowCameraSystem();
    // smoothing = 0.5, dt = 1/60 → alpha = 1 - 0.5^1 = 0.5
    system.frameUpdate?.(ctx(world, 1 / 60));
    const pos = (world.getComponent("camera", "Transform") as { position: number[] }).position;
    expect(pos[0]).toBeCloseTo(5, 4);
  });

  it("no-op when target entity doesn't exist", () => {
    const world = setup([5, 0, 0], { offset: [0, 0, 5] });
    world.removeEntity("target");
    const system = createFollowCameraSystem();
    system.frameUpdate?.(ctx(world));
    const pos = (world.getComponent("camera", "Transform") as { position: number[] }).position;
    expect(pos).toEqual([0, 0, 0]); // unchanged from setup
  });
});
