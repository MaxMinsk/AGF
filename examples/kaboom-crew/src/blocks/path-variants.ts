// GDP-2026-06-04-004 — path biome config. Worn footpath character: smooth,
// gentle curves, flat compacted top (no blade noise), darker contained edges.

import type { BufferGeometry } from "three";

import {
  buildBiomeTile,
  type BezierCfg,
  type BiomeTileConfig,
  type TileShape,
  type TileSubvariantIndex
} from "./biome-tile-builder";

export const PATH_PRIMARY   = "#7a5c3a";
export const PATH_HIGHLIGHT = "#8a6a4a";
export const PATH_SHADOW    = "#3a2010";

export type PathVariantIndex = 0 | 1 | 2 | 3;
export type PathSubvariantIndex = TileSubvariantIndex;

const PATH_BEZIER: Record<TileSubvariantIndex, BezierCfg> = {
  0: { kind: "single", outward: 0.12, lateral: 0.0  },
  1: { kind: "single", outward: 0.14, lateral: 0.05 },
  2: { kind: "single", outward: 0.10, lateral: 0.0  }
};

const PATH_CORNER_PUSH: Record<TileSubvariantIndex, number> = { 0: 0.08, 1: 0.10, 2: 0.06 };

const PATH_CONFIG: BiomeTileConfig = {
  topHeight: 0.06,
  edgeStyle: "smooth",
  bezier: PATH_BEZIER,
  cornerPush: PATH_CORNER_PUSH,
  primary: PATH_PRIMARY,
  highlight: PATH_HIGHLIGHT,
  shadow: PATH_SHADOW,
  side: PATH_SHADOW,
  // GDP-2026-06-04-009 — packed-earth cliff wall: light path tone → deep shadow.
  sideRamp: ["#1a1108", "#3a2010", "#6e4d2a", "#8a6a4a"],
  // Flat, compacted — faint centre lightening only.
  interior: (x, z, _sub) => ({ dy: 0, t: 0.18 * Math.max(0, 1 - (x * x + z * z) * 3) })
};

export function buildPathShape(shape: TileShape, sub: TileSubvariantIndex, heightCells = 0): BufferGeometry {
  return buildBiomeTile(PATH_CONFIG, shape, sub, heightCells);
}

export function buildPathVariant(_index: PathVariantIndex, _bitmask?: number): BufferGeometry {
  return buildPathShape("F", 0);
}
export function buildPathSubvariant(role: PathVariantIndex, sub: PathSubvariantIndex): BufferGeometry {
  const rep: Record<number, TileShape> = { 0: "B", 1: "C", 2: "F", 3: "A" };
  return buildPathShape(rep[role] ?? "F", sub);
}
