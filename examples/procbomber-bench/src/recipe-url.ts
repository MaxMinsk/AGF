// S104 KABOOM-RECIPE-URL-KNOBS — bridge between the URL query string and
// the bench's BenchState. `?recipe=<base64>` overrides every slider via
// the decoded recipe; `?seed=<string>` runs resolveRecipeFromSeed to
// populate the bench from a seed alone.

import type { BenchState } from "./bench-state";
import {
  decodeRecipe,
  resolveRecipeFromSeed,
  type CharacterRecipe,
  type ResolvedCharacterRecipe
} from "./character-recipe";

export type RecipeFromUrl = {
  recipe: ResolvedCharacterRecipe;
  /** What put the recipe on screen. Useful for diagnostics. */
  source: "url-recipe" | "url-seed";
};

export function readRecipeFromUrl(): RecipeFromUrl | undefined {
  if (typeof window === "undefined") return undefined;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    return undefined;
  }
  const recipeParam = params.get("recipe");
  if (recipeParam !== null && recipeParam.length > 0) {
    const decoded = decodeRecipe(recipeParam);
    if (decoded !== undefined) {
      return { recipe: resolveRecipeFromSeed(decoded.seed, decoded), source: "url-recipe" };
    }
  }
  const seedParam = params.get("seed");
  if (seedParam !== null && seedParam.length > 0) {
    return { recipe: resolveRecipeFromSeed(seedParam), source: "url-seed" };
  }
  return undefined;
}

/** Overlay every recipe field onto the bench state in place. */
export function applyRecipeToState(state: BenchState, recipe: ResolvedCharacterRecipe): void {
  state.headSize = recipe.headSize;
  state.torsoHeight = recipe.torsoHeight;
  state.torsoWidth = recipe.torsoWidth;
  state.upperArmLength = recipe.upperArmLength;
  state.forearmLength = recipe.forearmLength;
  state.armWidth = recipe.armWidth;
  state.upperLegLength = recipe.upperLegLength;
  state.lowerLegLength = recipe.lowerLegLength;
  state.legWidth = recipe.legWidth;
  state.forwardTilt = recipe.forwardTilt;
  state.armRestAngle = recipe.armRestAngle;
  state.shoulderMountY = recipe.shoulderMountY;
  state.shoulderMountZ = recipe.shoulderMountZ;
  state.hipMountY = recipe.hipMountY;
  state.hipMountZ = recipe.hipMountZ;
  state.shoulderSpread = recipe.shoulderSpread;
  state.hipSpread = recipe.hipSpread;
  state.headShape = recipe.headShape;
  state.torsoShape = recipe.torsoShape;
  state.limbShape = recipe.limbShape;
  state.paletteOverride = recipe.paletteName;
  state.seed = recipe.seed;
  // S109 KABOOM-PROCEDURAL-TEXTURING
  state.panelSeams = recipe.texturing.panelSeams;
  // S112 KABOOM-PROCEDURAL-TEXTURING-LAYER-2
  state.decals = recipe.texturing.decals;
}

/** Inverse — build a CharacterRecipe from the live bench state. Useful for `?recipe=` capture buttons later. */
export function stateToRecipe(state: BenchState): CharacterRecipe {
  const out: CharacterRecipe = {
    seed: state.seed,
    headSize: state.headSize,
    torsoHeight: state.torsoHeight,
    torsoWidth: state.torsoWidth,
    upperArmLength: state.upperArmLength,
    forearmLength: state.forearmLength,
    armWidth: state.armWidth,
    upperLegLength: state.upperLegLength,
    lowerLegLength: state.lowerLegLength,
    legWidth: state.legWidth,
    forwardTilt: state.forwardTilt,
    armRestAngle: state.armRestAngle,
    shoulderMountY: state.shoulderMountY,
    shoulderMountZ: state.shoulderMountZ,
    hipMountY: state.hipMountY,
    hipMountZ: state.hipMountZ,
    shoulderSpread: state.shoulderSpread,
    hipSpread: state.hipSpread,
    headShape: state.headShape,
    torsoShape: state.torsoShape,
    limbShape: state.limbShape,
    texturing: { panelSeams: state.panelSeams, decals: [...state.decals] }
  };
  if (state.paletteOverride !== undefined) out.paletteName = state.paletteOverride;
  return out;
}
