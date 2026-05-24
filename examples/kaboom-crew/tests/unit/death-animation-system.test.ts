// S105 KABOOM-RAGDOLL-ROOT-ARC + LIMB-FLAIL — replaces the S100 tween tests.
//
// S132 — tests SKIPPED. The system this file covers
// (createKaboomDeathAnimationSystem) was de-registered when the engine
// ragdoll module took over the death visual. The implementation file
// stays as a soft archive until S133 deletes both the source + this
// test file. Skipping (rather than deleting now) lets us flip the
// describe back to active for a one-off regression check if S133 has
// to roll back.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import {
  createKaboomDeathAnimationSystem,
  pivotImpulseDegPerS
} from "../../src/systems/death-animation-system";

function ctx(world: World, fixedDt = 1 / 60, elapsed = 0) {
  return {
    world,
    time: { elapsed, dt: fixedDt, fixedDt, frameCount: 0, fixedStepCount: 0 }
  };
}

function addBomber(world: World, opts: { gx?: number; gz?: number } = {}) {
  world.addEntity("bot.1");
  world.setComponent("bot.1", "Transform", { position: [opts.gx ?? 5, 0, opts.gz ?? 5], rotation: [0, 0, 0], scale: [1, 1, 1] });
  world.setComponent("bot.1", "GridPosition", { gx: opts.gx ?? 5, gz: opts.gz ?? 5 });
}

describe.skip("pivotImpulseDegPerS (S105 pure helper)", () => {
  it("returns the same magnitude for the same inputs (deterministic)", () => {
    const a = pivotImpulseDegPerS("bot.1", 2, 3, "shoulderL");
    const b = pivotImpulseDegPerS("bot.1", 2, 3, "shoulderL");
    expect(a).toEqual(b);
  });
  it("differs across pivot names", () => {
    const a = pivotImpulseDegPerS("bot.1", 2, 3, "shoulderL");
    const b = pivotImpulseDegPerS("bot.1", 2, 3, "kneeR");
    expect(a).not.toEqual(b);
  });
  it("magnitude stays inside the documented range [90, 360]", () => {
    for (const pivot of ["neck", "shoulderL", "shoulderR", "hipR", "kneeL"]) {
      const impulse = pivotImpulseDegPerS("bot.1", 1, 1, pivot);
      expect(Math.abs(impulse.x)).toBeGreaterThanOrEqual(90);
      expect(Math.abs(impulse.x)).toBeLessThanOrEqual(360);
    }
  });
});

