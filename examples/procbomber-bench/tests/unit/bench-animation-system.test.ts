// S101 + S102 PROCBOMBER-BENCH-ANIM-DROPDOWN / WALK-SWING-PIVOTS /
// LIMB-TEST-DROPDOWN — pure helpers + system loop.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import {
  createBenchAnimationSystem,
  IDLE_BOB_AMPLITUDE,
  IDLE_BOB_FREQ_HZ,
  LIMB_TEST_DURATION_PER_PIVOT_S,
  LIMB_TEST_ROTATION_RAD,
  WALK_ELBOW_BEND_RAD,
  WALK_KNEE_BEND_RAD,
  WALK_ROOT_BOB_AMPLITUDE,
  WALK_SWING_AMPLITUDE_RAD,
  WALK_SWING_FREQ_HZ,
  idleBobY,
  limbTestActivePivot,
  radToDeg,
  walkBendRotation,
  walkRootBobY,
  walkSwingRotation
} from "../../src/systems/bench-animation-system";
import { LIMB_PIVOTS, LIMB_PIVOT_NAMES, buildLimbPivots } from "../../src/limb-pivots";

function ctx(world: World, fixedDt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt: fixedDt, fixedDt, frameCount: 0, fixedStepCount: 0 }
  };
}

function addBomberRoot(
  world: World,
  kind: "none" | "idle-bob" | "walk-swing" | "limb-test",
  basePosition: [number, number, number] = [0, 0, 0]
) {
  world.addEntity("bomber");
  world.setComponent("bomber", "Transform", {
    position: basePosition,
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  });
  world.setComponent("bomber", "BenchAnimationState", { kind, elapsed: 0 });
  // Add the 9 pivot entities so the system can write rotations.
  const limbPivots = buildLimbPivots((n) => `bomber.${n}`);
  for (const name of LIMB_PIVOT_NAMES) {
    const id = limbPivots[name];
    world.addEntity(id);
    world.setComponent(id, "Transform", { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
  }
  world.setComponent("bomber", LIMB_PIVOTS, limbPivots);
}

describe("idleBobY (S101 pure helper)", () => {
  it("returns the base at elapsed=0", () => {
    expect(idleBobY(0, 0)).toBeCloseTo(0, 6);
    expect(idleBobY(0, 1.5)).toBeCloseTo(1.5, 6);
  });
  it("peaks at quarter-period above the base", () => {
    const quarter = 1 / (4 * IDLE_BOB_FREQ_HZ);
    expect(idleBobY(quarter, 0)).toBeCloseTo(IDLE_BOB_AMPLITUDE, 6);
  });
  it("returns the base again at half-period", () => {
    const half = 1 / (2 * IDLE_BOB_FREQ_HZ);
    expect(idleBobY(half, 0)).toBeCloseTo(0, 6);
  });
});

describe("radToDeg (S103 pure helper)", () => {
  it("converts radians to degrees", () => {
    expect(radToDeg(0)).toBe(0);
    expect(radToDeg(Math.PI)).toBeCloseTo(180, 6);
    expect(radToDeg(Math.PI / 2)).toBeCloseTo(90, 6);
    expect(radToDeg(0.5)).toBeCloseTo(28.6479, 3);
  });
});

describe("walkSwingRotation (S102 pure helper)", () => {
  it("starts at 0 for every limb at elapsed=0", () => {
    expect(walkSwingRotation(0, "shoulderL")).toBeCloseTo(0, 6);
    expect(walkSwingRotation(0, "shoulderR")).toBeCloseTo(0, 6);
    expect(walkSwingRotation(0, "hipL")).toBeCloseTo(0, 6);
    expect(walkSwingRotation(0, "hipR")).toBeCloseTo(0, 6);
  });
  it("cross-body counter-phase: shoulderL + hipR are in phase, shoulderR + hipL are in opposite phase", () => {
    // Quarter period: shoulderL at +amplitude, shoulderR at -amplitude.
    const quarter = 1 / (4 * WALK_SWING_FREQ_HZ);
    expect(walkSwingRotation(quarter, "shoulderL")).toBeCloseTo(WALK_SWING_AMPLITUDE_RAD, 4);
    expect(walkSwingRotation(quarter, "hipR")).toBeCloseTo(WALK_SWING_AMPLITUDE_RAD, 4);
    expect(walkSwingRotation(quarter, "shoulderR")).toBeCloseTo(-WALK_SWING_AMPLITUDE_RAD, 4);
    expect(walkSwingRotation(quarter, "hipL")).toBeCloseTo(-WALK_SWING_AMPLITUDE_RAD, 4);
  });
});

describe("walkBendRotation (S103 PROCBOMBER-WALK-CYCLE-PLUS)", () => {
  it("knees bend BACKWARD (negative)", () => {
    // Sample several phases — every kneeL output should be <= 0.
    for (let t = 0; t < 1; t += 0.07) {
      expect(walkBendRotation(t, "kneeL")).toBeLessThanOrEqual(0);
      expect(walkBendRotation(t, "kneeR")).toBeLessThanOrEqual(0);
    }
  });
  it("elbows bend FORWARD (non-negative)", () => {
    for (let t = 0; t < 1; t += 0.07) {
      expect(walkBendRotation(t, "elbowL")).toBeGreaterThanOrEqual(0);
      expect(walkBendRotation(t, "elbowR")).toBeGreaterThanOrEqual(0);
    }
  });
  it("knee bend magnitude peaks at WALK_KNEE_BEND_RAD", () => {
    let maxAbs = 0;
    for (let t = 0; t < 2; t += 0.005) {
      maxAbs = Math.max(maxAbs, Math.abs(walkBendRotation(t, "kneeL")));
    }
    expect(maxAbs).toBeCloseTo(WALK_KNEE_BEND_RAD, 3);
  });
  it("elbow bend magnitude peaks at WALK_ELBOW_BEND_RAD", () => {
    let maxAbs = 0;
    for (let t = 0; t < 2; t += 0.005) {
      maxAbs = Math.max(maxAbs, Math.abs(walkBendRotation(t, "elbowR")));
    }
    expect(maxAbs).toBeCloseTo(WALK_ELBOW_BEND_RAD, 3);
  });
});

describe("walkRootBobY (S103 PROCBOMBER-WALK-CYCLE-PLUS)", () => {
  it("returns base at elapsed=0 (cos starts at 1, bob = 0)", () => {
    expect(walkRootBobY(0, 1.5)).toBeCloseTo(1.5, 6);
  });
  it("stays within [base - amplitude, base]", () => {
    for (let t = 0; t < 2; t += 0.01) {
      const y = walkRootBobY(t, 1);
      expect(y).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(1 - WALK_ROOT_BOB_AMPLITUDE - 1e-6);
    }
  });
});

describe("limbTestActivePivot (S102 pure helper)", () => {
  it("starts at 'neck' (first pivot in LIMB_PIVOT_NAMES order)", () => {
    expect(limbTestActivePivot(0)).toBe(LIMB_PIVOT_NAMES[0]);
  });
  it("advances to the next pivot after LIMB_TEST_DURATION_PER_PIVOT_S seconds", () => {
    expect(limbTestActivePivot(LIMB_TEST_DURATION_PER_PIVOT_S + 0.01)).toBe(LIMB_PIVOT_NAMES[1]);
    expect(limbTestActivePivot(LIMB_TEST_DURATION_PER_PIVOT_S * 5 + 0.01)).toBe(LIMB_PIVOT_NAMES[5]);
  });
  it("wraps after the full cycle", () => {
    const cycle = LIMB_PIVOT_NAMES.length * LIMB_TEST_DURATION_PER_PIVOT_S;
    expect(limbTestActivePivot(cycle + 0.01)).toBe(LIMB_PIVOT_NAMES[0]);
  });
});

describe("createBenchAnimationSystem (S102)", () => {
  it("idle-bob raises root.position.y above the base after a few ticks", () => {
    const world = new World();
    addBomberRoot(world, "idle-bob");
    const system = createBenchAnimationSystem();
    const ticks = Math.round(1 / (4 * IDLE_BOB_FREQ_HZ) / (1 / 60));
    for (let i = 0; i < ticks; i += 1) system.fixedUpdate!(ctx(world));
    const t = world.getComponent<{ position: ReadonlyArray<number> }>("bomber", "Transform")!;
    expect(t.position[1]!).toBeGreaterThan(0);
  });

  it("walk-swing rotates shoulderL and hipR positively at quarter-period (degree-scale)", () => {
    const world = new World();
    addBomberRoot(world, "walk-swing");
    const system = createBenchAnimationSystem();
    const ticks = Math.round(1 / (4 * WALK_SWING_FREQ_HZ) / (1 / 60));
    for (let i = 0; i < ticks; i += 1) system.fixedUpdate!(ctx(world));
    const lShoulder = world.getComponent<{ rotation: ReadonlyArray<number> }>("bomber.shoulderL", "Transform")!;
    const rHip = world.getComponent<{ rotation: ReadonlyArray<number> }>("bomber.hipR", "Transform")!;
    const rShoulder = world.getComponent<{ rotation: ReadonlyArray<number> }>("bomber.shoulderR", "Transform")!;
    const lHip = world.getComponent<{ rotation: ReadonlyArray<number> }>("bomber.hipL", "Transform")!;
    expect(lShoulder.rotation[0]!).toBeGreaterThan(0);
    expect(rHip.rotation[0]!).toBeGreaterThan(0);
    expect(rShoulder.rotation[0]!).toBeLessThan(0);
    expect(lHip.rotation[0]!).toBeLessThan(0);
  });

  it("walk-swing keeps X and Z at base; Y dips below base (S103 walk-cycle root bob)", () => {
    const world = new World();
    addBomberRoot(world, "walk-swing", [0.5, 1, 2]);
    const system = createBenchAnimationSystem();
    for (let i = 0; i < 10; i += 1) system.fixedUpdate!(ctx(world));
    const t = world.getComponent<{ position: ReadonlyArray<number> }>("bomber", "Transform")!;
    expect(t.position[0]).toBeCloseTo(0.5, 5);
    expect(t.position[2]).toBeCloseTo(2, 5);
    // Y stays within the bob band: never above the base, never more
    // than amplitude below it.
    expect(t.position[1]!).toBeLessThanOrEqual(1);
    expect(t.position[1]!).toBeGreaterThan(0.9);
  });

  it("limb-test rotates exactly one pivot at a time at LIMB_TEST_ROTATION_RAD (written as degrees on Transform)", () => {
    const world = new World();
    addBomberRoot(world, "limb-test");
    const system = createBenchAnimationSystem();
    // Advance to the middle of the first pivot's window (elapsed ≈ LIMB_TEST_DURATION_PER_PIVOT_S / 2)
    const ticks = Math.round((LIMB_TEST_DURATION_PER_PIVOT_S / 2) / (1 / 60));
    for (let i = 0; i < ticks; i += 1) system.fixedUpdate!(ctx(world));
    const expectedActive = LIMB_PIVOT_NAMES[0]!;
    let activeFound = false;
    let nonZeroCount = 0;
    const expectedDeg = (LIMB_TEST_ROTATION_RAD * 180) / Math.PI;
    for (const name of LIMB_PIVOT_NAMES) {
      const t = world.getComponent<{ rotation: ReadonlyArray<number> }>(`bomber.${name}`, "Transform")!;
      const rotDeg = t.rotation[0]!;
      if (Math.abs(rotDeg) > 1e-3) {
        nonZeroCount += 1;
        if (name === expectedActive) {
          activeFound = true;
          expect(rotDeg).toBeCloseTo(expectedDeg, 3);
        }
      }
    }
    expect(activeFound).toBe(true);
    expect(nonZeroCount).toBe(1);
  });

  it("kind=none snaps the root back to base + zeros all pivot rotations", () => {
    const world = new World();
    addBomberRoot(world, "none", [0.1, 0.2, 0.3]);
    const system = createBenchAnimationSystem();
    for (let i = 0; i < 30; i += 1) system.fixedUpdate!(ctx(world));
    const t = world.getComponent<{ position: ReadonlyArray<number> }>("bomber", "Transform")!;
    expect(t.position[0]).toBeCloseTo(0.1, 5);
    expect(t.position[1]).toBeCloseTo(0.2, 5);
    expect(t.position[2]).toBeCloseTo(0.3, 5);
    for (const name of LIMB_PIVOT_NAMES) {
      const p = world.getComponent<{ rotation: ReadonlyArray<number> }>(`bomber.${name}`, "Transform")!;
      expect(p.rotation[0]).toBeCloseTo(0, 5);
    }
  });

  it("S103 ARM-REST-APPLIES: kind=none + armRestAngleRad sets shoulderL/R rotations to that angle (in degrees)", () => {
    const world = new World();
    world.addEntity("bomber");
    world.setComponent("bomber", "Transform", { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
    world.setComponent("bomber", "BenchAnimationState", {
      kind: "none",
      elapsed: 0,
      armRestAngleRad: 0.5
    });
    const limbPivots = {
      neck: "bomber.neck",
      shoulderL: "bomber.shoulderL",
      shoulderR: "bomber.shoulderR",
      elbowL: "bomber.elbowL",
      elbowR: "bomber.elbowR",
      hipL: "bomber.hipL",
      hipR: "bomber.hipR",
      kneeL: "bomber.kneeL",
      kneeR: "bomber.kneeR"
    };
    for (const id of Object.values(limbPivots)) {
      world.addEntity(id);
      world.setComponent(id, "Transform", { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
    }
    world.setComponent("bomber", "LimbPivots", limbPivots);

    const system = createBenchAnimationSystem();
    system.fixedUpdate!(ctx(world));

    const expectedDeg = (0.5 * 180) / Math.PI;
    const shoulderL = world.getComponent<{ rotation: ReadonlyArray<number> }>("bomber.shoulderL", "Transform")!;
    const shoulderR = world.getComponent<{ rotation: ReadonlyArray<number> }>("bomber.shoulderR", "Transform")!;
    expect(shoulderL.rotation[0]!).toBeCloseTo(expectedDeg, 4);
    expect(shoulderR.rotation[0]!).toBeCloseTo(expectedDeg, 4);
    // Non-shoulder pivots stay zeroed.
    const kneeL = world.getComponent<{ rotation: ReadonlyArray<number> }>("bomber.kneeL", "Transform")!;
    expect(kneeL.rotation[0]).toBeCloseTo(0, 4);
  });

  it("flipping from walk-swing back to none zeroes pivot rotations", () => {
    const world = new World();
    addBomberRoot(world, "walk-swing");
    const system = createBenchAnimationSystem();
    for (let i = 0; i < 20; i += 1) system.fixedUpdate!(ctx(world));
    world.setComponent("bomber", "BenchAnimationState", { kind: "none", elapsed: 0 });
    system.fixedUpdate!(ctx(world));
    for (const name of LIMB_PIVOT_NAMES) {
      const p = world.getComponent<{ rotation: ReadonlyArray<number> }>(`bomber.${name}`, "Transform")!;
      expect(p.rotation[0]).toBeCloseTo(0, 5);
    }
  });
});
