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
  registerWangFamilyWithSubvariants,
  type WangTileFamily,
  type WangTileVariant
} from "../../../../engine/render/autotile";

import {
  dirtBitmaskToVariant,
  grassBitmaskToVariant,
  hardBlockBitmaskToVariant,
  pathBitmaskToVariant,
  softBlockBitmaskToVariant,
  stoneBitmaskToVariant,
  type KaboomBlockVariantIndex
} from "./wang-family-lookup";
import { shapeForBitmask } from "./biome-tile-builder";

function floorBitmaskToVariant(bitmask: number): KaboomBlockVariantIndex {
  // Reuse the shared 16→4 lookup table — same role assignment as other families.
  return dirtBitmaskToVariant(bitmask);
}

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
/** S286 — Wang family name for floor (neutral grey) interior cells. */
export const FLOOR_WANG_FAMILY = "kaboom-floor";
/** S287 — Wang family name for the wall-shadow overlay layer. */
export const WALL_SHADOW_WANG_FAMILY = "kaboom-wall-shadow";

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
  // GDP-2026-06-04-003/004 — grass/path/stone/dirt use the 6-shape curved-
  // outline meshes (bitmask → shape + per-cell Transform rotation).
  registerShapeFamilySafe(GRASS_WANG_FAMILY);
  registerShapeFamilySafe(PATH_WANG_FAMILY);
  registerShapeFamilySafe(STONE_WANG_FAMILY);
  registerShapeFamilySafe(DIRT_WANG_FAMILY);
  // Floor is the backdrop family — kept role-based (no overlay entities spawn
  // for the default 'floor' family, so this is registration-only).
  registerFamilyV2Safe(FLOOR_WANG_FAMILY, floorBitmaskToVariant);
  // S287 — wall-shadow V1 family: 16 variants, one per bitmask index.
  registerFamilySafe(buildWallShadowFamily());
}

/** GDP-2026-06-04-004 — register a curved-outline biome family. Each bitmask
 *  maps to its canonical shape (A-F); the mesh-sync bridge applies the
 *  per-bitmask Y rotation on the cell Transform. 3 sub-variants per shape. */
function registerShapeFamilySafe(name: string): void {
  try {
    const table: ReadonlyArray<ReadonlyArray<WangTileVariant>> = Array.from({ length: 16 }, (_, bitmask) => {
      const { shape } = shapeForBitmask(bitmask);
      return [
        { meshKey: `procedural:${name}-${shape}-0` },
        { meshKey: `procedural:${name}-${shape}-1` },
        { meshKey: `procedural:${name}-${shape}-2` }
      ];
    });
    registerWangFamilyWithSubvariants(name, table);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("duplicate name")) {
      throw error;
    }
  }
}

function buildWallShadowFamily(): WangTileFamily {
  // Variants 0-15 each have a unique mesh key; the bitmask is passed
  // through directly (no 16→4 collapse) so shadow depth correlates
  // exactly with hard-block neighbour count.
  const variants: WangTileVariant[] = Array.from({ length: 16 }, (_, i) => ({
    meshKey: `procedural:${WALL_SHADOW_WANG_FAMILY}-${i}`
  }));
  return { name: WALL_SHADOW_WANG_FAMILY, variants };
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

/**
 * S285/S286 — role-based V2 registration (kept for the floor backdrop family).
 * 3 sub-variants per bitmask index, mesh keys `procedural:<name>-<role>-<sub>`.
 */
function registerFamilyV2Safe(
  name: string,
  lookup: (bitmask: number) => KaboomBlockVariantIndex
): void {
  try {
    const table: ReadonlyArray<ReadonlyArray<WangTileVariant>> = Array.from({ length: 16 }, (_, bitmask) => {
      const role = lookup(bitmask);
      return [
        { meshKey: `procedural:${name}-${role}-0` },
        { meshKey: `procedural:${name}-${role}-1` },
        { meshKey: `procedural:${name}-${role}-2` }
      ];
    });
    registerWangFamilyWithSubvariants(name, table);
  } catch (error) {
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

// Module-load registration. attachUi calls registerKaboomWangFamilies()
// too, but the scheduler can fire its first fixedUpdate BEFORE
// attachUi runs — the engine resolver-system + block-variant-system
// would then see an empty Wang-tile-family registry and skip the
// resolve. Registering eagerly at import time means the families
// are present by the time any system tick fires.
registerKaboomWangFamilies();
