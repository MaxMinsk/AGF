// S165 KABOOM-MULTI-VARIANT-BLOCKS (GDP-2026-05-28-003) — floor-tile
// variant builders. Each returns a thin 1.0 × 0.05 × 1.0 slab so the
// grid placement is identical. Variants differ in vertex-colour
// pattern only — no extra geometry merging needed for these.
//
// Variant 0 — plain slate.
// Variant 1 — diagonal stripe (vertices on the +x/+z diagonal tinted).
// Variant 2 — centre dot (vertices nearest the centre tinted).
// Variant 3 — panelled edge highlight (perimeter vertices tinted).
//
// `bitmask` is RESERVED for future Wang autotile selection. v1 ignores.

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color
} from "three";

import { paintVertexColors } from "./hard-block-variants";

/** Dark slate primary tone (visual-style.md floor-tile-primary). */
export const FLOOR_TILE_PRIMARY = "#1d2536";
/** Subtle highlight accent. */
export const FLOOR_TILE_ACCENT = "#33405b";
/** Edge darker tint (panel variant). */
export const FLOOR_TILE_EDGE = "#101728";

export type FloorTileVariantIndex = 0 | 1 | 2 | 3;

const TILE_W = 1.0;
const TILE_H = 0.05;
const TILE_D = 1.0;

export function buildFloorTileVariant(
  index: FloorTileVariantIndex,
  bitmask?: number
): BufferGeometry {
  void bitmask; // reserved for Wang autotile
  switch (index) {
    case 0: return buildVariant0Plain();
    case 1: return buildVariant1DiagonalStripe();
    case 2: return buildVariant2CentreDot();
    case 3: return buildVariant3PanelledEdge();
  }
}

function buildVariant0Plain(): BufferGeometry {
  const g = new BoxGeometry(TILE_W, TILE_H, TILE_D, 1, 1, 1);
  paintVertexColors(g, FLOOR_TILE_PRIMARY);
  return g;
}

function buildVariant1DiagonalStripe(): BufferGeometry {
  // 4×1×4 subdivisions so the diagonal vertex band is discoverable.
  const g = new BoxGeometry(TILE_W, TILE_H, TILE_D, 4, 1, 4);
  paintVertexColors(g, FLOOR_TILE_PRIMARY);
  paintDiagonalStripe(g, FLOOR_TILE_ACCENT);
  return g;
}

function buildVariant2CentreDot(): BufferGeometry {
  // 4×1×4 subdivisions gives a centre vertex (0, ±h/2, 0) to tint.
  const g = new BoxGeometry(TILE_W, TILE_H, TILE_D, 4, 1, 4);
  paintVertexColors(g, FLOOR_TILE_PRIMARY);
  paintCentreDot(g, FLOOR_TILE_ACCENT);
  return g;
}

function buildVariant3PanelledEdge(): BufferGeometry {
  // 4×1×4 subdivisions so the perimeter ring is distinct from the
  // inner cells.
  const g = new BoxGeometry(TILE_W, TILE_H, TILE_D, 4, 1, 4);
  paintVertexColors(g, FLOOR_TILE_PRIMARY);
  paintPerimeterRing(g, FLOOR_TILE_EDGE);
  return g;
}

// ---- helpers ----

function paintDiagonalStripe(geometry: BufferGeometry, hex: string): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const color = geometry.getAttribute("color") as BufferAttribute | undefined;
  if (color === undefined) return;
  const c = new Color(hex);
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    // Diagonal from -X/-Z corner to +X/+Z corner — x ≈ z.
    if (Math.abs(x - z) < 0.15) {
      color.setXYZ(i, c.r, c.g, c.b);
    }
  }
  color.needsUpdate = true;
}

function paintCentreDot(geometry: BufferGeometry, hex: string): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const color = geometry.getAttribute("color") as BufferAttribute | undefined;
  if (color === undefined) return;
  const c = new Color(hex);
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    if (Math.abs(x) < 0.15 && Math.abs(z) < 0.15) {
      color.setXYZ(i, c.r, c.g, c.b);
    }
  }
  color.needsUpdate = true;
}

function paintPerimeterRing(geometry: BufferGeometry, hex: string): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const color = geometry.getAttribute("color") as BufferAttribute | undefined;
  if (color === undefined) return;
  const c = new Color(hex);
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    // Perimeter — either |x| or |z| at the outer edge.
    if (Math.abs(x) > 0.45 || Math.abs(z) > 0.45) {
      color.setXYZ(i, c.r, c.g, c.b);
    }
  }
  color.needsUpdate = true;
}
