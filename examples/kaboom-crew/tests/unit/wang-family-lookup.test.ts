// S170 KABOOM-WANG-INTEGRATION (GDP-2026-05-28-004 Stage 3) — unit
// coverage for the 16→4 Wang bitmask collapse table that both
// hard-block + soft-block families share.

import { describe, expect, it } from "vitest";

import {
  buildWangTo4LookupTable,
  hardBlockBitmaskToVariant,
  softBlockBitmaskToVariant
} from "../../src/blocks/wang-family-lookup";

describe("buildWangTo4LookupTable (S170)", () => {
  it("returns exactly 16 entries", () => {
    const table = buildWangTo4LookupTable();
    expect(table.length).toBe(16);
  });

  it("only emits variant indices in 0..3", () => {
    for (const v of buildWangTo4LookupTable()) {
      expect([0, 1, 2, 3]).toContain(v);
    }
  });

  it("maps the isolated bitmask (0) to variant 3", () => {
    expect(buildWangTo4LookupTable()[0]).toBe(3);
  });

  it("maps the surrounded bitmask (15) to variant 2", () => {
    expect(buildWangTo4LookupTable()[15]).toBe(2);
  });

  it("maps every single-neighbour bitmask (1,2,4,8) to variant 0", () => {
    const table = buildWangTo4LookupTable();
    for (const m of [1, 2, 4, 8]) {
      expect(table[m]).toBe(0);
    }
  });

  it("maps every two-neighbour bitmask (3,5,6,9,10,12) to variant 1", () => {
    const table = buildWangTo4LookupTable();
    for (const m of [3, 5, 6, 9, 10, 12]) {
      expect(table[m]).toBe(1);
    }
  });

  it("maps every three-neighbour T-junction bitmask (7,11,13,14) to variant 1", () => {
    const table = buildWangTo4LookupTable();
    for (const m of [7, 11, 13, 14]) {
      expect(table[m]).toBe(1);
    }
  });
});

describe("hardBlockBitmaskToVariant (S170)", () => {
  it("matches the shared lookup table for every bitmask 0..15", () => {
    const table = buildWangTo4LookupTable();
    for (let m = 0; m < 16; m += 1) {
      expect(hardBlockBitmaskToVariant(m)).toBe(table[m]);
    }
  });

  it("clamps out-of-range bitmasks", () => {
    // Below zero → 0 (isolated → variant 3).
    expect(hardBlockBitmaskToVariant(-1)).toBe(3);
    // Above 15 → 15 (surrounded → variant 2).
    expect(hardBlockBitmaskToVariant(99)).toBe(2);
    // Non-finite → 0 (variant 3).
    expect(hardBlockBitmaskToVariant(Number.NaN)).toBe(3);
  });
});

describe("softBlockBitmaskToVariant (S170)", () => {
  it("matches the shared lookup table for every bitmask 0..15", () => {
    const table = buildWangTo4LookupTable();
    for (let m = 0; m < 16; m += 1) {
      expect(softBlockBitmaskToVariant(m)).toBe(table[m]);
    }
  });

  it("agrees with hardBlockBitmaskToVariant — soft + hard share the table", () => {
    for (let m = 0; m < 16; m += 1) {
      expect(softBlockBitmaskToVariant(m)).toBe(hardBlockBitmaskToVariant(m));
    }
  });
});
