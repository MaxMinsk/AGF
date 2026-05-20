// S91 M19-EASING-LIBRARY — every curve obeys curve(0)=0, curve(1)=1
// and has a non-linear midpoint signature unless its name is `linear`.

import { describe, expect, it } from "vitest";

import { easingCurves, type TweenEase } from "../../engine/core/systems/tween-system";

// Curves that intentionally overshoot or oscillate are exempt from the
// "midpoint deviates linearly OR matches t=0.5" check — they're tested
// separately for their characteristic shape.
const OVERSHOOT: ReadonlySet<TweenEase> = new Set(["easeOutBack", "easeOutElastic"]);
const SINE_WAVE: ReadonlySet<TweenEase> = new Set(["pulse"]);

describe("easingCurves (S91 M19-EASING-LIBRARY)", () => {
  const names = Object.keys(easingCurves) as TweenEase[];

  it("contains the full v1 named-curve list", () => {
    expect(names.sort()).toEqual(
      [
        "linear",
        "easeIn",
        "easeOut",
        "easeInOut",
        "easeInQuad",
        "easeOutQuad",
        "easeInOutQuad",
        "easeInCubic",
        "easeOutCubic",
        "easeInOutCubic",
        "easeInQuart",
        "easeOutQuart",
        "easeInOutQuart",
        "easeOutBack",
        "easeOutElastic",
        "pulse"
      ].sort()
    );
  });

  for (const name of [
    "linear",
    "easeIn",
    "easeOut",
    "easeInOut",
    "easeInQuad",
    "easeOutQuad",
    "easeInOutQuad",
    "easeInCubic",
    "easeOutCubic",
    "easeInOutCubic",
    "easeInQuart",
    "easeOutQuart",
    "easeInOutQuart",
    "easeOutBack",
    "easeOutElastic"
  ] as TweenEase[]) {
    it(`${name}: curve(0) = 0 and curve(1) = 1`, () => {
      const fn = easingCurves[name];
      expect(fn(0)).toBeCloseTo(0, 6);
      expect(fn(1)).toBeCloseTo(1, 6);
    });
  }

  it("linear: midpoint is exactly 0.5", () => {
    expect(easingCurves.linear(0.5)).toBe(0.5);
  });

  for (const name of [
    "easeIn",
    "easeOut",
    "easeInQuad",
    "easeOutQuad",
    "easeInOut",
    "easeInOutQuad",
    "easeInCubic",
    "easeOutCubic",
    "easeInOutCubic",
    "easeInQuart",
    "easeOutQuart",
    "easeInOutQuart"
  ] as TweenEase[]) {
    it(`${name}: deviates from linear at t=0.25 (curve has non-trivial shape)`, () => {
      if (OVERSHOOT.has(name) || SINE_WAVE.has(name)) return;
      // Sample at t=0.25 instead of 0.5 — Quad/Cubic/Quart easeInOut
      // variants are symmetric around 0.5 by design, so 0.5 sits on
      // the linear line. Off-center samples expose the curve.
      const sample = easingCurves[name](0.25);
      expect(Math.abs(sample - 0.25)).toBeGreaterThan(0.05);
    });
  }

  it("easeOutBack: overshoots beyond 1.0 before settling", () => {
    // Robert Penner's easeOutBack peaks at ~1.10 around t≈0.74.
    const samples = Array.from({ length: 21 }, (_, i) => easingCurves.easeOutBack(i / 20));
    const peak = Math.max(...samples);
    expect(peak).toBeGreaterThan(1.05);
    expect(peak).toBeLessThan(1.15);
  });

  it("easeOutElastic: oscillates past 1.0 mid-curve and lands on exactly 1.0", () => {
    const samples = Array.from({ length: 41 }, (_, i) => easingCurves.easeOutElastic(i / 40));
    const overshoot = Math.max(...samples);
    // Elastic should overshoot 1.0 at least once before damping.
    expect(overshoot).toBeGreaterThan(1.05);
    expect(easingCurves.easeOutElastic(1)).toBe(1);
  });

  it("pulse: 0 at endpoints, 1 at midpoint (sine half-wave)", () => {
    expect(easingCurves.pulse(0)).toBeCloseTo(0, 6);
    expect(easingCurves.pulse(0.5)).toBeCloseTo(1, 6);
    expect(easingCurves.pulse(1)).toBeCloseTo(0, 6);
  });

  it("Quad/Cubic/Quart easeIn family steepens with the power", () => {
    // At t=0.25 the higher-power curve must be smaller (slower start).
    const q = easingCurves.easeInQuad(0.25);
    const c = easingCurves.easeInCubic(0.25);
    const f = easingCurves.easeInQuart(0.25);
    expect(c).toBeLessThan(q);
    expect(f).toBeLessThan(c);
  });

  it("legacy aliases easeIn / easeOut / easeInOut match the Quad variants exactly", () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(easingCurves.easeIn(t)).toBeCloseTo(easingCurves.easeInQuad(t), 8);
      expect(easingCurves.easeOut(t)).toBeCloseTo(easingCurves.easeOutQuad(t), 8);
      expect(easingCurves.easeInOut(t)).toBeCloseTo(easingCurves.easeInOutQuad(t), 8);
    }
  });
});
