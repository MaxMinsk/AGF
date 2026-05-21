// S102 PROCBOMBER-LIMB-PIVOTS-COMPONENT — LimbPivots helpers.

import { describe, expect, it } from "vitest";

import {
  LIMB_PIVOT_NAMES,
  buildLimbPivots,
  isLimbPivotName,
  type LimbPivotName
} from "../../src/limb-pivots";

describe("LIMB_PIVOT_NAMES (S102)", () => {
  it("contains exactly 9 names — the actuated joint count from GDP-001", () => {
    expect(LIMB_PIVOT_NAMES.length).toBe(9);
  });
  it("includes the required nine names", () => {
    const required: LimbPivotName[] = [
      "neck",
      "shoulderL", "shoulderR",
      "elbowL", "elbowR",
      "hipL", "hipR",
      "kneeL", "kneeR"
    ];
    for (const n of required) expect(LIMB_PIVOT_NAMES).toContain(n);
  });
});

describe("isLimbPivotName (S102)", () => {
  it("accepts the shipped names", () => {
    for (const n of LIMB_PIVOT_NAMES) expect(isLimbPivotName(n)).toBe(true);
  });
  it("rejects everything else", () => {
    expect(isLimbPivotName("ankle")).toBe(false);
    expect(isLimbPivotName("")).toBe(false);
    expect(isLimbPivotName(undefined)).toBe(false);
    expect(isLimbPivotName(42)).toBe(false);
  });
});

describe("buildLimbPivots (S102)", () => {
  it("returns a LimbPivots record with every named field populated", () => {
    const lp = buildLimbPivots((n) => `bomber.${n}`);
    expect(lp.neck).toBe("bomber.neck");
    expect(lp.shoulderL).toBe("bomber.shoulderL");
    expect(lp.kneeR).toBe("bomber.kneeR");
    // Spot-check all 9 fields exist.
    for (const name of LIMB_PIVOT_NAMES) {
      expect(lp[name]).toBe(`bomber.${name}`);
    }
  });
});
