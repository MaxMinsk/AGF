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
    expect(r.accessories).toEqual([]);
  });
});

describe("accessories field (S106)", () => {
  it("validateRecipe accepts 0..3 accessories with valid kinds", () => {
    expect(validateRecipe({ seed: "x", accessories: [] })).toBeDefined();
    expect(validateRecipe({ seed: "x", accessories: [{ kind: "antennae" }] })).toBeDefined();
    expect(validateRecipe({
      seed: "x",
      accessories: [{ kind: "cap" }, { kind: "backpack", mountSocket: "torso.back" }, { kind: "fins" }]
    })).toBeDefined();
  });

  it("validateRecipe rejects > 3 accessories", () => {
    expect(validateRecipe({
      seed: "x",
      accessories: [{ kind: "antennae" }, { kind: "visor" }, { kind: "cap" }, { kind: "fins" }]
    })).toBeUndefined();
  });

  it("validateRecipe rejects unknown accessory kind / unknown socket", () => {
    expect(validateRecipe({ seed: "x", accessories: [{ kind: "monocle" }] })).toBeUndefined();
    expect(validateRecipe({ seed: "x", accessories: [{ kind: "cap", mountSocket: "knee" }] })).toBeUndefined();
  });

  it("encodeRecipe / decodeRecipe round-trip preserves accessories", () => {
    const r = { seed: "demo", accessories: [{ kind: "cap" as const }, { kind: "backpack" as const }] };
    const decoded = decodeRecipe(encodeRecipe(r));
    expect(decoded?.accessories).toEqual(r.accessories);
  });

  it("resolveRecipeFromSeed picks 0..2 deterministic accessories", () => {
    const a = resolveRecipeFromSeed("seed-a");
    const b = resolveRecipeFromSeed("seed-a");
    expect(a.accessories).toEqual(b.accessories);
    expect(a.accessories.length).toBeLessThanOrEqual(2);
  });
});

describe("texturing field (S109)", () => {
  it("resolveRecipeFromSeed sets texturing.panelSeams = true by default", () => {
    const r = resolveRecipeFromSeed("any-seed");
    expect(r.texturing.panelSeams).toBe(true);
  });

  it("partial texturing in recipe survives resolution", () => {
    const r = resolveRecipeFromSeed("x", { seed: "x", texturing: { panelSeams: false } });
    expect(r.texturing.panelSeams).toBe(false);
  });

  it("withRecipeDefaults populates texturing.panelSeams=true when missing", () => {
    const r = withRecipeDefaults({ seed: "x" });
    expect(r.texturing.panelSeams).toBe(true);
  });

  it("validateRecipe accepts {} texturing (every field optional)", () => {
    expect(validateRecipe({ seed: "x", texturing: {} })).toBeDefined();
  });

  it("validateRecipe accepts texturing.panelSeams: false", () => {
    expect(validateRecipe({ seed: "x", texturing: { panelSeams: false } })).toBeDefined();
  });

  it("validateRecipe rejects non-boolean panelSeams", () => {
    expect(validateRecipe({ seed: "x", texturing: { panelSeams: "yes" } })).toBeUndefined();
  });

  it("validateRecipe rejects null texturing block", () => {
    expect(validateRecipe({ seed: "x", texturing: null })).toBeUndefined();
  });

  it("encodeRecipe / decodeRecipe round-trip preserves texturing", () => {
    const r = { seed: "demo", texturing: { panelSeams: false } };
    const decoded = decodeRecipe(encodeRecipe(r));
    expect(decoded?.texturing).toEqual({ panelSeams: false });
  });
});
