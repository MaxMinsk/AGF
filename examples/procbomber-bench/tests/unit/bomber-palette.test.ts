// S101 PROCBOMBER-PALETTE-TABLE — palette table + seeded picker.

import { describe, expect, it } from "vitest";

import {
  BOMBER_PALETTES,
  BOMBER_PALETTE_NAMES,
  applyPaletteOverrides,
  bottomShadow,
  isBomberPaletteName,
  paletteByName,
  pickBomberPalette
} from "../../src/generators/bomber-palette";

describe("BOMBER_PALETTES table (S101)", () => {
  it("ships exactly 8 palettes", () => {
    expect(BOMBER_PALETTES.length).toBe(8);
    expect(BOMBER_PALETTE_NAMES.length).toBe(8);
  });

  it("every entry has all 8 color fields as 7-char hex strings", () => {
    for (const p of BOMBER_PALETTES) {
      for (const field of ["head", "torsoTop", "torsoBottom", "upperArm", "forearm", "upperLeg", "lowerLeg", "accent"] as const) {
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
    expect(paletteByName("sky").torsoTop).toBe("#3ab0ff");
    expect(paletteByName("ember").name).toBe("ember");
  });
});

describe("bottomShadow (S102)", () => {
  it("returns a hex string darker than the input", () => {
    const dark = bottomShadow("#ffffff");
    expect(dark).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(dark).not.toBe("#ffffff");
    // 0.55 of 255 ≈ 140, so the result should be around #8c8c8c.
    expect(dark.toLowerCase()).toBe("#8c8c8c");
  });

  it("honours the optional factor", () => {
    expect(bottomShadow("#ffffff", 0.5).toLowerCase()).toBe("#808080");
    expect(bottomShadow("#ffffff", 1.0).toLowerCase()).toBe("#ffffff");
  });
});

describe("BomberPalette torsoBottom + forearm + lowerLeg derivation (S102)", () => {
  it("torsoBottom is darker than torsoTop for every shipped palette", () => {
    for (const p of BOMBER_PALETTES) {
      const top = parseInt(p.torsoTop.slice(1), 16);
      const bottom = parseInt(p.torsoBottom.slice(1), 16);
      expect(bottom).toBeLessThan(top);
    }
  });

  it("forearm + lowerLeg are darker than upperArm + upperLeg respectively", () => {
    for (const p of BOMBER_PALETTES) {
      const ua = parseInt(p.upperArm.slice(1), 16);
      const fa = parseInt(p.forearm.slice(1), 16);
      expect(fa).toBeLessThanOrEqual(ua);
      const ul = parseInt(p.upperLeg.slice(1), 16);
      const ll = parseInt(p.lowerLeg.slice(1), 16);
      expect(ll).toBeLessThanOrEqual(ul);
    }
  });
});

describe("applyPaletteOverrides (S102)", () => {
  it("pass-through when overrides is undefined", () => {
    const base = paletteByName("sky");
    expect(applyPaletteOverrides(base, undefined)).toEqual(base);
  });

  it("replaces only specified channels", () => {
    const base = paletteByName("sky");
    const out = applyPaletteOverrides(base, { head: "#000000", accent: "#ff00ff" });
    expect(out.head).toBe("#000000");
    expect(out.accent).toBe("#ff00ff");
    expect(out.torsoTop).toBe(base.torsoTop);
    expect(out.upperArm).toBe(base.upperArm);
    expect(out.forearm).toBe(base.forearm);
    expect(out.upperLeg).toBe(base.upperLeg);
    expect(out.lowerLeg).toBe(base.lowerLeg);
  });

  it("name field is unaffected by overrides", () => {
    const base = paletteByName("rose");
    expect(applyPaletteOverrides(base, { head: "#abcdef" }).name).toBe("rose");
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
