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
    // Amplitude at fuse=2 ≈ 0.04 (urgency=0 → amplitude=0.04).
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    expect(max - min).toBeGreaterThan(0.04);
    expect(max - min).toBeLessThan(0.12);
  });

  it("modulates with high amplitude near fuse=0 (urgency=1)", () => {
    const samples: number[] = [];
    for (let ms = 0; ms < 1000; ms += 25) {
      samples.push(bombWiggleScale(0.05, ms));
    }
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    // Amplitude near fuse=0 ≈ 0.14 (0.04 + 0.10 * urgency=1).
    expect(max - min).toBeGreaterThan(0.2);
    expect(max - min).toBeLessThan(0.32);
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
