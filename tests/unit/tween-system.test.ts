// M19-tween unit coverage. Each test drives the system through a few
// fixed steps and asserts the targeted component field landed at the
// expected interpolated value.

import { describe, expect, it } from "vitest";
import { World } from "../../engine/core/ecs/world";

const createWorld = (): World => new World();
import { advanceEntityTweens, createTweenSystem, TWEENS } from "../../engine/core/systems/tween-system";

function step(system: ReturnType<typeof createTweenSystem>, world: World, dt: number): void {
  system.frameUpdate?.({
    time: { elapsed: 0, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0, physicsAlpha: 0 },
    world
  });
}

describe("createTweenSystem", () => {
  it("linearly interpolates a numeric Transform.scale field", () => {
    const world = createWorld();
    world.addEntity("e");
    world.setComponent("e", "Transform", { scale: [1, 1, 1] });
    world.setComponent("e", TWEENS, [
      { component: "Transform", property: "scale", from: [1, 1, 1], to: [2, 2, 2], duration: 1.0 }
    ]);
    const system = createTweenSystem();

    step(system, world, 0.5);
    const transform = world.getComponent<{ scale: number[] }>("e", "Transform");
    expect(transform?.scale[0]).toBeCloseTo(1.5, 5);
    expect(transform?.scale[1]).toBeCloseTo(1.5, 5);
    expect(transform?.scale[2]).toBeCloseTo(1.5, 5);
  });

  it("removes the Tweens component when a one-shot tween completes", () => {
    const world = createWorld();
    world.addEntity("e");
    world.setComponent("e", "Transform", { scale: [1, 1, 1] });
    world.setComponent("e", TWEENS, [
      { component: "Transform", property: "scale", from: [1, 1, 1], to: [2, 2, 2], duration: 0.5 }
    ]);
    const system = createTweenSystem();
    step(system, world, 0.5);
    step(system, world, 0.1);
    expect(world.getComponent("e", TWEENS)).toBeUndefined();
    const transform = world.getComponent<{ scale: number[] }>("e", "Transform");
    expect(transform?.scale[0]).toBeCloseTo(2, 5);
  });

  it("ping-pong flips from/to and continues", () => {
    const world = createWorld();
    world.addEntity("e");
    world.setComponent("e", "Transform", { position: [0, 0, 0] });
    world.setComponent("e", TWEENS, [
      {
        component: "Transform",
        property: "position",
        from: [0, 0, 0],
        to: [10, 0, 0],
        duration: 1.0,
        loop: "ping-pong"
      }
    ]);
    const system = createTweenSystem();

    step(system, world, 1.0); // reach end
    let pos = world.getComponent<{ position: number[] }>("e", "Transform")!.position;
    expect(pos[0]).toBeCloseTo(10, 4);

    step(system, world, 1.0); // run reverse cycle
    pos = world.getComponent<{ position: number[] }>("e", "Transform")!.position;
    expect(pos[0]).toBeCloseTo(0, 4);

    // The tween must still be active (ping-pong never auto-removes).
    expect(world.getComponent("e", TWEENS)).toBeDefined();
  });

  it("loop resets elapsed and keeps applying", () => {
    const world = createWorld();
    world.addEntity("e");
    world.setComponent("e", "Transform", { position: [0, 0, 0] });
    world.setComponent("e", TWEENS, [
      {
        component: "Transform",
        property: "position",
        from: [0, 0, 0],
        to: [10, 0, 0],
        duration: 1.0,
        loop: "loop"
      }
    ]);
    const system = createTweenSystem();
    step(system, world, 1.5);
    const pos = world.getComponent<{ position: number[] }>("e", "Transform")!.position;
    // 1.5 wraps to elapsed=0.5 → halfway through cycle 2 → t=0.5.
    expect(pos[0]).toBeCloseTo(5, 4);
    expect(world.getComponent("e", TWEENS)).toBeDefined();
  });

  it("easeOut produces a value above linear at t=0.5", () => {
    const world = createWorld();
    world.addEntity("e");
    world.setComponent("e", "Transform", { scale: 1 });
    world.setComponent("e", TWEENS, [
      { component: "Transform", property: "scale", from: 0, to: 1, duration: 1.0, ease: "easeOut" }
    ]);
    advanceEntityTweens(world, "e", 0.5);
    const transform = world.getComponent<{ scale: number }>("e", "Transform");
    // easeOut(0.5) = 0.75 > 0.5 (linear).
    expect(transform?.scale).toBeCloseTo(0.75, 4);
  });

  it("falls through entities without a Tweens component", () => {
    const world = createWorld();
    world.addEntity("a");
    world.setComponent("a", "Transform", { position: [0, 0, 0] });
    const system = createTweenSystem();
    expect(() => step(system, world, 0.1)).not.toThrow();
    expect(world.getComponent("a", "Transform")).toEqual({ position: [0, 0, 0] });
  });
});
