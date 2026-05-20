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

describe("deathLaunchHeight (S100 KABOOM-SLAPSTICK-DEATH)", () => {
  it("returns 0 at t=0 and t>=duration; positive in between", async () => {
    const { deathLaunchHeight } = await import("../../src/systems/death-animation-system");
    expect(deathLaunchHeight(0)).toBe(0);
    expect(deathLaunchHeight(0.4)).toBe(0);
    expect(deathLaunchHeight(1)).toBe(0);
    expect(deathLaunchHeight(0.1)).toBeGreaterThan(0);
    expect(deathLaunchHeight(0.2)).toBeGreaterThan(0);
    expect(deathLaunchHeight(0.3)).toBeGreaterThan(0);
  });

  it("peaks at t=duration/2 (~0.2) with peak height ~1.5", async () => {
    const { deathLaunchHeight } = await import("../../src/systems/death-animation-system");
    expect(deathLaunchHeight(0.2)).toBeCloseTo(1.5, 5);
    // Symmetric around the midpoint.
    expect(deathLaunchHeight(0.1)).toBeCloseTo(deathLaunchHeight(0.3), 5);
  });
});

describe("deathSpinYaw (S100 KABOOM-SLAPSTICK-DEATH)", () => {
  it("starts at baseY, ends one full revolution later", async () => {
    const { deathSpinYaw } = await import("../../src/systems/death-animation-system");
    expect(deathSpinYaw(0, 0)).toBe(0);
    expect(deathSpinYaw(0.4, 0)).toBeCloseTo(Math.PI * 2, 5);
    expect(deathSpinYaw(1, 0)).toBeCloseTo(Math.PI * 2, 5);
  });

  it("linear interpolation — mid-point is half a revolution", async () => {
    const { deathSpinYaw } = await import("../../src/systems/death-animation-system");
    expect(deathSpinYaw(0.2, 0)).toBeCloseTo(Math.PI, 5);
  });

  it("preserves baseY offset", async () => {
    const { deathSpinYaw } = await import("../../src/systems/death-animation-system");
    expect(deathSpinYaw(0, 1)).toBe(1);
    expect(deathSpinYaw(0.4, 1)).toBeCloseTo(1 + Math.PI * 2, 5);
  });
});

describe("S100 KABOOM-SLAPSTICK-DEATH (system integration)", () => {
  it("writes Transform.position.y above base mid-curve, returns to base at end", async () => {
    const { createKaboomDeathAnimationSystem } = await import("../../src/systems/death-animation-system");
    const world = new World();
    addBomber(world);
    // Position bomber at world (5, 0, 7) — non-zero base.
    world.setComponent("bot.1", "Transform", { position: [5, 0, 7], rotation: [0, 0, 0], scale: [1, 1, 1] });
    world.setComponent("bot.1", "DeathAnim", { elapsed: 0 });
    const system = createKaboomDeathAnimationSystem();
    // Mid-curve (~ tick 12 at 1/60 = 0.2s = peak): bomber should be airborne.
    for (let i = 0; i < 12; i += 1) system.fixedUpdate!(ctx(world));
    const midT = world.getComponent("bot.1", "Transform") as { position: number[] };
    expect(midT.position[1]).toBeGreaterThan(0.5);
    expect(midT.position[0]).toBe(5);
    expect(midT.position[2]).toBe(7);
    // Run to completion: position back at base.
    for (let i = 0; i < 30; i += 1) system.fixedUpdate!(ctx(world));
    const endT = world.getComponent("bot.1", "Transform") as { position: number[] };
    expect(endT.position[1]).toBeCloseTo(0, 3);
  });

  it("writes Transform.rotation.y across a full revolution by the end", async () => {
    const { createKaboomDeathAnimationSystem } = await import("../../src/systems/death-animation-system");
    const world = new World();
    addBomber(world);
    world.setComponent("bot.1", "DeathAnim", { elapsed: 0 });
    const system = createKaboomDeathAnimationSystem();
    for (let i = 0; i < 30; i += 1) system.fixedUpdate!(ctx(world));
    const t = world.getComponent("bot.1", "Transform") as { rotation: number[] };
    // Yaw should be near 2π (one full revolution).
    const yaw = ((t.rotation[1] ?? 0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    expect(yaw === 0 || Math.abs(yaw - Math.PI * 2) < 0.01).toBe(true);
  });
});
