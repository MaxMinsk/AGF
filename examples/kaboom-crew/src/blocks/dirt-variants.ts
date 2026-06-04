// GDP-2026-06-04-004 — dirt biome config. Loose irregular soil: the most
// asymmetric outlines + the roughest top (per-vertex noise displacement).

import type { BufferGeometry } from "three";

import {
  buildBiomeTile,
  smoothstep,
  type BezierCfg,
  type BiomeTileConfig,
  type TileShape,
  type TileSubvariantIndex
} from "./biome-tile-builder";

export const DIRT_PRIMARY   = "#8a5a2a";
export const DIRT_HIGHLIGHT = "#a0723a";
export const DIRT_SHADOW    = "#5a3010";

export type DirtVariantIndex = 0 | 1 | 2 | 3;
export type DirtSubvariantIndex = TileSubvariantIndex;

const DIRT_BEZIER: Record<TileSubvariantIndex, BezierCfg> = {
  0: { kind: "single", outward: 0.20, lateral: 0.10 },
  1: { kind: "single", outward: 0.22, lateral: -0.12 },
  2: { kind: "double", a: [0.15, 0.18], b: [0.12, -0.10], valley: 0.05 }
};

const DIRT_CORNER_PUSH: Record<TileSubvariantIndex, number> = { 0: 0.14, 1: 0.20, 2: 0.10 };

function hashNoise(x: number, z: number, sub: number): number {
  const d = x * 12.9898 + z * 78.233 + sub * 37.1;
  return Math.abs(Math.sin(d) * 43758.5) % 1;
}

function dirtInterior(x: number, z: number, sub: TileSubvariantIndex): { dy: number; t: number } {
  const h = hashNoise(x, z, sub);
  return { dy: h * 0.08, t: smoothstep(0.4, 1.0, h) * 0.7 };
}

const DIRT_CONFIG: BiomeTileConfig = {
  topHeight: 0.12,
  edgeStyle: "jagged",
  bezier: DIRT_BEZIER,
  cornerPush: DIRT_CORNER_PUSH,
  primary: DIRT_PRIMARY,
  highlight: DIRT_HIGHLIGHT,
  shadow: DIRT_SHADOW,
  side: DIRT_SHADOW,
  interior: dirtInterior
};

export function buildDirtShape(shape: TileShape, sub: TileSubvariantIndex): BufferGeometry {
  return buildBiomeTile(DIRT_CONFIG, shape, sub);
}

export function buildDirtVariant(_index: DirtVariantIndex, _bitmask?: number): BufferGeometry {
  return buildDirtShape("F", 0);
}
export function buildDirtSubvariant(role: DirtVariantIndex, sub: DirtSubvariantIndex): BufferGeometry {
  const rep: Record<number, TileShape> = { 0: "B", 1: "C", 2: "F", 3: "A" };
  return buildDirtShape(rep[role] ?? "F", sub);
}
