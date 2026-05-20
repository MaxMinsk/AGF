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

  it("S095 KABOOM-CAMERA-EASING-ADOPT: easeOutBack overshoots the target before settling", () => {
    // Sample across the duration. easeOutBack peaks > 1 around t ≈ 0.74
    // (the named curve from engine/core/systems/tween-system.ts), so
    // deathFallPitch samples to a pitch GREATER than the 90° target at
    // some mid-curve sample before settling on the target at t=duration.
    const samples: number[] = [];
    for (let t = 0; t <= 0.4; t += 0.01) samples.push(deathFallPitch(t, 0));
    const peak = Math.max(...samples);
    expect(peak).toBeGreaterThan(Math.PI / 2);
    // End-of-curve (and beyond) still lands on the target — the loop
    // may stop just shy of 0.4 due to fp accumulation, so probe explicitly.
    expect(deathFallPitch(0.4, 0)).toBeCloseTo(Math.PI / 2, 5);
    expect(deathFallPitch(1, 0)).toBeCloseTo(Math.PI / 2, 5);
    // The peak should be only a small overshoot (~10%), not a wild jump.
    expect(peak).toBeLessThan(Math.PI / 2 * 1.15);
  });

  it("S095 KABOOM-CAMERA-EASING-ADOPT: monotonic up to the overshoot peak", () => {
    // Pre-peak segment (t in [0, 0.5]) is still monotonic — only the
    // back-half overshoots and returns.
    const samples: number[] = [];
    for (let t = 0; t <= 0.20; t += 0.01) samples.push(deathFallPitch(t, 0));
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
