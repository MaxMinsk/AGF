import { describe, expect, it } from "vitest";
import { World } from "../../engine/core/ecs/world";
import { createSpinSystem } from "../../engine/core/systems/spin-system";
import type { TimeContext } from "../../engine/core/loop/types";

function tick(elapsed: number, dt: number): TimeContext {
  return { elapsed, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0 };
}

describe("SpinSystem", () => {
  it("advances rotation on the selected axis by speed * dt", () => {
    const world = new World();
    world.addEntity("cube");
    world.setComponent("cube", "Transform", { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
    world.setComponent("cube", "Spin", { axis: "y", speed: 90 });

    const system = createSpinSystem();
    system.fixedUpdate?.({ time: tick(0, 1 / 60), world });

    const transform = world.getComponent<{ rotation: [number, number, number] }>("cube", "Transform");
    expect(transform?.rotation[0]).toBe(0);
    expect(transform?.rotation[1]).toBeCloseTo(1.5, 5);
    expect(transform?.rotation[2]).toBe(0);
  });

  it("ignores entities that do not have both Spin and Transform", () => {
    const world = new World();
    world.addEntity("only-spin");
    world.setComponent("only-spin", "Spin", { axis: "y", speed: 10 });
    world.addEntity("only-transform");
    world.setComponent("only-transform", "Transform", { rotation: [0, 0, 0] });

    const system = createSpinSystem();

    expect(() => system.fixedUpdate?.({ time: tick(0, 0.1), world })).not.toThrow();
    expect(world.getComponent("only-transform", "Transform")).toEqual({ rotation: [0, 0, 0] });
  });

  it("supports x and z axes", () => {
    const world = new World();
    world.addEntity("a");
    world.setComponent("a", "Transform", { rotation: [10, 20, 30] });
    world.setComponent("a", "Spin", { axis: "x", speed: 60 });
    world.addEntity("b");
    world.setComponent("b", "Transform", { rotation: [10, 20, 30] });
    world.setComponent("b", "Spin", { axis: "z", speed: 60 });

    const system = createSpinSystem();
    system.fixedUpdate?.({ time: tick(0, 0.5), world });

    const a = world.getComponent<{ rotation: [number, number, number] }>("a", "Transform");
    const b = world.getComponent<{ rotation: [number, number, number] }>("b", "Transform");
    expect(a?.rotation).toEqual([40, 20, 30]);
    expect(b?.rotation).toEqual([10, 20, 60]);
  });

  it("defaults missing rotation to [0, 0, 0]", () => {
    const world = new World();
    world.addEntity("cube");
    world.setComponent("cube", "Transform", {});
    world.setComponent("cube", "Spin", { axis: "y", speed: 30 });

    const system = createSpinSystem();
    system.fixedUpdate?.({ time: tick(0, 1), world });

    const transform = world.getComponent<{ rotation: [number, number, number] }>("cube", "Transform");
    expect(transform?.rotation).toEqual([0, 30, 0]);
  });
});
