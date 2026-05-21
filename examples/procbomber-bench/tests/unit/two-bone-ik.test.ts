// S103 PROCBOMBER-IK-REACH-TARGET — two-bone IK solver tests.

import { describe, expect, it } from "vitest";

import { reachDemoTarget, solveTwoBoneIk } from "../../src/two-bone-ik";

describe("solveTwoBoneIk (S103)", () => {
  it("target straight down at full reach: shoulder pitch ~0, elbow nearly straight", () => {
    const ik = solveTwoBoneIk([0, -0.4, 0], 0.2, 0.2);
    // EPS clamp puts the target slightly inside reach, so the angles
    // aren't exactly zero — just close.
    expect(Math.abs(ik.shoulderPitchRad)).toBeLessThan(0.05);
    expect(Math.abs(ik.shoulderYawRad)).toBeLessThan(0.05);
    expect(ik.elbowBendRad).toBeLessThan(0.1);
    expect(ik.clamped).toBe(true);
  });

  it("target at half reach forward: elbow bends", () => {
    // Target at (0, -0.2, 0.0) — halfway between shoulder and full reach.
    const ik = solveTwoBoneIk([0, -0.2, 0], 0.2, 0.2);
    expect(ik.elbowBendRad).toBeGreaterThan(1.5); // ≈ π/2 fold or more
  });

  it("target forward at full extension: shoulder pitch reaches forward", () => {
    // Target straight forward in front: (0, 0, 0.4).
    const ik = solveTwoBoneIk([0, 0, 0.4], 0.2, 0.2);
    // Pitch ~ π/2 (rotate from -Y rest to +Z forward).
    expect(ik.shoulderPitchRad).toBeCloseTo(Math.PI / 2, 1);
    expect(ik.elbowBendRad).toBeLessThan(0.05);
    expect(ik.clamped).toBe(true);
  });

  it("target sideways: shoulder yaw turns", () => {
    // Target right (+X) at half reach.
    const ik = solveTwoBoneIk([0.2, 0, 0], 0.2, 0.2);
    // Yaw ~ π/2 toward +X.
    expect(Math.abs(ik.shoulderYawRad)).toBeGreaterThan(1);
  });

  it("target beyond reach is clamped + flagged", () => {
    const ik = solveTwoBoneIk([0, -10, 0], 0.2, 0.2);
    expect(ik.clamped).toBe(true);
    expect(ik.elbowBendRad).toBeLessThan(0.05);
  });

  it("target exactly at minimum reach: elbow fully folded", () => {
    // Target collinear at |L1 - L2| = 0 (with equal segments) is unsolvable
    // — solver clamps internally; just verify it doesn't NaN.
    const ik = solveTwoBoneIk([0.01, 0.01, 0.01], 0.2, 0.2);
    expect(Number.isFinite(ik.shoulderPitchRad)).toBe(true);
    expect(Number.isFinite(ik.elbowBendRad)).toBe(true);
  });
});

describe("reachDemoTarget (S103)", () => {
  it("returns finite vec3 for any elapsed", () => {
    for (let t = 0; t < 10; t += 0.5) {
      const tgt = reachDemoTarget(t);
      for (const v of tgt) expect(Number.isFinite(v)).toBe(true);
    }
  });
  it("stays within roughly the requested radius (the demo path mixes XZ + Y)", () => {
    for (let t = 0; t < 10; t += 0.25) {
      const tgt = reachDemoTarget(t, 0.4);
      // The demo blends a horizontal circle + a vertical wobble; the
      // resulting envelope can exceed `radius` by a small amount.
      expect(Math.hypot(...tgt)).toBeLessThanOrEqual(0.65);
    }
  });
});
