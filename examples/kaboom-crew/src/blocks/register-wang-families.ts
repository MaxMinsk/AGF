// S170 KABOOM-WANG-INTEGRATION (GDP-2026-05-28-004 Stage 3) —
// register Kaboom Crew's two Wang tile families (hard-block + soft-
// block) with the engine's family registry. Each family carries 16
// variants whose `meshKey` collapses (via wang-family-lookup) into one
// of the 4 procedural mesh keys S165 already registers on the
// ThreeRenderer:
//
//   `procedural:kaboom-hard-block-{0..3}`
//   `procedural:kaboom-soft-block-{0..3}`
//
// IMPORTANT — the mesh-key format ABOVE is the per-variant identifier
// the kaboom-side bridge (`createKaboomWangMeshSyncSystem`) writes
// onto MeshRenderer.mesh. The corresponding ProceduralMeshRegistry
// entries register the FAMILY key (`kaboom-hard-block`) once with a
// seed-aware builder — see ./register-block-builders.ts.
//
// Idempotent: HMR or repeated `attachUi` calls would otherwise hit
// the registry's duplicate-name guard and throw. The try/catch
// silently absorbs the duplicate-name error so callers don't have to
// guard themselves.

import {
  registerWangTileFamily,
  type WangTileFamily,
  type WangTileVariant
} from "../../../../engine/render/autotile";

import {
  hardBlockBitmaskToVariant,
  softBlockBitmaskToVariant
} from "./wang-family-lookup";

/** Wang family name for Kaboom hard (indestructible) blocks. */
export const HARD_BLOCK_WANG_FAMILY = "kaboom-hard-block";
/** Wang family name for Kaboom soft (destructible) blocks. */
export const SOFT_BLOCK_WANG_FAMILY = "kaboom-soft-block";

/**
 * Register both Kaboom Crew Wang families with the engine registry.
 * Idempotent across HMR re-imports — duplicate-name errors are
 * swallowed so the second `attachUi` call after a hot-reload doesn't
 * crash the bootstrap.
 *
 * Call site: `attachUi` in bootstrap.ts, alongside
 * `registerKaboomBlockBuilders`.
 */
export function registerKaboomWangFamilies(): void {
  registerFamilySafe(buildHardBlockFamily());
  registerFamilySafe(buildSoftBlockFamily());
}

function registerFamilySafe(family: WangTileFamily): void {
  try {
    registerWangTileFamily(family);
  } catch (error) {
    // Duplicate-name guard — module-level registries persist across
    // Vite HMR re-imports, so the second registration would throw.
    // Any other error (validation, malformed variant) still bubbles.
    if (!(error instanceof Error) || !error.message.includes("duplicate name")) {
      throw error;
    }
  }
}

function buildHardBlockFamily(): WangTileFamily {
  return {
    name: HARD_BLOCK_WANG_FAMILY,
    variants: buildVariants(HARD_BLOCK_WANG_FAMILY, hardBlockBitmaskToVariant)
  };
}

function buildSoftBlockFamily(): WangTileFamily {
  return {
    name: SOFT_BLOCK_WANG_FAMILY,
    variants: buildVariants(SOFT_BLOCK_WANG_FAMILY, softBlockBitmaskToVariant)
  };
}

function buildVariants(
  familyName: string,
  lookup: (bitmask: number) => 0 | 1 | 2 | 3
): ReadonlyArray<WangTileVariant> {
  const variants: WangTileVariant[] = [];
  for (let bitmask = 0; bitmask < 16; bitmask += 1) {
    const variantIndex = lookup(bitmask);
    variants.push({ meshKey: `procedural:${familyName}-${variantIndex}` });
  }
  return variants;
}
