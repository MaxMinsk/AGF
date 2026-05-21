// S106 KABOOM-ACCESSORY-SOFT-ATTACH-SWAY.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import {
  createSoftAttachSwaySystem,
  linearDisplacementToAngularNudgeDegPerS
} from "../../src/systems/soft-attach-sway-system";

function ctx(world: World, fixedDt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt: fixedDt, fixedDt, frameCount: 0, fixedStepCount: 0 }
  };
}

describe("linearDisplacementToAngularNudgeDegPerS (S106 pure helper)", () => {
  it("zero displacement = zero nudge", () => {
    const n = linearDisplacementToAngularNudgeDegPerS(0, 0, 1 / 60);
    expect(n.x).toBeCloseTo(0, 10);
    expect(n.z).toBeCloseTo(0, 10);
  });
  it("positive parent X → negative Z nudge (lean back as parent moves forward)", () => {
    const n = linearDisplacementToAngularNudgeDegPerS(0.05, 0, 1 / 60);
    expect(n.z).toBeLessThan(0);
    expect(n.x).toBeCloseTo(0, 10);
  });
  it("positive parent Z → positive X nudge", () => {
    const n = linearDisplacementToAngularNudgeDegPerS(0, 0.05, 1 / 60);
    expect(n.x).toBeGreaterThan(0);
    expect(n.z).toBeCloseTo(0, 10);
  });
  it("zero dt is a no-op", () => {
    expect(linearDisplacementToAngularNudgeDegPerS(0.1, 0.1, 0)).toEqual({ x: 0, z: 0 });
  });
});

describe("createSoftAttachSwaySystem (S106)", () => {
  function stageScene(parentX: number, parentZ: number) {
    const world = new World();
    world.addEntity("parent");
    world.setComponent("parent", "LocalToWorld", {
      position: [parentX, 0, parentZ],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    });
    world.addEntity("accessory");
    world.setComponent("accessory", "Transform", { parent: "parent", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
    world.setComponent("accessory", "SoftAttached", {});
    world.setComponent("accessory", "SpringPivot", { restRotation: [0, 0, 0], velocity: [0, 0, 0] });
    return world;
  }

  it("first tick captures parent position without nudging (no prev to compare)", () => {
    const world = stageScene(0, 0);
    const system = createSoftAttachSwaySystem();
    system.fixedUpdate!(ctx(world));
    const spring = world.getComponent<{ velocity: ReadonlyArray<number> }>("accessory", "SpringPivot")!;
    expect(spring.velocity).toEqual([0, 0, 0]);
  });

  it("parent moves in X between ticks → SpringPivot.velocity.z nudged", () => {
    const world = stageScene(0, 0);
    const system = createSoftAttachSwaySystem();
    system.fixedUpdate!(ctx(world));
    // Move parent.
    world.setComponent("parent", "LocalToWorld", { position: [0.1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
    system.fixedUpdate!(ctx(world));
    const spring = world.getComponent<{ velocity: ReadonlyArray<number> }>("accessory", "SpringPivot")!;
    expect(spring.velocity[2]!).not.toBe(0);
  });

  it("stationary parent = no nudge", () => {
    const world = stageScene(0, 0);
    const system = createSoftAttachSwaySystem();
    system.fixedUpdate!(ctx(world));
    system.fixedUpdate!(ctx(world));
    system.fixedUpdate!(ctx(world));
    const spring = world.getComponent<{ velocity: ReadonlyArray<number> }>("accessory", "SpringPivot")!;
    expect(spring.velocity).toEqual([0, 0, 0]);
  });

  it("skips entities without SoftAttached", () => {
    const world = new World();
    world.addEntity("parent");
    world.setComponent("parent", "LocalToWorld", { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
    world.addEntity("solo");
    world.setComponent("solo", "Transform", { parent: "parent", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
    world.setComponent("solo", "SpringPivot", { restRotation: [0, 0, 0], velocity: [0, 0, 0] });
    const system = createSoftAttachSwaySystem();
    expect(() => system.fixedUpdate!(ctx(world))).not.toThrow();
    const spring = world.getComponent<{ velocity: ReadonlyArray<number> }>("solo", "SpringPivot")!;
    expect(spring.velocity).toEqual([0, 0, 0]);
  });
});
