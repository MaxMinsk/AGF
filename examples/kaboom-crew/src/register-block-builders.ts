// S165 KABOOM-MULTI-VARIANT-BLOCKS (GDP-2026-05-28-003) — register the
// three procedural-mesh builders (hard-block / soft-block / floor-tile)
// with the renderer. The block-variant-system rewrites the
// MeshRenderer.mesh of each soft / hard block at scene-load so it
// resolves through this registry with a `<gx>,<gz>,<sceneSeed>` seed
// fragment. Each builder decodes the seed, picks a variant 0..3 via
// selectVariantIndex, and returns the corresponding BufferGeometry.

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

/**
 * Register the 3 block-family builders with the renderer's procedural
 * mesh registry. Calls before scene-load + the block-variant-system
 * pass so the registry already has the keys when MeshLifecycleSystem
 * resolves the rewritten mesh refs.
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
