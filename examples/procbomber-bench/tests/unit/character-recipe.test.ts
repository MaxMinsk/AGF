// S104 KABOOM-RECIPE-SCHEMA + KABOOM-RECIPE-CODEC tests.

import { describe, expect, it } from "vitest";

import {
  decodeRecipe,
  encodeRecipe,
  resolveRecipeFromSeed,
  validateRecipe,
  withRecipeDefaults,
  type CharacterRecipe
} from "../../src/character-recipe";

describe("validateRecipe (S104)", () => {
  it("accepts a recipe with only `seed`", () => {
    expect(validateRecipe({ seed: "x" })).toBeDefined();
  });
  it("rejects missing seed", () => {
    expect(validateRecipe({})).toBeUndefined();
    expect(validateRecipe({ seed: "" })).toBeUndefined();
    expect(validateRecipe({ seed: 42 })).toBeUndefined();
  });
  it("rejects non-finite numbers", () => {
    expect(validateRecipe({ seed: "x", headSize: NaN })).toBeUndefined();
    expect(validateRecipe({ seed: "x", forwardTilt: Infinity })).toBeUndefined();
  });
  it("rejects unknown shape", () => {
    expect(validateRecipe({ seed: "x", headShape: "pyramid" })).toBeUndefined();
  });
  it("rejects unknown palette name", () => {
    expect(validateRecipe({ seed: "x", paletteName: "rainbow" })).toBeUndefined();
  });
  it("rejects palette override that isn't 7-char hex", () => {
    expect(validateRecipe({ seed: "x", paletteOverrides: { head: "red" } })).toBeUndefined();
    expect(validateRecipe({ seed: "x", paletteOverrides: { head: "#fff" } })).toBeUndefined();
  });
  it("accepts a fully-specified recipe", () => {
    const full: CharacterRecipe = {
      seed: "demo",
      headSize: 0.3,
      torsoHeight: 0.4,
      torsoWidth: 0.4,
      upperArmLength: 0.2,
      forearmLength: 0.2,
      armWidth: 0.15,
      upperLegLength: 0.18,
      lowerLegLength: 0.18,
      legWidth: 0.18,
      forwardTilt: 0.1,
      armRestAngle: -0.1,
      shoulderMountY: 0,
      shoulderMountZ: 0,
      hipMountY: 0,
      hipMountZ: 0,
      shoulderSpread: 1,
      hipSpread: 1,
      headShape: "capsule",
      torsoShape: "box",
      limbShape: "cylinder",
      paletteName: "ember",
      paletteOverrides: { head: "#abcdef" }
    };
    expect(validateRecipe(full)).toEqual(full);
  });
});

describe("encodeRecipe / decodeRecipe (S104)", () => {
  it("round-trips a minimal recipe", () => {
    const r: CharacterRecipe = { seed: "abc" };
    const encoded = encodeRecipe(r);
    expect(typeof encoded).toBe("string");
    expect(encoded.length).toBeGreaterThan(0);
    expect(decodeRecipe(encoded)).toEqual(r);
  });

  it("round-trips a full recipe deterministically", () => {
    const r: CharacterRecipe = {
      seed: "complex-seed",
      headSize: 0.42,
      paletteName: "rose",
      paletteOverrides: { accent: "#112233" },
      headShape: "capsule",
      forwardTilt: 0.3
    };
    const encoded = encodeRecipe(r);
    expect(decodeRecipe(encoded)).toEqual(r);
    // Encode is stable for stable input.
    expect(encodeRecipe(r)).toBe(encoded);
  });

  it("uses url-safe alphabet (no `+`, `/`, `=`)", () => {
    const r: CharacterRecipe = { seed: "a/b+c=d/e" };
    const encoded = encodeRecipe(r);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("decode returns undefined on malformed input", () => {
    expect(decodeRecipe("")).toBeUndefined();
    expect(decodeRecipe("!!!not-base64!!!")).toBeUndefined();
    // Valid base64 of "not json".
    const garbage = encodeRecipe({ seed: "x" } as CharacterRecipe).slice(0, 3);
    expect(decodeRecipe(garbage)).toBeUndefined();
  });
});

describe("resolveRecipeFromSeed (S104)", () => {
  it("returns a fully-populated recipe (no undefined fields)", () => {
    const r = resolveRecipeFromSeed("seed-42");
    expect(r.seed).toBe("seed-42");
    expect(typeof r.headSize).toBe("number");
    expect(typeof r.forwardTilt).toBe("number");
    expect(typeof r.headShape).toBe("string");
    expect(typeof r.paletteName).toBe("string");
    expect(r.paletteOverrides).toEqual({});
  });

  it("is deterministic for the same seed", () => {
    const a = resolveRecipeFromSeed("hello");
    const b = resolveRecipeFromSeed("hello");
    expect(a).toEqual(b);
  });

  it("produces different recipes for different seeds (variation check)", () => {
    const seeds = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    const headSizes = new Set(seeds.map((s) => resolveRecipeFromSeed(s).headSize));
    expect(headSizes.size).toBeGreaterThan(5);
  });

  it("respects partial overrides", () => {
    const r = resolveRecipeFromSeed("x", { seed: "x", headSize: 0.5, paletteName: "ember" });
    expect(r.headSize).toBe(0.5);
    expect(r.paletteName).toBe("ember");
    // Non-overridden fields come from the seed stream.
    expect(typeof r.torsoHeight).toBe("number");
  });
});

describe("withRecipeDefaults (S104)", () => {
  it("fills missing fields with BOMBER_MESH_DEFAULTS-style defaults (no seed entropy)", () => {
    const r = withRecipeDefaults({ seed: "x" });
    expect(r.headSize).toBe(0.35);
    expect(r.paletteName).toBe("sky");
    expect(r.headShape).toBe("box");
  });
});
