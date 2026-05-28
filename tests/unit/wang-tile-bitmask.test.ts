// S169 ENGINE-WANG-AUTOTILE (GDP-2026-05-28-002) — bitmask helpers tests.

import { describe, expect, it } from "vitest";

import {
  computeWangBitmask,
  resolveVariantIndex,
  type SameFamilyPredicate
} from "../../engine/render/autotile/bitmask";
import type { WangTileFamily, WangTileVariant } from "../../engine/render/autotile/family-registry";

function buildFamily(): WangTileFamily {
  const variants: WangTileVariant[] = [];
  for (let i = 0; i < 16; i += 1) variants.push({ meshKey: `mesh-${i}` });
  return { name: "fam", variants };
}

/**
 * Build a same-family predicate from a list of neighbour offsets that
 * are considered "same family". Offsets are relative to the centre
 * cell (gx0, gz0). All other cells return false.
 */
function predicateFromOffsets(
  gx0: number,
  gz0: number,
  offsets: ReadonlyArray<[number, number]>
): SameFamilyPredicate {
  const set = new Set(offsets.map(([dx, dz]) => `${gx0 + dx},${gz0 + dz}`));
  return (gx, gz) => set.has(`${gx},${gz}`);
}

describe("computeWangBitmask (S169)", () => {
  it("returns 0 for an isolated cell (no same-family neighbours)", () => {
    const pred: SameFamilyPredicate = () => false;
    expect(computeWangBitmask(5, 5, pred)).toBe(0);
  });

  it("returns 15 when all four cardinal neighbours match", () => {
    const pred: SameFamilyPredicate = () => true;
    expect(computeWangBitmask(5, 5, pred)).toBe(15);
  });

  it("bit3=N: north neighbour only → 0b1000 (8)", () => {
    const pred = predicateFromOffsets(5, 5, [[0, -1]]);
    expect(computeWangBitmask(5, 5, pred)).toBe(0b1000);
  });

  it("bit2=E: east neighbour only → 0b0100 (4)", () => {
    const pred = predicateFromOffsets(5, 5, [[1, 0]]);
    expect(computeWangBitmask(5, 5, pred)).toBe(0b0100);
  });

  it("bit1=S: south neighbour only → 0b0010 (2)", () => {
    const pred = predicateFromOffsets(5, 5, [[0, 1]]);
    expect(computeWangBitmask(5, 5, pred)).toBe(0b0010);
  });

  it("bit0=W: west neighbour only → 0b0001 (1)", () => {
    const pred = predicateFromOffsets(5, 5, [[-1, 0]]);
    expect(computeWangBitmask(5, 5, pred)).toBe(0b0001);
  });

  it("N + W (top-left corner of a wall): 0b1001 (9)", () => {
    const pred = predicateFromOffsets(5, 5, [
      [0, -1],
      [-1, 0]
    ]);
    expect(computeWangBitmask(5, 5, pred)).toBe(0b1001);
  });

  it("S + W (south + west) matches design-doc example (variants[3] = south+west)", () => {
    // The design doc §3 says "3 (0011) = south + west". South=bit1, West=bit0.
    const pred = predicateFromOffsets(5, 5, [
      [0, 1],
      [-1, 0]
    ]);
    expect(computeWangBitmask(5, 5, pred)).toBe(3);
  });

  it("covers all 16 (N,E,S,W) combinations", () => {
    // Iterate the truth table; the produced bitmask must equal the
    // bit-encoded boolean vector { n, e, s, w } per the spec.
    for (let bits = 0; bits < 16; bits += 1) {
      const n = (bits & 0b1000) !== 0;
      const e = (bits & 0b0100) !== 0;
      const s = (bits & 0b0010) !== 0;
      const w = (bits & 0b0001) !== 0;
      const offsets: Array<[number, number]> = [];
      if (n) offsets.push([0, -1]);
      if (e) offsets.push([1, 0]);
      if (s) offsets.push([0, 1]);
      if (w) offsets.push([-1, 0]);
      const pred = predicateFromOffsets(0, 0, offsets);
      expect(computeWangBitmask(0, 0, pred)).toBe(bits);
    }
  });
});

describe("resolveVariantIndex (S169)", () => {
  it("returns the variant + clamped index for a normal bitmask", () => {
    const fam = buildFamily();
    const { variant, index } = resolveVariantIndex(7, fam);
    expect(index).toBe(7);
    expect(variant.meshKey).toBe("mesh-7");
  });

  it("clamps negative bitmasks to 0", () => {
    const fam = buildFamily();
    const { index } = resolveVariantIndex(-5, fam);
    expect(index).toBe(0);
  });

  it("clamps bitmasks above 15 to 15", () => {
    const fam = buildFamily();
    const { index, variant } = resolveVariantIndex(99, fam);
    expect(index).toBe(15);
    expect(variant.meshKey).toBe("mesh-15");
  });

  it("clamps non-finite bitmasks to 0 (defensive)", () => {
    const fam = buildFamily();
    expect(resolveVariantIndex(Number.NaN, fam).index).toBe(0);
    expect(resolveVariantIndex(Number.POSITIVE_INFINITY, fam).index).toBe(0);
    expect(resolveVariantIndex(Number.NEGATIVE_INFINITY, fam).index).toBe(0);
  });

  it("coerces fractional bitmask to integer (3.7 → 3)", () => {
    const fam = buildFamily();
    expect(resolveVariantIndex(3.7, fam).index).toBe(3);
  });
});
