// S271 KABOOM-FLOOR-WANG-PATH (GDP-2026-05-28-012 follow-up). Path
// terrain family — adds the second of the GDP's five floor families
// on top of the S176 grass infrastructure. Same shape as
// grass-variants: 4 thin 1.0 × 0.05 × 1.0 BufferGeometries with
// vertex-painted earth tones. The 16 → 4 collapse lives in the
// shared wang-family-lookup table.
//
// Variant 0 — plain earthy slab (uniform PATH_PRIMARY).
// Variant 1 — earth with darker corner-tint (suggests footworn edge).
// Variant 2 — earth with mid-cell highlight (suggests a pebble cluster).
// Variant 3 — earth with stripe (suggests a worn track along Z).

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color
} from "three";

import { paintVertexColors } from "./hard-block-variants";

/** Warm packed-earth primary tone (docs/game-design/terrain-design.md §3 path). */
export const PATH_PRIMARY = "#6e4d2a";
/** Darker shadow / edge tint. */
export const PATH_SHADOW = "#4a3018";
/** Brighter highlight tint for centre pebbles / dust spots. */
export const PATH_HIGHLIGHT = "#8a6a4a";

export type PathVariantIndex = 0 | 1 | 2 | 3;

const TILE_W = 1.0;
const TILE_H = 0.05;
const TILE_D = 1.0;

/**
 * Build the geometry for path variant `index`. All four variants share
 * the 1×0.05×1 outer dimensions so the overlay sits flush above the
 * scene's stretched-box floor. Bitmask is reserved for future sub-
 * variant work and ignored in v1 (mirror of grass-variants).
 */
export function buildPathVariant(
  index: PathVariantIndex,
  bitmask?: number
): BufferGeometry {
  void bitmask;
  switch (index) {
    case 0: return buildVariant0Plain();
    case 1: return buildVariant1CornerTint();
    case 2: return buildVariant2CentreHighlight();
    case 3: return buildVariant3Stripe();
  }
}

// ---- variants ----

function buildVariant0Plain(): BufferGeometry {
  const g = new BoxGeometry(TILE_W, TILE_H, TILE_D, 1, 1, 1);
  paintVertexColors(g, PATH_PRIMARY);
  return g;
}

function buildVariant1CornerTint(): BufferGeometry {
  const g = new BoxGeometry(TILE_W, TILE_H, TILE_D, 4, 1, 4);
  paintVertexColors(g, PATH_PRIMARY);
  paintCorners(g, PATH_SHADOW);
  return g;
}

function buildVariant2CentreHighlight(): BufferGeometry {
  const g = new BoxGeometry(TILE_W, TILE_H, TILE_D, 4, 1, 4);
  paintVertexColors(g, PATH_PRIMARY);
  paintCentre(g, PATH_HIGHLIGHT);
  return g;
}

function buildVariant3Stripe(): BufferGeometry {
  const g = new BoxGeometry(TILE_W, TILE_H, TILE_D, 4, 1, 4);
  paintVertexColors(g, PATH_PRIMARY);
  paintStripe(g, PATH_SHADOW);
  return g;
}

// ---- vertex-paint helpers (file-local) ----

function paintCorners(geometry: BufferGeometry, hex: string): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const color = geometry.getAttribute("color") as BufferAttribute | undefined;
  if (color === undefined) return;
  const c = new Color(hex);
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    if (Math.abs(x) > 0.4 && Math.abs(z) > 0.4) {
      color.setXYZ(i, c.r, c.g, c.b);
    }
  }
  color.needsUpdate = true;
}

function paintCentre(geometry: BufferGeometry, hex: string): void {
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

function paintStripe(geometry: BufferGeometry, hex: string): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const color = geometry.getAttribute("color") as BufferAttribute | undefined;
  if (color === undefined) return;
  const c = new Color(hex);
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    if (Math.abs(x) < 0.15) {
      color.setXYZ(i, c.r, c.g, c.b);
    }
  }
  color.needsUpdate = true;
}
