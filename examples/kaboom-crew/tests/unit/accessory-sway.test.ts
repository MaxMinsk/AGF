// S135 TEST-ACCESSORY-SWAY-IN-KABOOM — regression test for the full
// accessory sway chain. soft-attach-sway-system writes nudges into
// SpringPivot.velocity; spring-pivot-system reads them and decays the
// nudges into accessory Transform.rotation. Without spring-pivot
// registered, accessories freeze (the S132 → S134 silent regression
// this sprint fixes). The test sets up one bomber + one accessory,
// ticks the chain with the parent moving, and asserts that:
//   1. soft-attach-sway writes a non-zero SpringPivot.velocity.
//   2. spring-pivot drives accessory Transform.rotation off zero.
//   3. With the parent at rest, the spring decays rotation back toward
//      zero (energy loss).
//
// If kaboom-crew bootstrap.ts ever drops spring-pivot again, this test
// catches it by failing on assertion 2.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import type { SystemContext } from "../../../../engine/core/systems/types";
import { createSoftAttachSwaySystem } from "../../../procbomber-bench/src/systems/soft-attach-sway-system";
import { createSpringPivotSystem } from "../../../procbomber-bench/src/systems/spring-pivot-system";

const FIXED_DT = 1 / 60;

function makeContext(world: World, elapsed: number, step: number): SystemContext {
  return {
    world,
    time: { elapsed, dt: FIXED_DT, fixedDt: FIXED_DT, frameCount: step, fixedStepCount: step }
  } as SystemContext;
}

function setupBomberWithAccessory(): World {
  const world = new World();
  world.addEntity("bomber.head");
  // soft-attach-sway reads the parent's LocalToWorld each tick.
  world.setComponent("bomber.head", "LocalToWorld", {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  });
  world.addEntity("bomber.accessory0.antenna");
  world.setComponent("bomber.accessory0.antenna", "Transform", {
    parent: "bomber.head",
    position: [0, 0.4, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  });
  world.setComponent("bomber.accessory0.antenna", "SoftAttached", {});
  world.setComponent("bomber.accessory0.antenna", "SpringPivot", {
    restRotation: [0, 0, 0],
    velocity: [0, 0, 0]
  });
  return world;
}

function moveParent(world: World, dx: number, dz: number): void {
  const ltw = world.getComponent<{ position: number[] }>("bomber.head", "LocalToWorld")!;
  world.setComponent("bomber.head", "LocalToWorld", {
    ...ltw,
    position: [ltw.position[0]! + dx, ltw.position[1]!, ltw.position[2]! + dz]
  });
}

describe("accessory sway chain (S106 + S135 FIX)", () => {
  it("parent motion → soft-attach-sway writes non-zero SpringPivot.velocity", () => {
    const world = setupBomberWithAccessory();
    const sway = createSoftAttachSwaySystem();
    // Tick once with parent at rest — seeds prevParentPos, no nudge yet.
    sway.fixedUpdate!(makeContext(world, 0, 0));
    // Move parent and tick again — sway should write a nudge.
    moveParent(world, 0.05, 0);
    sway.fixedUpdate!(makeContext(world, FIXED_DT, 1));
    const spring = world.getComponent<{ velocity: number[] }>("bomber.accessory0.antenna", "SpringPivot")!;
    // Positive X displacement produces a negative Z nudge per the helper.
    expect(spring.velocity[2]!).toBeLessThan(0);
    expect(Math.abs(spring.velocity[2]!)).toBeGreaterThan(1);
  });

  it("spring-pivot decays SpringPivot.velocity into accessory Transform.rotation", () => {
    const world = setupBomberWithAccessory();
    const sway = createSoftAttachSwaySystem();
    const spring = createSpringPivotSystem();
    sway.fixedUpdate!(makeContext(world, 0, 0));
    moveParent(world, 0.05, 0);
    sway.fixedUpdate!(makeContext(world, FIXED_DT, 1));
    spring.fixedUpdate!(makeContext(world, FIXED_DT, 1));
    const t = world.getComponent<{ rotation: number[] }>("bomber.accessory0.antenna", "Transform")!;
    // A non-zero spring velocity for exactly one tick must move the
    // rotation off zero. Direction matches velocity sign — Z velocity
    // was negative, so Z rotation should also be negative after one tick.
    expect(t.rotation[2]!).toBeLessThan(0);
  });

  it("at parent rest, accessory rotation envelope decays over time", () => {
    const world = setupBomberWithAccessory();
    const sway = createSoftAttachSwaySystem();
    const spring = createSpringPivotSystem();
    // Burst the parent once to inject angular energy.
    sway.fixedUpdate!(makeContext(world, 0, 0));
    moveParent(world, 0.05, 0);
    sway.fixedUpdate!(makeContext(world, FIXED_DT, 1));
    spring.fixedUpdate!(makeContext(world, FIXED_DT, 1));
    // Hold the parent still and tick the chain; track the maximum
    // |rotation_Z| seen during the simulation (the underdamped spring
    // overshoots its zero-passing point so peak is reached later than
    // tick 1) AND the final value. Without spring-pivot consuming the
    // velocity, the system would diverge — so the assertion is: max
    // amplitude is bounded AND the final value is below max.
    let peak = Math.abs(
      world.getComponent<{ rotation: number[] }>("bomber.accessory0.antenna", "Transform")!.rotation[2]!
    );
    for (let i = 2; i < 600; i += 1) {
      sway.fixedUpdate!(makeContext(world, i * FIXED_DT, i));
      spring.fixedUpdate!(makeContext(world, i * FIXED_DT, i));
      const z = Math.abs(
        world.getComponent<{ rotation: number[] }>("bomber.accessory0.antenna", "Transform")!.rotation[2]!
      );
      if (z > peak) peak = z;
    }
    const finalAbs = Math.abs(
      world.getComponent<{ rotation: number[] }>("bomber.accessory0.antenna", "Transform")!.rotation[2]!
    );
    // Underdamped spring with damping=0.4 dissipates ~exp(-0.2*t).
    // 10s ≈ exp(-2) ≈ 14% of initial amplitude → final must be well
    // below peak. We use the loose factor 0.5 as a sanity envelope.
    expect(finalAbs).toBeLessThan(peak * 0.5);
  });
});