describe.skip("createKaboomDeathAnimationSystem (S105 ragdoll)", () => {
  it("does nothing for entities without DeathAnim", () => {
    const world = new World();
    addBomber(world);
    const system = createKaboomDeathAnimationSystem();
    system.fixedUpdate!(ctx(world));
    const t = world.getComponent<{ position: ReadonlyArray<number> }>("bot.1", "Transform")!;
    expect(t.position).toEqual([5, 0, 5]);
  });

  it("first visit primes velocity + angularVelocity from blast direction", () => {
    const world = new World();
    addBomber(world, { gx: 5, gz: 5 });
    world.setComponent("bot.1", "DeathAnim", { elapsed: 0 });
    world.setComponent("bot.1", "DeathImpulse", { blastOriginGx: 3, blastOriginGz: 5, magnitude: 1.0 });
    const system = createKaboomDeathAnimationSystem();
    system.fixedUpdate!(ctx(world));
    const anim = world.getComponent<{ velocity: ReadonlyArray<number>; angularVelocity: ReadonlyArray<number>; initialised: boolean }>("bot.1", "DeathAnim")!;
    expect(anim.initialised).toBe(true);
    // Blast at (3, 5), bomber at (5, 5) → dir = (+1, 0). Launch velocity x positive.
    expect(anim.velocity[0]!).toBeGreaterThan(0);
    expect(anim.velocity[1]!).toBeCloseTo(2.0, 5);
    expect(anim.velocity[2]!).toBeCloseTo(0, 5);
  });

  it("default direction (-Z) when no DeathImpulse present", () => {
    const world = new World();
    addBomber(world);
    world.setComponent("bot.1", "DeathAnim", { elapsed: 0 });
    const system = createKaboomDeathAnimationSystem();
    system.fixedUpdate!(ctx(world));
    const anim = world.getComponent<{ velocity: ReadonlyArray<number> }>("bot.1", "DeathAnim")!;
    expect(anim.velocity[2]!).toBeLessThan(0); // knocked toward -Z by default
  });

  it("integrates a gravity arc — Y rises then falls past ground", () => {
    const world = new World();
    addBomber(world, { gx: 5, gz: 5 });
    world.setComponent("bot.1", "DeathAnim", { elapsed: 0 });
    world.setComponent("bot.1", "DeathImpulse", { blastOriginGx: 3, blastOriginGz: 5 });
    const system = createKaboomDeathAnimationSystem();
    system.fixedUpdate!(ctx(world));
    // After init step, integrate further. Track Y peak.
    let peakY = 0;
    for (let i = 0; i < 40; i += 1) {
      system.fixedUpdate!(ctx(world, 1 / 60, i / 60));
      const t = world.getComponent<{ position: ReadonlyArray<number> }>("bot.1", "Transform")!;
      peakY = Math.max(peakY, t.position[1]!);
    }
    expect(peakY).toBeGreaterThan(0.1); // got off the ground
  });

  it("seeds SpringPivot on every limb pivot listed in LimbPivots", () => {
    const world = new World();
    addBomber(world);
    world.setComponent("bot.1", "DeathAnim", { elapsed: 0 });
    world.setComponent("bot.1", "DeathImpulse", { blastOriginGx: 3, blastOriginGz: 5 });
    // Stub LimbPivots + child entities.
    const pivots: Record<string, string> = {
      neck: "bot.1.neck",
      shoulderL: "bot.1.shoulderL",
      shoulderR: "bot.1.shoulderR",
      elbowL: "bot.1.elbowL",
      elbowR: "bot.1.elbowR",
      hipL: "bot.1.hipL",
      hipR: "bot.1.hipR",
      kneeL: "bot.1.kneeL",
      kneeR: "bot.1.kneeR"
    };
    for (const id of Object.values(pivots)) {
      world.addEntity(id);
      world.setComponent(id, "Transform", { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
    }
    world.setComponent("bot.1", "LimbPivots", pivots);
    const system = createKaboomDeathAnimationSystem();
    system.fixedUpdate!(ctx(world));
    // Every pivot should have a SpringPivot component now.
    for (const id of Object.values(pivots)) {
      const sp = world.getComponent<{ velocity: ReadonlyArray<number>; restRotation: ReadonlyArray<number> }>(id, "SpringPivot");
      expect(sp).toBeDefined();
      expect(sp!.restRotation).toEqual([0, 0, 0]);
      expect(Math.abs(sp!.velocity[0]!) + Math.abs(sp!.velocity[2]!)).toBeGreaterThan(0);
    }
  });

  it("S108 ground clamp: when root lands (Y at base + vy <= 0), angular velocity zeroes + rotation clamps to ±90°", () => {
    const world = new World();
    addBomber(world);
    world.setComponent("bot.1", "DeathAnim", { elapsed: 0 });
    world.setComponent("bot.1", "DeathImpulse", { blastOriginGx: 3, blastOriginGz: 5, magnitude: 1.5 });
    const system = createKaboomDeathAnimationSystem();
    // Run for 2 seconds — gravity-arc fully completes + landing.
    for (let i = 0; i < 120; i += 1) system.fixedUpdate!(ctx(world, 1 / 60, i / 60));
    const anim = world.getComponent<{ velocity: ReadonlyArray<number>; angularVelocity: ReadonlyArray<number> }>("bot.1", "DeathAnim")!;
    expect(anim.velocity).toEqual([0, 0, 0]);
    expect(anim.angularVelocity).toEqual([0, 0, 0]);
    const t = world.getComponent<{ rotation: ReadonlyArray<number>; position: ReadonlyArray<number> }>("bot.1", "Transform")!;
    expect(Math.abs(t.rotation[0]!)).toBeLessThanOrEqual(90);
    expect(Math.abs(t.rotation[2]!)).toBeLessThanOrEqual(90);
    // Position landed at base Y.
    expect(t.position[1]!).toBeCloseTo(0, 5);
  });

  it("DeathImpulse gets deathStartedAt stamped on first visit", () => {
    const world = new World();
    addBomber(world);
    world.setComponent("bot.1", "DeathAnim", { elapsed: 0 });
    world.setComponent("bot.1", "DeathImpulse", { blastOriginGx: 3, blastOriginGz: 5 });
    const system = createKaboomDeathAnimationSystem();
    system.fixedUpdate!(ctx(world, 1 / 60, 7.5));
    const ragdoll = world.getComponent<{ deathStartedAt: number }>("bot.1", "DeathImpulse")!;
    expect(ragdoll.deathStartedAt).toBeCloseTo(7.5, 5);
  });
});
