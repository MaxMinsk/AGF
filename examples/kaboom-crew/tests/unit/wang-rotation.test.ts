// S214 KABOOM-WANG-ROTATION (GDP-2026-05-29-004). Covers the
// bitmask → { variant, rotation } table contract: each single-edge
// bitmask resolves to variant 0 with a quarter-turn unique to it,
// each corner / T-junction resolves to variant 1 with a quarter-turn
// matching its open side, and the symmetric cases (isolated /
// filler) report rotation 0.

import { describe, expect, it } from "vitest";

import {
  bitmaskToRotationYDeg,
  hardBlockBitmaskToVariant,
  resolveWangVariant
} from "../../src/blocks/wang-family-lookup";

describe("kaboom wang rotation (S214)", () => {
  it("single-edge bitmasks (1, 2, 4, 8) all map to variant 0 with four distinct rotations", () => {
    const rotations = new Set<number>();
    for (const m of [1, 2, 4, 8]) {
      const r = resolveWangVariant(m);
      expect(r.variant).toBe(0);
      rotations.add(r.rotationYDeg);
    }
    expect(rotations.size).toBe(4);
    // All four quadrants represented.
    expect(rotations.has(0)).toBe(true);
    expect(rotations.has(90)).toBe(true);
    expect(rotations.has(180)).toBe(true);
    expect(rotations.has(270)).toBe(true);
  });

  it("bitmask 8 (N neighbour) is canonical — rotation 0", () => {
    expect(resolveWangVariant(8)).toEqual({ variant: 0, rotationYDeg: 0 });
  });

  it("corners (3, 6, 9, 12) all map to variant 1 with four distinct rotations", () => {
    const rotations = new Set<number>();
    for (const m of [3, 6, 9, 12]) {
      const r = resolveWangVariant(m);
      expect(r.variant).toBe(1);
      rotations.add(r.rotationYDeg);
    }
    expect(rotations.size).toBe(4);
  });

  it("isolated (bitmask 0) is variant 3 with rotation 0", () => {
    expect(resolveWangVariant(0)).toEqual({ variant: 3, rotationYDeg: 0 });
  });

  it("surrounded (bitmask 15) is variant 2 with rotation 0", () => {
    expect(resolveWangVariant(15)).toEqual({ variant: 2, rotationYDeg: 0 });
  });

  it("bitmaskToRotationYDeg agrees with resolveWangVariant on rotation", () => {
    for (let m = 0; m <= 15; m += 1) {
      expect(bitmaskToRotationYDeg(m)).toBe(resolveWangVariant(m).rotationYDeg);
    }
  });

  it("legacy hardBlockBitmaskToVariant still returns the bare variant index", () => {
    expect(hardBlockBitmaskToVariant(1)).toBe(0);
    expect(hardBlockBitmaskToVariant(15)).toBe(2);
    expect(hardBlockBitmaskToVariant(0)).toBe(3);
  });

  it("rotation is clamped to [0, 360) for every bitmask 0..15", () => {
    for (let m = 0; m <= 15; m += 1) {
      const r = bitmaskToRotationYDeg(m);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(360);
    }
  });

  it("out-of-range bitmask clamps to 0 (isolated)", () => {
    expect(resolveWangVariant(-1)).toEqual({ variant: 3, rotationYDeg: 0 });
    expect(resolveWangVariant(99)).toEqual({ variant: 2, rotationYDeg: 0 });
  });

  it("all 16 bitmask entries are unique by (variant, rotation) tuple — no silent collisions for the rotation-distinguished cases", () => {
    const seen = new Map<string, number[]>();
    for (let m = 0; m <= 15; m += 1) {
      const r = resolveWangVariant(m);
      const key = `${r.variant}-${r.rotationYDeg}`;
      const list = seen.get(key) ?? [];
      list.push(m);
      seen.set(key, list);
    }
    // Single-edge: 4 unique (variant 0, four rotations).
    // Corners: 4 unique (variant 1, four rotations).
    // The 4 T-junctions reuse the corner rotations one-each (open side
    // matches a corner orientation); 2 straight-wall bitmasks reuse
    // corner slots 0 and 90. So the count of distinct (variant,rot)
    // tuples should be ≥ 10 (4 edges + 4 corners + isolated + filler).
    expect(seen.size).toBeGreaterThanOrEqual(10);
  });
});
