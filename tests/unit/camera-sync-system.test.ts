import { describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import {
  ACTIVE_CAMERA,
  createCameraSyncSystem
} from "../../engine/render/systems/camera-sync-system";

function ctx(world: World) {
  return {
    world,
    time: {
      elapsed: 0,
      dt: 1 / 60,
      fixedDt: 1 / 60,
      frameCount: 0,
      fixedStepCount: 0
    }
  } as const;
}

describe("CameraSyncSystem", () => {
  it("tags the first Camera entity as active when none is explicitly active", () => {
    const world = new World();
    world.addEntity("cam.a");
    world.setComponent("cam.a", "Camera", { kind: "perspective", fov: 60 });
    world.addEntity("cam.b");
    world.setComponent("cam.b", "Camera", { kind: "perspective", fov: 75 });

    const system = createCameraSyncSystem();
    system.frameUpdate?.(ctx(world));

    expect(world.hasComponent("cam.a", ACTIVE_CAMERA)).toBe(true);
    expect(world.hasComponent("cam.b", ACTIVE_CAMERA)).toBe(false);
    expect(system.activeEntityId()).toBe("cam.a");
  });

  it("prefers the camera flagged active === true", () => {
    const world = new World();
    world.addEntity("cam.a");
    world.setComponent("cam.a", "Camera", { kind: "perspective" });
    world.addEntity("cam.b");
    world.setComponent("cam.b", "Camera", { kind: "perspective", active: true });

    const system = createCameraSyncSystem();
    system.frameUpdate?.(ctx(world));

    expect(world.hasComponent("cam.b", ACTIVE_CAMERA)).toBe(true);
    expect(world.hasComponent("cam.a", ACTIVE_CAMERA)).toBe(false);
  });

  it("moves the ActiveCamera marker when the explicit flag changes", () => {
    const world = new World();
    world.addEntity("cam.a");
    world.setComponent("cam.a", "Camera", { kind: "perspective", active: true });
    world.addEntity("cam.b");
    world.setComponent("cam.b", "Camera", { kind: "perspective" });

    const system = createCameraSyncSystem();
    system.frameUpdate?.(ctx(world));
    expect(world.hasComponent("cam.a", ACTIVE_CAMERA)).toBe(true);

    world.setComponent("cam.a", "Camera", { kind: "perspective" });
    world.setComponent("cam.b", "Camera", { kind: "perspective", active: true });
    system.frameUpdate?.(ctx(world));

    expect(world.hasComponent("cam.a", ACTIVE_CAMERA)).toBe(false);
    expect(world.hasComponent("cam.b", ACTIVE_CAMERA)).toBe(true);
  });

  it("clears stray ActiveCamera markers on entities that aren't the picked camera", () => {
    const world = new World();
    world.addEntity("cam.a");
    world.setComponent("cam.a", "Camera", { kind: "perspective" });
    world.addEntity("ghost");
    world.setComponent("ghost", "ActiveCamera", {});

    const system = createCameraSyncSystem();
    system.frameUpdate?.(ctx(world));

    expect(world.hasComponent("cam.a", ACTIVE_CAMERA)).toBe(true);
    expect(world.hasComponent("ghost", ACTIVE_CAMERA)).toBe(false);
  });

  it("does nothing when there are no Camera entities", () => {
    const world = new World();
    world.addEntity("e");
    const system = createCameraSyncSystem();
    expect(() => system.frameUpdate?.(ctx(world))).not.toThrow();
    expect(system.activeEntityId()).toBeUndefined();
  });
});
