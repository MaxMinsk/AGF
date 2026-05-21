// S104 KABOOM-RECIPE-URL-KNOBS — bench-state ↔ recipe bridge.

import { describe, expect, it } from "vitest";

import { defaultBenchState } from "../../src/bench-state";
import { encodeRecipe, resolveRecipeFromSeed } from "../../src/character-recipe";
import { applyRecipeToState, readRecipeFromUrl, stateToRecipe } from "../../src/recipe-url";

describe("applyRecipeToState (S104)", () => {
  it("overlays every field from the recipe onto the bench state", () => {
    const state = defaultBenchState();
    const recipe = resolveRecipeFromSeed("custom-seed");
    applyRecipeToState(state, recipe);
    expect(state.headSize).toBe(recipe.headSize);
    expect(state.torsoHeight).toBe(recipe.torsoHeight);
    expect(state.upperArmLength).toBe(recipe.upperArmLength);
    expect(state.shoulderSpread).toBe(recipe.shoulderSpread);
    expect(state.headShape).toBe(recipe.headShape);
    expect(state.paletteOverride).toBe(recipe.paletteName);
    expect(state.seed).toBe("custom-seed");
  });
});

describe("stateToRecipe (S104)", () => {
  it("round-trips bench state through recipe encoding", () => {
    const state = defaultBenchState();
    state.seed = "round-trip-test";
    state.headSize = 0.42;
    state.headShape = "capsule";
    state.paletteOverride = "ember";
    const recipe = stateToRecipe(state);
    expect(recipe.seed).toBe("round-trip-test");
    expect(recipe.headSize).toBe(0.42);
    expect(recipe.headShape).toBe("capsule");
    expect(recipe.paletteName).toBe("ember");
    // Encode it; decode it; apply it back; assert state matches.
    const encoded = encodeRecipe(recipe);
    expect(encoded.length).toBeGreaterThan(0);
  });
});

describe("readRecipeFromUrl (S104)", () => {
  // The function uses `window.location.search`; tests run in Node, so
  // we stub `globalThis.window` for each variant. Restore after.
  it("returns undefined when there is no window (SSR/node)", () => {
    const w = (globalThis as { window?: unknown }).window;
    delete (globalThis as { window?: unknown }).window;
    try {
      expect(readRecipeFromUrl()).toBeUndefined();
    } finally {
      if (w !== undefined) (globalThis as { window?: unknown }).window = w;
    }
  });

  it("recipe query param wins when present + valid", () => {
    const seed = "win-recipe";
    const recipe = resolveRecipeFromSeed(seed);
    const encoded = encodeRecipe({ ...recipe });
    const search = `?recipe=${encoded}&seed=other-seed`;
    (globalThis as { window?: { location: { search: string } } }).window = {
      location: { search }
    };
    try {
      const r = readRecipeFromUrl();
      expect(r?.source).toBe("url-recipe");
      expect(r?.recipe.seed).toBe(seed);
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });

  it("seed query param falls in when recipe is missing", () => {
    (globalThis as { window?: { location: { search: string } } }).window = {
      location: { search: "?seed=just-seed" }
    };
    try {
      const r = readRecipeFromUrl();
      expect(r?.source).toBe("url-seed");
      expect(r?.recipe.seed).toBe("just-seed");
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });

  it("returns undefined when neither param is present", () => {
    (globalThis as { window?: { location: { search: string } } }).window = {
      location: { search: "?bomberPalette=mint" }
    };
    try {
      expect(readRecipeFromUrl()).toBeUndefined();
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });

  it("malformed recipe falls back to seed when both are present", () => {
    (globalThis as { window?: { location: { search: string } } }).window = {
      location: { search: "?recipe=not-base64&seed=fallback" }
    };
    try {
      const r = readRecipeFromUrl();
      expect(r?.source).toBe("url-seed");
      expect(r?.recipe.seed).toBe("fallback");
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });
});
