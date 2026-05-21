// S104 KABOOM-MIGRATE-PREFABS — bridge between Kaboom Crew prefabs and
// the procbomber generator that lives at examples/procbomber-bench/src/.
//
// The bench retains its standalone iteration UI (sliders / palette /
// dropdowns). Kaboom Crew imports the small subset it needs: the
// per-part procedural builders, the tree spawner, the recipe codec.
//
// This module exposes two helpers consumed by examples/kaboom-crew/bootstrap.ts:
//   - registerProcbomberBuilders(renderer): registers six per-part
//     procedural mesh keys (procbomber-torso / head / upperArm /
//     forearm / upperLeg / lowerLeg) with the renderer's
//     ProceduralMeshRegistry. Closes over a `getRecipe(entityId) →
//     ResolvedCharacterRecipe` so each bomber's mesh is built from
//     ITS recipe (player ≠ bot).
//   - spawnBomberFor(applyCommands, rootId, recipe): builds the 19-
//     entity tree under the prefab-spawned bomber root, pushing
//     entity.create + component.set commands through `applyCommands`.

import type { EngineCommand } from "../../../engine/core/commands/types";
import type { ThreeRenderer } from "../../../engine/render/three-renderer";

import {
  spawnBomberTree,
  type BomberTreeResult
} from "../../procbomber-bench/src/bomber-tree-spawner";
import {
  resolveRecipeFromSeed,
  type ResolvedCharacterRecipe
} from "../../procbomber-bench/src/character-recipe";
import {
  generatePart,
  type BomberPartName,
  type BomberPartSizes
} from "../../procbomber-bench/src/generators/bomber-parts";
import {
  applyPaletteOverrides,
  paletteByName,
  type BomberPalette
} from "../../procbomber-bench/src/generators/bomber-palette";

const PART_KEYS: ReadonlyArray<{ key: string; part: BomberPartName }> = [
  { key: "procbomber-torso", part: "torso" },
  { key: "procbomber-head", part: "head" },
  { key: "procbomber-upperArm", part: "upperArm" },
  { key: "procbomber-forearm", part: "forearm" },
  { key: "procbomber-upperLeg", part: "upperLeg" },
  { key: "procbomber-lowerLeg", part: "lowerLeg" }
];

export function recipeToSizes(recipe: ResolvedCharacterRecipe): BomberPartSizes {
  return {
    headSize: recipe.headSize,
    torsoHeight: recipe.torsoHeight,
    torsoWidth: recipe.torsoWidth,
    upperArmLength: recipe.upperArmLength,
    forearmLength: recipe.forearmLength,
    armWidth: recipe.armWidth,
    upperLegLength: recipe.upperLegLength,
    lowerLegLength: recipe.lowerLegLength,
    legWidth: recipe.legWidth
  };
}

export function recipeToPalette(recipe: ResolvedCharacterRecipe): BomberPalette {
  return applyPaletteOverrides(paletteByName(recipe.paletteName), recipe.paletteOverrides);
}

/**
 * Register the six per-part procedural mesh builders with the
 * renderer. Calls back into `resolveForOwner` to discover the recipe
 * the entity currently expects — the seed string in the procedural
 * mesh ref (procedural:procbomber-torso#<entityId>) is the owner key.
 */
export function registerProcbomberBuilders(
  renderer: ThreeRenderer,
  resolveForOwner: (ownerEntityId: string) => ResolvedCharacterRecipe
): void {
  const registry = renderer.proceduralMeshRegistry();
  for (const { key, part } of PART_KEYS) {
    registry.register(key, (seedHash) => {
      // seedHash is the owner entity id passed via the mesh ref's
      // `#<seed>` fragment. spawnBomberFor emits refs like
      // procedural:procbomber-torso#player.1 — that's how each bomber
      // gets its own recipe even though they share the registry key.
      const recipe = resolveForOwner(seedHash);
      return generatePart(part, recipeToSizes(recipe), recipeToPalette(recipe), {
        head: recipe.headShape,
        torso: recipe.torsoShape,
        limb: recipe.limbShape
      });
    });
  }
}

/**
 * Spawn the 19-entity bomber tree under `rootId`. Each mesh entity's
 * MeshRenderer.mesh ref carries the owner id as a seed so the per-part
 * builder can fetch the right recipe. Returns the LimbPivots etc the
 * caller may want.
 */
export function spawnBomberFor(
  applyCommands: (cmds: ReadonlyArray<EngineCommand>) => void,
  rootId: string,
  recipe: ResolvedCharacterRecipe
): BomberTreeResult {
  return spawnBomberTree(applyCommands, {
    rootId,
    sizes: recipeToSizes(recipe),
    keyPrefix: "procbomber",
    seed: rootId
  });
}

/** Convenience: simple seed-only recipe builder. */
export function recipeForOwner(rootId: string): ResolvedCharacterRecipe {
  return resolveRecipeFromSeed(rootId);
}
