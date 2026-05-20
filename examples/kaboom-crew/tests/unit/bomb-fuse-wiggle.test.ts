// S90 KABOOM-BOMB-FUSE-WIGGLE.

import { describe, expect, it } from "vitest";

import { bombWiggleScale } from "../../src/systems/bomb-fuse-system";

describe("bombWiggleScale (S90 KABOOM-BOMB-FUSE-WIGGLE)", () => {
  it("returns exactly 1 when fuseRemaining > 2 (fresh bomb sits still)", () => {
    expect(bombWiggleScale(2.5, 0)).toBe(1);
    expect(bombWiggleScale(3, 12345)).toBe(1);
    expect(bombWiggleScale(99, 999_999_999)).toBe(1);
  });

  it("modulates around 1 with small amplitude near fuse=2", () => {
    const samples: number[] = [];
    // Sweep the time argument across a couple of periods.
    for (let ms = 0; ms < 1000; ms += 50) {
      samples.push(bombWiggleScale(2, ms));
    }
    // S99 KABOOM-BOMB-FUSE-WIGGLE-TAME: amplitude at fuse=2 ≈ 0.02 (was 0.04 before S99).
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    expect(max - min).toBeGreaterThan(0.02);
    expect(max - min).toBeLessThan(0.06);
  });

  it("modulates with higher amplitude near fuse=0 (urgency=1)", () => {
    const samples: number[] = [];
    for (let ms = 0; ms < 1000; ms += 25) {
      samples.push(bombWiggleScale(0.05, ms));
    }
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    // S99 KABOOM-BOMB-FUSE-WIGGLE-TAME: amplitude near fuse=0 ≈ 0.07 (was 0.14 before S99).
    expect(max - min).toBeGreaterThan(0.1);
    expect(max - min).toBeLessThan(0.16);
  });

  it("ratchets back to 1 when fuseRemaining is negative (defensive)", () => {
    // urgency still clamped because t = max(0, fuseRemaining).
    const s = bombWiggleScale(-1, 0);
    // No throw + scale is finite + near baseline.
    expect(Number.isFinite(s)).toBe(true);
    // sin(0) = 0 so the baseline lands at 1 exactly.
    expect(s).toBe(1);
  });
});
