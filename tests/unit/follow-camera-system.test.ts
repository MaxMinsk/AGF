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

  it("S81 lookAheadMs extrapolates camera position along target velocity", () => {
    // Frame 1: prime velocity history (target at 0, no prior frame → velocity = 0).
    // Frame 2: target jumps to +1 on X over dt = 1/60 s ⇒ vx = 60 m/s.
    //          lookAheadMs = 100 ms ⇒ aheadX = 60 * 0.1 = 6.
    //          camera follows at offset (0, 0, 5), smoothing = 1 (snap).
    const world = setup([0, 0, 0], { offset: [0, 0, 5], lookAheadMs: 100 });
    const system = createFollowCameraSystem();
    system.frameUpdate?.(ctx(world));
    world.setComponent("target", "Transform", { position: [1, 0, 0] });
    system.frameUpdate?.(ctx(world));
    const pos = (world.getComponent("camera", "Transform") as { position: number[] }).position;
    // Target now at (1, 0, 0); offset (0, 0, 5); look-ahead pushes +6 on X.
    expect(pos[0]).toBeCloseTo(7, 4);
    expect(pos[1]).toBeCloseTo(0, 4);
    expect(pos[2]).toBeCloseTo(5, 4);
  });

  it("S81 lookAheadMs = 0 (default) matches the no-look-ahead behaviour", () => {
    const world = setup([0, 0, 0], { offset: [0, 0, 5] });
    const system = createFollowCameraSystem();
    system.frameUpdate?.(ctx(world));
    world.setComponent("target", "Transform", { position: [1, 0, 0] });
    system.frameUpdate?.(ctx(world));
    const pos = (world.getComponent("camera", "Transform") as { position: number[] }).position;
    expect(pos[0]).toBeCloseTo(1, 4);
    expect(pos[2]).toBeCloseTo(5, 4);
  });

  it("S81 velocity history resets when target entity changes", () => {
    // First target moves +X fast, second target is stationary. After the swap
    // the camera must not carry the old velocity into a look-ahead spike.
    const world = setup([0, 0, 0], { offset: [0, 0, 5], lookAheadMs: 100 });
    world.addEntity("target2");
    world.setComponent("target2", "Transform", { position: [0, 0, 0] });
    const system = createFollowCameraSystem();
    system.frameUpdate?.(ctx(world));
    world.setComponent("target", "Transform", { position: [10, 0, 0] });
    system.frameUpdate?.(ctx(world));
    // Swap target — first frame after the swap must not extrapolate.
    world.setComponent("camera", "FollowCamera", { target: "target2", offset: [0, 0, 5], lookAheadMs: 100 });
    system.frameUpdate?.(ctx(world));
    const pos = (world.getComponent("camera", "Transform") as { position: number[] }).position;
    expect(pos[0]).toBeCloseTo(0, 4); // target2 at origin, no carried velocity
    expect(pos[2]).toBeCloseTo(5, 4);
  });
});
