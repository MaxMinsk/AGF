// GDP-2026-06-04-003/006 — grass biome config for the shared curved-outline
// tile builder. The geometry pipeline lives in biome-tile-builder.ts; this
// file only supplies grass-specific parameters + interior detail.
//
// Grass character: organic curved edges, smooth blade-noise interior, 3
// clearly distinct sub-variants (round / lopsided / scalloped) and 3 filler
// interiors (calm blotch / raised tufts / diagonal grain).

import type { BufferGeometry } from "three";

import {
  buildBiomeTile,
  gauss,
  shapeForBitmask,
  smoothstep,
  type BezierCfg,
  type BiomeTileConfig,
  type TileShape,
  type TileSubvariantIndex
} from "./biome-tile-builder";

// ── Palette ────────────────────────────────────────────────────────────────
export const GRASS_PRIMARY   = "#4a8a3e";
export const GRASS_SHADOW    = "#3a6a30";
export const GRASS_HIGHLIGHT = "#5fa84a";

export type GrassShape = TileShape;
export type GrassSubvariantIndex = TileSubvariantIndex;
export type GrassVariantIndex = 0 | 1 | 2 | 3; // legacy alias

const TUFT_LIFT = 0.04;

const GRASS_BEZIER: Record<GrassSubvariantIndex, BezierCfg> = {
  0: { kind: "single", outward: 0.22, lateral: 0.0  },
  1: { kind: "single", outward: 0.11, lateral: 0.18 },
  2: { kind: "double", a: [0.20, 0.16], b: [0.20, -0.16], valley: 0.08 }
};

const GRASS_CORNER_PUSH: Record<GrassSubvariantIndex, number> = { 0: 0.24, 1: 0.06, 2: 0.15 };

/** Grass interior — smooth blade detail; 3 distinct treatments per sub. */
function grassInterior(x: number, z: number, sub: TileSubvariantIndex): { dy: number; t: number } {
  switch (sub) {
    case 0: // calm — one soft off-centre highlight blotch
      return { dy: 0, t: 0.7 * gauss(x - 0.15, z + 0.10, 0.28) };
    case 1: { // tufted — 3 raised tufts ringed with highlight
      const tufts: Array<[number, number]> = [[-0.18, -0.12], [0.16, 0.04], [-0.02, 0.20]];
      let dy = 0, t = 0;
      for (const [tx, tz] of tufts) {
        dy += TUFT_LIFT * gauss(x - tx, z - tz, 0.16);
        t = Math.max(t, smoothstep(0.16, 0.06, Math.hypot(x - tx, z - tz)) * 0.85);
      }
      return { dy, t };
    }
    case 2: { // grained — diagonal bands
      const band = 0.5 + 0.5 * Math.sin((x + z) * 14);
      return { dy: 0, t: band > 0.55 ? 0.6 : 0 };
    }
  }
}

const GRASS_CONFIG: BiomeTileConfig = {
  topHeight: 0.20,
  edgeStyle: "smooth",
  bezier: GRASS_BEZIER,
  cornerPush: GRASS_CORNER_PUSH,
  primary: GRASS_PRIMARY,
  highlight: GRASS_HIGHLIGHT,
  shadow: GRASS_SHADOW,
  side: GRASS_SHADOW,
  // GDP-2026-06-04-009 — grass-topped soil cliff wall: green crown over warm
  // soil dropping to a near-black contact-shadow base.
  sideRamp: ["#241a0e", "#5e3f20", "#9a6f3e", "#5aa838"],
  interior: grassInterior
};

// ── Public API ─────────────────────────────────────────────────────────────

export function buildGrassShape(shape: GrassShape, sub: GrassSubvariantIndex, heightCells = 0): BufferGeometry {
  return buildBiomeTile(GRASS_CONFIG, shape, sub, heightCells);
}

/** Re-export for the mesh-sync bridge + Wang family registration. */
export function grassShapeForBitmask(bitmask: number): { shape: GrassShape; rotationYDeg: number } {
  return shapeForBitmask(bitmask);
}

// ── Legacy compat wrappers ────────────────────────────────────────────────

export function buildGrassMesh(bitmask: number, sub: GrassSubvariantIndex): BufferGeometry {
  return buildGrassShape(shapeForBitmask(bitmask).shape, sub);
}

export function buildGrassVariant(index: GrassVariantIndex, _bitmask?: number): BufferGeometry {
  const rep: Record<number, GrassShape> = { 0: "B", 1: "C", 2: "F", 3: "A" };
  return buildGrassShape(rep[index] ?? "F", 0);
}

export function buildGrassSubvariant(role: GrassVariantIndex, sub: GrassSubvariantIndex): BufferGeometry {
  const rep: Record<number, GrassShape> = { 0: "B", 1: "C", 2: "F", 3: "A" };
  return buildGrassShape(rep[role] ?? "F", sub);
}
