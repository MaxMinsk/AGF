// M19-waypoint-mover unit coverage.

import { describe, expect, it } from "vitest";
import { World } from "../../engine/core/ecs/world";
import {
  createWaypointMoverSystem,
  WAYPOINT_MOVER
} from "../../engine/core/systems/waypoint-mover-system";

function step(system: ReturnType<typeof createWaypointMoverSystem>, world: World, dt: number): void {
  system.frameUpdate?.({
    time: { elapsed: 0, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0, physicsAlpha: 0 },
    world
  });
}

describe("createWaypointMoverSystem", () => {
  it("interpolates linearly through a 2-waypoint path", () => {
    const world = new World();
    world.addEntity("car");
    world.setComponent("car", "Transform", { position: [0, 0, 0] });
    world.setComponent("car", WAYPOINT_MOVER, {
      waypoints: [
        { position: [0, 0, 0], duration: 0.01 },
        { position: [10, 0, 0], duration: 1.0 }
      ]
    });
    const system = createWaypointMoverSystem();
    step(system, world, 0.5);
    const transform = world.getComponent<{ position: number[] }>("car", "Transform");
    expect(transform?.position[0]).toBeCloseTo(5, 4);
  });

  it("loops back to the first waypoint when loop=true", () => {
    const world = new World();
    world.addEntity("car");
    world.setComponent("car", "Transform", { position: [0, 0, 0] });
    world.setComponent("car", WAYPOINT_MOVER, {
      waypoints: [
        { position: [0, 0, 0], duration: 0.01 },
        { position: [10, 0, 0], duration: 1.0 },
        { position: [0, 0, 0], duration: 1.0 }
      ],
      loop: true
    });
    const system = createWaypointMoverSystem();
    // Walk through one full cycle + a bit more — verify we're back near
    // the start after wrap.
    step(system, world, 2.05);
    const pos = world.getComponent<{ position: number[] }>("car", "Transform")!.position;
    // 0.05s into the second cycle's first 0.01s wait + the 1.0s outbound.
    // Just past the wait, t = 0.04/1.0 = 0.04 into [0→10] → ~0.4.
    expect(pos[0]).toBeGreaterThan(0.2);
    expect(pos[0]).toBeLessThan(1.0);
    expect(world.getComponent("car", WAYPOINT_MOVER)).toBeDefined();
  });

  it("removes the mover after a one-shot path finishes", () => {
    const world = new World();
    world.addEntity("car");
    world.setComponent("car", "Transform", { position: [0, 0, 0] });
    world.setComponent("car", WAYPOINT_MOVER, {
      waypoints: [
        { position: [0, 0, 0], duration: 0.01 },
        { position: [10, 0, 0], duration: 1.0 }
      ]
    });
    const system = createWaypointMoverSystem();
    step(system, world, 1.5);
    expect(world.getComponent("car", WAYPOINT_MOVER)).toBeUndefined();
    const pos = world.getComponent<{ position: number[] }>("car", "Transform")!.position;
    expect(pos[0]).toBeCloseTo(10, 4);
  });

  it("faceForward writes yaw aligned with the velocity vector (three.js -Z convention)", () => {
    const world = new World();
    world.addEntity("car");
    world.setComponent("car", "Transform", { position: [0, 0, 0] });
    world.setComponent("car", WAYPOINT_MOVER, {
      waypoints: [
        { position: [0, 0, 0], duration: 0.01 },
        { position: [10, 0, 0], duration: 1.0 }
      ],
      faceForward: true
    });
    const system = createWaypointMoverSystem();
    step(system, world, 0.5);
    const transform = world.getComponent<{ rotation: number[] }>("car", "Transform");
    // Moving +X means the entity's local -Z should point +X, i.e. yaw = -90°.
    expect(transform?.rotation[1]).toBeCloseTo(-90, 3);
  });
});
