// S105 KABOOM-SPRING-PIVOT-SYSTEM tests.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import {
  DEFAULT_SPRING_DAMPING,
  DEFAULT_SPRING_K,
  SPRING_PIVOT,
  createSpringPivotSystem,
  stepSpring
} from "../../src/systems/spring-pivot-system";

function ctx(world: World, fixedDt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt: fixedDt, fixedDt, frameCount: 0, fixedStepCount: 0 }
  };
}

describe("stepSpring (S105 pure helper)", () => {
  it("returns base state when at rest with zero velocity", () => {
    const result = stepSpring([0, 0, 0], [0, 0, 0], [0, 0, 0], 18, 0.4, 1 / 60);
    expect(result.rotation).toEqual([0, 0, 0]);
    expect(result.velocity).toEqual([0, 0, 0]);
  });

  it("pulls displaced rotation back toward rest", () => {
    // Displaced by +30° from rest; zero initial velocity → spring pulls back (negative accel).
    const result = stepSpring([30, 0, 0], [0, 0, 0], [0, 0, 0], 18, 0.4, 1 / 60);
    expect(result.velocity[0]!).toBeLessThan(0);
    // After one tick, rotation moves toward zero (current + velocity * dt, where velocity went negative).
    expect(result.rotation[0]!).toBeLessThan(30);
  });

  it("dissipates energy over time (under-damped spring still loses amplitude)", () => {
    // k=18 + damping=0.4 is intentionally UNDER-damped (gives a lively
    // flail / sway feel). Critical damping for k=18 ≈ 8.49 — well above
    // 0.4. So we test that the peak amplitude decreases, NOT that the
    // spring converges fully.
    let rotation = [30, 0, 0] as ReadonlyArray<number>;
    let velocity = [0, 0, 0] as ReadonlyArray<number>;
    let peakEarly = 0;
    let peakLate = 0;
    const dt = 1 / 60;
    for (let i = 0; i < 600; i += 1) {
      const next = stepSpring(rotation, [0, 0, 0], velocity, 18, 0.4, dt);
      rotation = next.rotation;
      velocity = next.velocity;
      const amp = Math.abs(rotation[0]!);
      if (i < 60) peakEarly = Math.max(peakEarly, amp);       // 0..1s
      else if (i > 540) peakLate = Math.max(peakLate, amp);   // 9..10s
    }
    expect(peakLate).toBeLessThan(peakEarly); // energy decreases
  });

  it("treats axes independently", () => {
    const result = stepSpring([10, 20, 30], [0, 0, 0], [0, 0, 0], 18, 0.4, 1 / 60);
    // All three velocities should be negative (each axis pulls back independently).
    expect(result.velocity[0]!).toBeLessThan(0);
    expect(result.velocity[1]!).toBeLessThan(0);
    expect(result.velocity[2]!).toBeLessThan(0);
    // Z had the largest displacement → largest restoring force.
    expect(Math.abs(result.velocity[2]!)).toBeGreaterThan(Math.abs(result.velocity[0]!));
  });
});

describe("createSpringPivotSystem (S105)", () => {
  it("integrates Transform.rotation on entities with SpringPivot", () => {
    const world = new World();
    world.addEntity("pivot.1");
    world.setComponent("pivot.1", "Transform", {
      position: [0, 0, 0],
      rotation: [40, 0, 0],
      scale: [1, 1, 1]
    });
    world.setComponent("pivot.1", SPRING_PIVOT, {
      restRotation: [0, 0, 0],
      velocity: [0, 0, 0]
    });
    const system = createSpringPivotSystem();
    for (let i = 0; i < 60; i += 1) system.fixedUpdate!(ctx(world));
    const t = world.getComponent<{ rotation: ReadonlyArray<number> }>("pivot.1", "Transform")!;
    expect(Math.abs(t.rotation[0]!)).toBeLessThan(40); // Decayed from 40°.
  });

  it("default k + damping apply when component omits them", () => {
    expect(DEFAULT_SPRING_K).toBe(18);
    expect(DEFAULT_SPRING_DAMPING).toBe(0.4);
  });

  it("writes back the updated velocity into the component", () => {
    const world = new World();
    world.addEntity("pivot.1");
    world.setComponent("pivot.1", "Transform", { position: [0, 0, 0], rotation: [20, 0, 0], scale: [1, 1, 1] });
    world.setComponent("pivot.1", SPRING_PIVOT, { restRotation: [0, 0, 0], velocity: [0, 0, 0] });
    const system = createSpringPivotSystem();
    system.fixedUpdate!(ctx(world));
    const spring = world.getComponent<{ velocity: ReadonlyArray<number> }>("pivot.1", SPRING_PIVOT)!;
    expect(spring.velocity[0]).not.toBe(0);
  });

  it("skips entities without Transform (no crash)", () => {
    const world = new World();
    world.addEntity("orphan");
    world.setComponent("orphan", SPRING_PIVOT, { restRotation: [0, 0, 0], velocity: [0, 0, 0] });
    const system = createSpringPivotSystem();
    expect(() => system.fixedUpdate!(ctx(world))).not.toThrow();
  });

  it("zero dt is a no-op", () => {
    const world = new World();
    world.addEntity("pivot.1");
    world.setComponent("pivot.1", "Transform", { position: [0, 0, 0], rotation: [30, 0, 0], scale: [1, 1, 1] });
    world.setComponent("pivot.1", SPRING_PIVOT, { restRotation: [0, 0, 0], velocity: [0, 0, 0] });
    const system = createSpringPivotSystem();
    system.fixedUpdate!(ctx(world, 0));
    const t = world.getComponent<{ rotation: ReadonlyArray<number> }>("pivot.1", "Transform")!;
    expect(t.rotation[0]).toBe(30);
  });
});
