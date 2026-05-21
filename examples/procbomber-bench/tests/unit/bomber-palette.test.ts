// S101 PROCBOMBER-PALETTE-TABLE — palette table + seeded picker.

import { describe, expect, it } from "vitest";

import {
  BOMBER_PALETTES,
  BOMBER_PALETTE_NAMES,
  isBomberPaletteName,
  paletteByName,
  pickBomberPalette
} from "../../src/generators/bomber-palette";

describe("BOMBER_PALETTES table (S101)", () => {
  it("ships exactly 8 palettes", () => {
    expect(BOMBER_PALETTES.length).toBe(8);
    expect(BOMBER_PALETTE_NAMES.length).toBe(8);
  });

  it("every entry has all four color fields as 7-char hex strings", () => {
    for (const p of BOMBER_PALETTES) {
      for (const field of ["head", "torso", "limbs", "accent"] as const) {
        expect(p[field]).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  it("palette names are unique", () => {
    const names = new Set(BOMBER_PALETTE_NAMES);
    expect(names.size).toBe(BOMBER_PALETTE_NAMES.length);
  });
});

describe("isBomberPaletteName (S101)", () => {
  it("accepts each shipped name", () => {
    for (const n of BOMBER_PALETTE_NAMES) {
      expect(isBomberPaletteName(n)).toBe(true);
    }
  });
  it("rejects everything else", () => {
    expect(isBomberPaletteName("rainbow")).toBe(false);
    expect(isBomberPaletteName("")).toBe(false);
    expect(isBomberPaletteName(undefined)).toBe(false);
    expect(isBomberPaletteName(42)).toBe(false);
  });
});

describe("paletteByName (S101)", () => {
  it("returns the matching palette", () => {
    expect(paletteByName("sky").torso).toBe("#3ab0ff");
    expect(paletteByName("ember").name).toBe("ember");
  });
});

describe("pickBomberPalette (S101)", () => {
  it("is deterministic for a given seed", () => {
    const a = pickBomberPalette("seed-1");
    const b = pickBomberPalette("seed-1");
    expect(a).toBe(b);
  });

  it("different seeds may pick different palettes (broad coverage check)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      seen.add(pickBomberPalette(`bot-${i}`).name);
    }
    // Over 200 seeds the picker should cover most of the 8 palettes;
    // ≥ 6 distinct is a safe lower bound for a 31-hash modulo-8 picker.
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });

  it("the override short-circuits the seed picker", () => {
    expect(pickBomberPalette("any-seed", "mint").name).toBe("mint");
    expect(pickBomberPalette("", "slate").name).toBe("slate");
  });
});
