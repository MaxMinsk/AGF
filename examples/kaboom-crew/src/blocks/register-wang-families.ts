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
  dirtBitmaskToVariant,
  grassBitmaskToVariant,
  hardBlockBitmaskToVariant,
  pathBitmaskToVariant,
  softBlockBitmaskToVariant,
  stoneBitmaskToVariant
} from "./wang-family-lookup";

/** Wang family name for Kaboom hard (indestructible) blocks. */
export const HARD_BLOCK_WANG_FAMILY = "kaboom-hard-block";
/** Wang family name for Kaboom soft (destructible) blocks. */
export const SOFT_BLOCK_WANG_FAMILY = "kaboom-soft-block";
/** S176 — Wang family name for grass floor-overlay terrain cells. */
export const GRASS_WANG_FAMILY = "kaboom-grass";
/** S271 — Wang family name for path (earth-tone) floor-overlay cells. */
export const PATH_WANG_FAMILY = "kaboom-path";
/** S272 — Wang family name for stone (grey) floor-overlay cells. */
export const STONE_WANG_FAMILY = "kaboom-stone";
/** S272 — Wang family name for dirt (rust-brown) floor-overlay cells. */
export const DIRT_WANG_FAMILY = "kaboom-dirt";

/**
 * Register every Kaboom Crew Wang family with the engine registry.
 * Idempotent across HMR re-imports — duplicate-name errors are
 * swallowed so the second `attachUi` call after a hot-reload doesn't
 * crash the bootstrap.
 *
 * S176 — registers a THIRD family ("kaboom-grass") alongside hard +
 * soft block. The 16 → 4 collapse re-uses the shared lookup table so
 * grass cells map onto 4 procedural mesh keys (the
 * `procedural:kaboom-grass-{0..3}` builders).
 *
 * Call site: `attachUi` in bootstrap.ts, alongside
 * `registerKaboomBlockBuilders`.
 */
export function registerKaboomWangFamilies(): void {
  registerFamilySafe(buildHardBlockFamily());
  registerFamilySafe(buildSoftBlockFamily());
  registerFamilySafe(buildGrassFamily());
  registerFamilySafe(buildPathFamily());
  registerFamilySafe(buildStoneFamily());
  registerFamilySafe(buildDirtFamily());
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

function buildGrassFamily(): WangTileFamily {
  return {
    name: GRASS_WANG_FAMILY,
    variants: buildVariants(GRASS_WANG_FAMILY, grassBitmaskToVariant)
  };
}

function buildPathFamily(): WangTileFamily {
  return {
    name: PATH_WANG_FAMILY,
    variants: buildVariants(PATH_WANG_FAMILY, pathBitmaskToVariant)
  };
}

function buildStoneFamily(): WangTileFamily {
  return {
    name: STONE_WANG_FAMILY,
    variants: buildVariants(STONE_WANG_FAMILY, stoneBitmaskToVariant)
  };
}

function buildDirtFamily(): WangTileFamily {
  return {
    name: DIRT_WANG_FAMILY,
    variants: buildVariants(DIRT_WANG_FAMILY, dirtBitmaskToVariant)
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

// Module-load registration. attachUi calls registerKaboomWangFamilies()
// too, but the scheduler can fire its first fixedUpdate BEFORE
// attachUi runs — the engine resolver-system + block-variant-system
// would then see an empty Wang-tile-family registry and skip the
// resolve. Registering eagerly at import time means the families
// are present by the time any system tick fires.
registerKaboomWangFamilies();
