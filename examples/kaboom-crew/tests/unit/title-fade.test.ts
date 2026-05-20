// S096 KABOOM-TITLE-SCREEN-FADE — pure curve helper tests.

import { describe, expect, it } from "vitest";

import { fadeOutOpacityCurve } from "../../src/title-fade";

describe("fadeOutOpacityCurve (S096 KABOOM-TITLE-SCREEN-FADE)", () => {
  it("starts at 1 and ends at 0 — endpoints are exact", () => {
    expect(fadeOutOpacityCurve(0, 250)).toBe(1);
    expect(fadeOutOpacityCurve(250, 250)).toBe(0);
    expect(fadeOutOpacityCurve(9999, 250)).toBe(0);
  });

  it("monotonically decreases between endpoints (easeOutQuad gives no overshoot)", () => {
    const samples: number[] = [];
    for (let t = 0; t <= 250; t += 10) samples.push(fadeOutOpacityCurve(t, 250));
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]!).toBeLessThanOrEqual(samples[i - 1]!);
    }
  });

  it("mid-curve opacity is BELOW the linear midpoint (easeOutQuad means faster early drop)", () => {
    // Linear would give 0.5 at t=125. easeOutQuad samples 1 - (1 - (1 - 0.5)^2) = 1 - 0.75 = 0.25.
    expect(fadeOutOpacityCurve(125, 250)).toBeLessThan(0.5);
    // Specifically ~0.25.
    expect(fadeOutOpacityCurve(125, 250)).toBeCloseTo(0.25, 3);
  });

  it("returns 0 for non-positive durations (defensive)", () => {
    expect(fadeOutOpacityCurve(50, 0)).toBe(0);
    expect(fadeOutOpacityCurve(50, -1)).toBe(0);
  });

  it("returns 1 for non-finite elapsed (defensive)", () => {
    expect(fadeOutOpacityCurve(Number.NaN, 250)).toBe(1);
    // -Infinity → not positive → returns 1.
    expect(fadeOutOpacityCurve(Number.NEGATIVE_INFINITY, 250)).toBe(1);
  });
});
