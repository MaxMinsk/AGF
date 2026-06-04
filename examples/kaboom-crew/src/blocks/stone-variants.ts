// GDP-2026-06-04-004 — stone biome config. Angular geometric rock: tight
// curves, chunky profile, faceted top (region-stepped Y + light/dark facets).

import type { BufferGeometry } from "three";

import {
  buildBiomeTile,
  type BezierCfg,
  type BiomeTileConfig,
  type TileShape,
  type TileSubvariantIndex
} from "./biome-tile-builder";

export const STONE_PRIMARY   = "#6a6a5a";
export const STONE_HIGHLIGHT = "#8a8a7a";
export const STONE_SHADOW    = "#2a2a1a";

export type StoneVariantIndex = 0 | 1 | 2 | 3;
export type StoneSubvariantIndex = TileSubvariantIndex;

const STONE_BEZIER: Record<TileSubvariantIndex, BezierCfg> = {
  0: { kind: "single", outward: 0.10, lateral: 0.0  },
  1: { kind: "single", outward: 0.12, lateral: -0.06 },
  2: { kind: "double", a: [0.08, 0.12], b: [0.08, -0.12], valley: 0.02 }
};

const STONE_CORNER_PUSH: Record<TileSubvariantIndex, number> = { 0: 0.06, 1: 0.10, 2: 0.04 };

/** Faceting — quantise into a coarse grid, constant Y + brightness step per region. */
function stoneInterior(x: number, z: number, sub: TileSubvariantIndex): { dy: number; t: number } {
  const gx = Math.min(2, Math.floor((x + 0.5) * 3));
  const gz = Math.min(2, Math.floor((z + 0.5) * 3));
  const region = (gx * 3 + gz + sub * 5) % 4;
  const dyByRegion = [0, 0.02, 0.01, 0.015];
  const tByRegion  = [0.0, 0.5, 0.2, 0.35];
  return { dy: dyByRegion[region]!, t: tByRegion[region]! };
}

const STONE_CONFIG: BiomeTileConfig = {
  topHeight: 0.18,
  bezier: STONE_BEZIER,
  cornerPush: STONE_CORNER_PUSH,
  primary: STONE_PRIMARY,
  highlight: STONE_HIGHLIGHT,
  shadow: STONE_SHADOW,
  side: STONE_SHADOW,
  interior: stoneInterior
};

export function buildStoneShape(shape: TileShape, sub: TileSubvariantIndex): BufferGeometry {
  return buildBiomeTile(STONE_CONFIG, shape, sub);
}

export function buildStoneVariant(_index: StoneVariantIndex, _bitmask?: number): BufferGeometry {
  return buildStoneShape("F", 0);
}
export function buildStoneSubvariant(role: StoneVariantIndex, sub: StoneSubvariantIndex): BufferGeometry {
  const rep: Record<number, TileShape> = { 0: "B", 1: "C", 2: "F", 3: "A" };
  return buildStoneShape(rep[role] ?? "F", sub);
}
