// S90 KABOOM-DEATH-FALL.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import {
  createKaboomDeathAnimationSystem,
  deathFallPitch
} from "../../src/systems/death-animation-system";

function ctx(world: World, fixedDt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt: fixedDt, fixedDt, frameCount: 0, fixedStepCount: 0 }
  };
}

function addBomber(world: World): void {
  world.addEntity("bot.1");
  world.setComponent("bot.1", "Transform", { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
}

describe("deathFallPitch (S90 KABOOM-DEATH-FALL pure helper)", () => {
  it("returns the baseline when elapsed <= 0", () => {
    expect(deathFallPitch(0, 0)).toBe(0);
    expect(deathFallPitch(-0.01, 0.5)).toBe(0.5);
  });

  it("returns the 90° target when elapsed >= duration", () => {
    expect(deathFallPitch(0.4, 0)).toBeCloseTo(Math.PI / 2, 5);
    expect(deathFallPitch(10, 0)).toBeCloseTo(Math.PI / 2, 5);
  });

  it("interpolates monotonically between baseline and target", () => {
    const samples: number[] = [];
    for (let t = 0; t <= 0.4; t += 0.05) samples.push(deathFallPitch(t, 0));
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]!).toBeGreaterThanOrEqual(samples[i - 1]!);
    }
  });
});

describe("createKaboomDeathAnimationSystem (S90 KABOOM-DEATH-FALL)", () => {
  it("rewrites Transform.rotation each tick a DeathAnim is alive", () => {
    const world = new World();
    addBomber(world);
    world.setComponent("bot.1", "DeathAnim", { elapsed: 0 });
    const system = createKaboomDeathAnimationSystem();
    system.fixedUpdate!(ctx(world));
    const t = world.getComponent("bot.1", "Transform") as { rotation: number[] };
    expect(t.rotation[0]).toBeGreaterThan(0);
    expect(t.rotation[0]).toBeLessThan(Math.PI / 2);
  });

  it("reaches the 90° tip after ~0.4 s of fixed steps", () => {
    const world = new World();
    addBomber(world);
    world.setComponent("bot.1", "DeathAnim", { elapsed: 0 });
    const system = createKaboomDeathAnimationSystem();
    for (let i = 0; i < 30; i += 1) system.fixedUpdate!(ctx(world));
    const t = world.getComponent("bot.1", "Transform") as { rotation: number[] };
    expect(t.rotation[0]).toBeCloseTo(Math.PI / 2, 3);
  });

  it("ignores entities without DeathAnim", () => {
    const world = new World();
    addBomber(world);
    const system = createKaboomDeathAnimationSystem();
    system.fixedUpdate!(ctx(world));
    const t = world.getComponent("bot.1", "Transform") as { rotation: number[] };
    expect(t.rotation[0]).toBe(0);
  });
});
