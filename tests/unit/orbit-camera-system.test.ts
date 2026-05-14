import { describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import { createOrbitCameraSystem } from "../../engine/render/systems/orbit-camera-system";

function ctx(world: World) {
  return {
    world,
    time: { elapsed: 0, dt: 1 / 60, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  };
}

function setup(orbit: Record<string, unknown>): World {
  const world = new World();
  world.addEntity("camera");
  world.setComponent("camera", "Transform", { position: [0, 0, 0] });
  world.setComponent("camera", "OrbitCamera", orbit);
  return world;
}

describe("OrbitCameraSystem (M21-cam-orbit)", () => {
  it("places the camera on +Z when yaw=0, pitch=0", () => {
    const world = setup({ target: [0, 0, 0], distance: 10, pitch: 0, yaw: 0 });
    const system = createOrbitCameraSystem();
    system.frameUpdate?.(ctx(world));
    const pos = (world.getComponent("camera", "Transform") as { position: number[] }).position;
    expect(pos[0]).toBeCloseTo(0, 6);
    expect(pos[1]).toBeCloseTo(0, 6);
    expect(pos[2]).toBeCloseTo(10, 6);
  });

  it("rotates around Y when yaw changes", () => {
    const world = setup({ target: [0, 0, 0], distance: 10, pitch: 0, yaw: 90 });
    const system = createOrbitCameraSystem();
    system.frameUpdate?.(ctx(world));
    const pos = (world.getComponent("camera", "Transform") as { position: number[] }).position;
    expect(pos[0]).toBeCloseTo(10, 6);
    expect(pos[1]).toBeCloseTo(0, 6);
    expect(pos[2]).toBeCloseTo(0, 6);
  });

  it("lifts the camera when pitch increases (looking down at target)", () => {
    const world = setup({ target: [0, 0, 0], distance: 10, pitch: 90, yaw: 0 });
    const system = createOrbitCameraSystem();
    system.frameUpdate?.(ctx(world));
    const pos = (world.getComponent("camera", "Transform") as { position: number[] }).position;
    expect(pos[0]).toBeCloseTo(0, 6);
    expect(pos[1]).toBeCloseTo(10, 6);
    expect(pos[2]).toBeCloseTo(0, 6);
  });

  it("clamps distance into [minDistance, maxDistance]", () => {
    const world = setup({
      target: [0, 0, 0],
      distance: 200,
      pitch: 0,
      yaw: 0,
      minDistance: 5,
      maxDistance: 50
    });
    const system = createOrbitCameraSystem();
    system.frameUpdate?.(ctx(world));
    const pos = (world.getComponent("camera", "Transform") as { position: number[] }).position;
    expect(pos[2]).toBeCloseTo(50, 6);
  });

  it("translates around a non-zero target", () => {
    const world = setup({ target: [5, 1, 5], distance: 4, pitch: 0, yaw: 0 });
    const system = createOrbitCameraSystem();
    system.frameUpdate?.(ctx(world));
    const pos = (world.getComponent("camera", "Transform") as { position: number[] }).position;
    expect(pos[0]).toBeCloseTo(5, 6);
    expect(pos[1]).toBeCloseTo(1, 6);
    expect(pos[2]).toBeCloseTo(9, 6);
  });
});
