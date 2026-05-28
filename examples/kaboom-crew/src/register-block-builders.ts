// S165 KABOOM-MULTI-VARIANT-BLOCKS (GDP-2026-05-28-003) +
// S170 KABOOM-WANG-INTEGRATION (GDP-2026-05-28-004 Stage 3) — register
// the three block-family procedural-mesh builders with the renderer.
//
// S165 path (still registered for floor-tile + as a fallback for hard
// / soft blocks): the family key `kaboom-hard-block` resolves through
// a single seed-aware builder that decodes a `<gx>,<gz>,<sceneSeed>`
// fragment and picks one of 4 variants.
//
// S170 path (the active path for hard / soft blocks): register 4
// distinct per-variant keys per family — `kaboom-hard-block-0` ..
// `kaboom-hard-block-3` (and soft-block twins). The Wang resolver +
// kaboom-side mesh-sync bridge write `procedural:kaboom-hard-block-N`
// onto each cell's MeshRenderer.mesh once the Wang bitmask resolves.
// Per-variant keys keep the procedural-mesh-registry cache trivial
// (one cached BufferGeometry per variant, shared across every cell
// that ends up at that bitmask).

import type { ThreeRenderer } from "../../../engine/render/three-renderer";

import {
  buildHardBlockVariant,
  type HardBlockVariantIndex
} from "./blocks/hard-block-variants";
import {
  buildSoftBlockVariant,
  type SoftBlockVariantIndex
} from "./blocks/soft-block-variants";
import {
  buildFloorTileVariant,
  type FloorTileVariantIndex
} from "./blocks/floor-tile-variants";
import {
  decodeBlockSeed,
  selectVariantIndex,
  type VariantIndex
} from "./blocks/per-cell-variant-selector";

export const HARD_BLOCK_MESH_KEY = "kaboom-hard-block";
export const SOFT_BLOCK_MESH_KEY = "kaboom-soft-block";
export const FLOOR_TILE_MESH_KEY = "kaboom-floor-tile";

/** S170 — per-variant mesh keys. Wang resolver writes these onto cells. */
export const HARD_BLOCK_VARIANT_KEYS = [
  "kaboom-hard-block-0",
  "kaboom-hard-block-1",
  "kaboom-hard-block-2",
  "kaboom-hard-block-3"
] as const;
export const SOFT_BLOCK_VARIANT_KEYS = [
  "kaboom-soft-block-0",
  "kaboom-soft-block-1",
  "kaboom-soft-block-2",
  "kaboom-soft-block-3"
] as const;

/**
 * Register the 3 block-family builders with the renderer's procedural
 * mesh registry. Calls before scene-load + the block-variant-system
 * pass so the registry already has the keys when MeshLifecycleSystem
 * resolves the rewritten mesh refs.
 *
 * S170 also registers the 4 per-variant keys per family so the Wang
 * resolver bridge can pick a variant by index without re-deriving from
 * a seed string.
 */
export function registerKaboomBlockBuilders(renderer: ThreeRenderer): void {
  const registry = renderer.proceduralMeshRegistry();
  registry.register(HARD_BLOCK_MESH_KEY, (seedHash) => {
    const idx = variantForSeed(seedHash);
    return buildHardBlockVariant(idx as HardBlockVariantIndex);
  });
  registry.register(SOFT_BLOCK_MESH_KEY, (seedHash) => {
    const idx = variantForSeed(seedHash);
    return buildSoftBlockVariant(idx as SoftBlockVariantIndex);
  });
  registry.register(FLOOR_TILE_MESH_KEY, (seedHash) => {
    const idx = variantForSeed(seedHash);
    return buildFloorTileVariant(idx as FloorTileVariantIndex);
  });

  // S170 — per-variant builders. The seed is ignored; the variant
  // identity is the registry key itself. The registry caches one
  // BufferGeometry per (key, seed) tuple — using a fixed seed
  // ("default") collapses every cell sharing the same variant into a
  // single cached geometry.
  for (let i = 0; i < HARD_BLOCK_VARIANT_KEYS.length; i += 1) {
    const variantIndex = i as HardBlockVariantIndex;
    registry.register(HARD_BLOCK_VARIANT_KEYS[i]!, () =>
      buildHardBlockVariant(variantIndex)
    );
  }
  for (let i = 0; i < SOFT_BLOCK_VARIANT_KEYS.length; i += 1) {
    const variantIndex = i as SoftBlockVariantIndex;
    registry.register(SOFT_BLOCK_VARIANT_KEYS[i]!, () =>
      buildSoftBlockVariant(variantIndex)
    );
  }
}

/**
 * Map a seed string into a variant index. Encoded seeds look like
 * `<gx>,<gz>,<sceneSeed>`; everything else (including the registry's
 * "default" placeholder) falls back to variant 0.
 */
function variantForSeed(seedHash: string): VariantIndex {
  const decoded = decodeBlockSeed(seedHash);
  if (decoded === undefined) return 0;
  return selectVariantIndex(decoded.gx, decoded.gz, decoded.sceneSeed);
}
