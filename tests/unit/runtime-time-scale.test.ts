// S90 AGF-RUNTIME-TIME-SCALE.

import { describe, expect, it } from "vitest";

import { clampTimeScale } from "../../engine/runtime/start";

describe("clampTimeScale (S90 AGF-RUNTIME-TIME-SCALE)", () => {
  it("returns the value unchanged when inside [0.05, 4]", () => {
    expect(clampTimeScale(1)).toBe(1);
    expect(clampTimeScale(0.5)).toBe(0.5);
    expect(clampTimeScale(0.05)).toBe(0.05);
    expect(clampTimeScale(4)).toBe(4);
    expect(clampTimeScale(2.5)).toBe(2.5);
  });

  it("clamps values below 0.05 up to the floor", () => {
    expect(clampTimeScale(0)).toBe(0.05);
    expect(clampTimeScale(0.01)).toBe(0.05);
    expect(clampTimeScale(-1)).toBe(0.05);
  });

  it("clamps values above 4 down to the ceiling", () => {
    expect(clampTimeScale(10)).toBe(4);
    expect(clampTimeScale(1000)).toBe(4);
    expect(clampTimeScale(1e9)).toBe(4);
  });

  it("coerces non-finite inputs (NaN, +Infinity, -Infinity) to the default 1", () => {
    expect(clampTimeScale(Number.NaN)).toBe(1);
    expect(clampTimeScale(Number.POSITIVE_INFINITY)).toBe(1);
    expect(clampTimeScale(Number.NEGATIVE_INFINITY)).toBe(1);
  });
});
