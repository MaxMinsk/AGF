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
  buildGrassShape,
  type GrassShape,
  type GrassSubvariantIndex
} from "./blocks/grass-variants";
import {
  buildPathVariant,
  buildPathSubvariant,
  type PathVariantIndex,
  type PathSubvariantIndex
} from "./blocks/path-variants";
import {
  buildStoneVariant,
  buildStoneSubvariant,
  type StoneVariantIndex,
  type StoneSubvariantIndex
} from "./blocks/stone-variants";
import {
  buildDirtVariant,
  buildDirtSubvariant,
  type DirtVariantIndex,
  type DirtSubvariantIndex
} from "./blocks/dirt-variants";
import {
  buildFloorSubvariant,
  type FloorVariantIndex,
  type FloorSubvariantIndex
} from "./blocks/floor-variants";
import {
  buildWallShadowVariant,
  type WallShadowVariantIndex
} from "./blocks/wall-shadow-variants";
import {
  decodeBlockSeed,
  selectVariantIndex,
  type VariantIndex
} from "./blocks/per-cell-variant-selector";
import {
  ARENA_THEMES,
  isArenaThemeKey,
  type ArenaThemeKey
} from "./themes/theme-table";

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
/** S176 — legacy per-variant mesh keys (V1 family, kept for registry compat). */
export const GRASS_VARIANT_KEYS = [
  "kaboom-grass-0",
  "kaboom-grass-1",
  "kaboom-grass-2",
  "kaboom-grass-3"
] as const;
/** GDP-2026-06-04-003 — grass shape-based mesh keys (6 shapes × 3 sub = 18). */
export const GRASS_SHAPES = ["A", "B", "C", "D", "E", "F"] as const;
export const GRASS_SHAPE_KEYS: ReadonlyArray<ReadonlyArray<string>> = GRASS_SHAPES.map(
  (shape) => [`kaboom-grass-${shape}-0`, `kaboom-grass-${shape}-1`, `kaboom-grass-${shape}-2`]
);
/** S271 — legacy per-variant mesh keys for path. */
export const PATH_VARIANT_KEYS = [
  "kaboom-path-0",
  "kaboom-path-1",
  "kaboom-path-2",
  "kaboom-path-3"
] as const;
/** S285 — sub-variant mesh keys for path V2 (role × sub). */
export const PATH_SUBVARIANT_KEYS: ReadonlyArray<ReadonlyArray<string>> = [
  ["kaboom-path-0-0", "kaboom-path-0-1", "kaboom-path-0-2"],
  ["kaboom-path-1-0", "kaboom-path-1-1", "kaboom-path-1-2"],
  ["kaboom-path-2-0", "kaboom-path-2-1", "kaboom-path-2-2"],
  ["kaboom-path-3-0", "kaboom-path-3-1", "kaboom-path-3-2"]
] as const;
/** S272 — legacy per-variant mesh keys for stone. */
export const STONE_VARIANT_KEYS = [
  "kaboom-stone-0",
  "kaboom-stone-1",
  "kaboom-stone-2",
  "kaboom-stone-3"
] as const;
/** S285 — sub-variant mesh keys for stone V2 (role × sub). */
export const STONE_SUBVARIANT_KEYS: ReadonlyArray<ReadonlyArray<string>> = [
  ["kaboom-stone-0-0", "kaboom-stone-0-1", "kaboom-stone-0-2"],
  ["kaboom-stone-1-0", "kaboom-stone-1-1", "kaboom-stone-1-2"],
  ["kaboom-stone-2-0", "kaboom-stone-2-1", "kaboom-stone-2-2"],
  ["kaboom-stone-3-0", "kaboom-stone-3-1", "kaboom-stone-3-2"]
] as const;
/** S272 — legacy per-variant mesh keys for dirt. */
export const DIRT_VARIANT_KEYS = [
  "kaboom-dirt-0",
  "kaboom-dirt-1",
  "kaboom-dirt-2",
  "kaboom-dirt-3"
] as const;
/** S285 — sub-variant mesh keys for dirt V2 (role × sub). */
export const DIRT_SUBVARIANT_KEYS: ReadonlyArray<ReadonlyArray<string>> = [
  ["kaboom-dirt-0-0", "kaboom-dirt-0-1", "kaboom-dirt-0-2"],
  ["kaboom-dirt-1-0", "kaboom-dirt-1-1", "kaboom-dirt-1-2"],
  ["kaboom-dirt-2-0", "kaboom-dirt-2-1", "kaboom-dirt-2-2"],
  ["kaboom-dirt-3-0", "kaboom-dirt-3-1", "kaboom-dirt-3-2"]
] as const;
/** S287 — wall-shadow variant keys (one per bitmask index 0-15). */
export const WALL_SHADOW_VARIANT_KEYS: ReadonlyArray<string> = Array.from(
  { length: 16 }, (_, i) => `kaboom-wall-shadow-${i}`
);
/** S286 — sub-variant mesh keys for floor V2 (role × sub). */
export const FLOOR_SUBVARIANT_KEYS: ReadonlyArray<ReadonlyArray<string>> = [
  ["kaboom-floor-0-0", "kaboom-floor-0-1", "kaboom-floor-0-2"],
  ["kaboom-floor-1-0", "kaboom-floor-1-1", "kaboom-floor-1-2"],
  ["kaboom-floor-2-0", "kaboom-floor-2-1", "kaboom-floor-2-2"],
  ["kaboom-floor-3-0", "kaboom-floor-3-1", "kaboom-floor-3-2"]
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

  // S170 + S172 — per-variant builders. The seed encodes the active
  // arena theme key (S172). Registry caches one BufferGeometry per
  // (key, seed) tuple, so (variant 0, theme=warehouse) and (variant 0,
  // theme=bunker) end up as distinct cached geometries with the
  // theme's hard/soft block palette baked in via paintVertexColors.
  for (let i = 0; i < HARD_BLOCK_VARIANT_KEYS.length; i += 1) {
    const variantIndex = i as HardBlockVariantIndex;
    registry.register(HARD_BLOCK_VARIANT_KEYS[i]!, (seed) =>
      buildHardBlockVariant(variantIndex, hardPaletteForSeed(seed))
    );
  }
  for (let i = 0; i < SOFT_BLOCK_VARIANT_KEYS.length; i += 1) {
    const variantIndex = i as SoftBlockVariantIndex;
    registry.register(SOFT_BLOCK_VARIANT_KEYS[i]!, (seed) =>
      buildSoftBlockVariant(variantIndex, softPaletteForSeed(seed))
    );
  }
  // GDP-2026-06-04-003 — 18 grass shape builders (6 shapes × 3 sub-variants).
  for (let si = 0; si < GRASS_SHAPES.length; si += 1) {
    const shape = GRASS_SHAPES[si]!;
    const subs  = GRASS_SHAPE_KEYS[si]!;
    for (let sub = 0; sub < subs.length; sub += 1) {
      const s = sub as GrassSubvariantIndex;
      registry.register(subs[sub]!, (_seed) => buildGrassShape(shape as GrassShape, s));
    }
  }
  // S271 — register the 4 path variant keys.
  for (let i = 0; i < PATH_VARIANT_KEYS.length; i += 1) {
    const variantIndex = i as PathVariantIndex;
    registry.register(PATH_VARIANT_KEYS[i]!, (_seed) =>
      buildPathVariant(variantIndex)
    );
  }
  // S285 — register 12 path sub-variant builders.
  for (let role = 0; role < PATH_SUBVARIANT_KEYS.length; role += 1) {
    const subs = PATH_SUBVARIANT_KEYS[role]!;
    for (let sub = 0; sub < subs.length; sub += 1) {
      const r = role as PathVariantIndex;
      const s = sub as PathSubvariantIndex;
      registry.register(subs[sub]!, (_seed) => buildPathSubvariant(r, s));
    }
  }
  // S272 — third + fourth families: stone + dirt.
  for (let i = 0; i < STONE_VARIANT_KEYS.length; i += 1) {
    const variantIndex = i as StoneVariantIndex;
    registry.register(STONE_VARIANT_KEYS[i]!, (_seed) =>
      buildStoneVariant(variantIndex)
    );
  }
  // S285 — register 12 stone sub-variant builders.
  for (let role = 0; role < STONE_SUBVARIANT_KEYS.length; role += 1) {
    const subs = STONE_SUBVARIANT_KEYS[role]!;
    for (let sub = 0; sub < subs.length; sub += 1) {
      const r = role as StoneVariantIndex;
      const s = sub as StoneSubvariantIndex;
      registry.register(subs[sub]!, (_seed) => buildStoneSubvariant(r, s));
    }
  }
  for (let i = 0; i < DIRT_VARIANT_KEYS.length; i += 1) {
    const variantIndex = i as DirtVariantIndex;
    registry.register(DIRT_VARIANT_KEYS[i]!, (_seed) =>
      buildDirtVariant(variantIndex)
    );
  }
  // S285 — register 12 dirt sub-variant builders.
  for (let role = 0; role < DIRT_SUBVARIANT_KEYS.length; role += 1) {
    const subs = DIRT_SUBVARIANT_KEYS[role]!;
    for (let sub = 0; sub < subs.length; sub += 1) {
      const r = role as DirtVariantIndex;
      const s = sub as DirtSubvariantIndex;
      registry.register(subs[sub]!, (_seed) => buildDirtSubvariant(r, s));
    }
  }
  // S286 — register 12 floor sub-variant builders.
  for (let role = 0; role < FLOOR_SUBVARIANT_KEYS.length; role += 1) {
    const subs = FLOOR_SUBVARIANT_KEYS[role]!;
    for (let sub = 0; sub < subs.length; sub += 1) {
      const r = role as FloorVariantIndex;
      const s = sub as FloorSubvariantIndex;
      registry.register(subs[sub]!, (_seed) => buildFloorSubvariant(r, s));
    }
  }
  // S287 — register 16 wall-shadow variant builders (one per bitmask index).
  for (let i = 0; i < WALL_SHADOW_VARIANT_KEYS.length; i += 1) {
    const idx = i as WallShadowVariantIndex;
    registry.register(WALL_SHADOW_VARIANT_KEYS[i]!, (_seed) => buildWallShadowVariant(idx));
  }
}

/**
 * Resolve a HardBlockPalette from a procedural-mesh seed string. The
 * mesh-sync bridge in block-variant-system writes seeds of the form
 * `<themeKey>` (S172) so the cached procedural geometry is per-theme.
 * Unknown / missing themes fall back to the default palette.
 */
function hardPaletteForSeed(seed: string): { primary?: string; accent?: string } {
  const themeKey = parseThemeKey(seed);
  if (themeKey === undefined) return {};
  return ARENA_THEMES[themeKey].hardBlockPalette;
}

function softPaletteForSeed(seed: string): { primary?: string; accent?: string } {
  const themeKey = parseThemeKey(seed);
  if (themeKey === undefined) return {};
  return ARENA_THEMES[themeKey].softBlockPalette;
}

function parseThemeKey(seed: string): ArenaThemeKey | undefined {
  return isArenaThemeKey(seed) ? seed : undefined;
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
