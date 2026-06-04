// S283 ENGINE-WANG-SUBVARIANT unit tests.

import { afterEach, describe, expect, it } from "vitest";

import {
  clearWangTileFamilies,
  lookupWangVariant,
  registerWangFamilyWithSubvariants,
  subvariantIndex,
  type WangTileVariant
} from "../../engine/render/autotile/family-registry";

afterEach(() => clearWangTileFamilies());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVariant(key: string): WangTileVariant {
  return { meshKey: key };
}

/** Build a 16-entry sub-variant table with `n` sub-variants per index. */
function makeTable(n: number): ReadonlyArray<ReadonlyArray<WangTileVariant>> {
  return Array.from({ length: 16 }, (_, i) =>
    Array.from({ length: n }, (_, j) => makeVariant(`key-${i}-${j}`))
  );
}

// ---------------------------------------------------------------------------
// registerWangFamilyWithSubvariants
// ---------------------------------------------------------------------------

describe("registerWangFamilyWithSubvariants (S283)", () => {
  it("registers a valid 16-entry table", () => {
    expect(() => registerWangFamilyWithSubvariants("test", makeTable(3))).not.toThrow();
  });

  it("throws on empty name", () => {
    expect(() => registerWangFamilyWithSubvariants("", makeTable(1))).toThrow();
  });

  it("throws on table with wrong length", () => {
    expect(() =>
      registerWangFamilyWithSubvariants("bad", Array.from({ length: 15 }, () => [makeVariant("k")]))
    ).toThrow();
  });

  it("throws on empty sub-variant array at an index", () => {
    const table = makeTable(2).map((arr, i) => (i === 5 ? [] : arr));
    expect(() => registerWangFamilyWithSubvariants("bad", table)).toThrow();
  });

  it("throws on duplicate name", () => {
    registerWangFamilyWithSubvariants("dup", makeTable(1));
    expect(() => registerWangFamilyWithSubvariants("dup", makeTable(1))).toThrow();
  });
});

// ---------------------------------------------------------------------------
// subvariantIndex
// ---------------------------------------------------------------------------

describe("subvariantIndex (S283)", () => {
  it("returns 0 when subCount is 1", () => {
    expect(subvariantIndex("floor.1", 3, 5, 1)).toBe(0);
  });

  it("always returns a value in [0, subCount)", () => {
    for (let gx = 0; gx < 5; gx++) {
      for (let gz = 0; gz < 5; gz++) {
        const si = subvariantIndex("entity", gx, gz, 3);
        expect(si).toBeGreaterThanOrEqual(0);
        expect(si).toBeLessThan(3);
      }
    }
  });

  it("same inputs always produce the same output (deterministic)", () => {
    const a = subvariantIndex("floor.42", 7, 3, 4);
    const b = subvariantIndex("floor.42", 7, 3, 4);
    expect(a).toBe(b);
  });

  it("different cells produce different distribution (not all the same)", () => {
    const results = new Set<number>();
    for (let gx = 0; gx < 8; gx++) {
      for (let gz = 0; gz < 8; gz++) {
        results.add(subvariantIndex("floor.1", gx, gz, 3));
      }
    }
    // Over 64 cells with 3 possible values, all 3 should appear.
    expect(results.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// lookupWangVariant
// ---------------------------------------------------------------------------

describe("lookupWangVariant (S283)", () => {
  it("returns undefined for unknown family", () => {
    expect(lookupWangVariant("ghost", 7)).toBeUndefined();
  });

  it("resolves a V2 family at the correct bitmask index", () => {
    registerWangFamilyWithSubvariants("grass", makeTable(1));
    const result = lookupWangVariant("grass", 6);
    expect(result).not.toBeUndefined();
    expect(result!.variantIndex).toBe(6);
    expect(result!.subvariantIndex).toBe(0);
    expect(result!.meshKey).toBe("key-6-0");
  });

  it("selects a stable sub-variant when entityId + position are supplied", () => {
    const table = makeTable(3);
    registerWangFamilyWithSubvariants("stone", table);
    const r1 = lookupWangVariant("stone", 0, "floor.1", 2, 4);
    const r2 = lookupWangVariant("stone", 0, "floor.1", 2, 4);
    expect(r1).not.toBeUndefined();
    expect(r1!.subvariantIndex).toBe(r2!.subvariantIndex);
    expect(r1!.meshKey).toBe(r2!.meshKey);
  });

  it("different cells with 3 sub-variants produce all 3 across the grid", () => {
    const table = makeTable(3);
    registerWangFamilyWithSubvariants("dirt", table);
    const seen = new Set<number>();
    for (let gx = 0; gx < 8; gx++) {
      for (let gz = 0; gz < 8; gz++) {
        const r = lookupWangVariant("dirt", 15, `floor.${gx}.${gz}`, gx, gz);
        seen.add(r!.subvariantIndex);
      }
    }
    expect(seen.size).toBe(3);
  });

  it("clamps out-of-range bitmask to 0 / 15", () => {
    registerWangFamilyWithSubvariants("path", makeTable(1));
    const low = lookupWangVariant("path", -5);
    const high = lookupWangVariant("path", 100);
    expect(low!.variantIndex).toBe(0);
    expect(high!.variantIndex).toBe(15);
  });
});
