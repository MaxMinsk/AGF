// S287 KABOOM-WANG-WALL-SHADOW — shadow-overlay variants.
// 16 thin transparent-ish slabs, one per Wang bitmask index.
// Index 0 (no hard-block neighbors) → fully dark-tinted slab with near-zero
// opacity is still registered (the consumer skips spawning it at index 0).
// Indices 1-15 vary in shadow depth proportional to the popcount of set bits.
//
// Geometry: 1.0 × 0.01 × 1.0 thin slab, vertex-painted with a dark
// transparent-looking colour (the engine uses additive/alpha blending for
// floor-overlay entities naturally due to the depth offset).
//
// Shadow depth by bit-count:
//   0 bits (0)  → #0d0d0d (virtually invisible — consumer skips spawning)
//   1 bit       → #1a1a1a (subtle shadow)
//   2 bits      → #262626 (medium shadow)
//   3 bits      → #333333 (strong shadow)
//   4 bits (15) → #3d3d3d (maximum shadow)

import {
  BoxGeometry,
  BufferGeometry
} from "three";

import { paintVertexColors } from "./hard-block-variants";

const TILE_W = 1.0;
const TILE_H = 0.01;
const TILE_D = 1.0;

const SHADOW_BY_POPCOUNT: readonly string[] = [
  "#0d0d0d", // 0 bits — effectively invisible
  "#1a1a1a", // 1 bit
  "#262626", // 2 bits
  "#333333", // 3 bits
  "#3d3d3d"  // 4 bits
];

function popcount(n: number): number {
  let count = 0;
  let v = n & 0xf;
  while (v > 0) { count += v & 1; v >>= 1; }
  return count;
}

export type WallShadowVariantIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

/** Build the shadow slab geometry for a given bitmask index (0-15). */
export function buildWallShadowVariant(index: WallShadowVariantIndex): BufferGeometry {
  const g = new BoxGeometry(TILE_W, TILE_H, TILE_D, 1, 1, 1);
  const pc = popcount(index);
  paintVertexColors(g, SHADOW_BY_POPCOUNT[pc]!);
  return g;
}
