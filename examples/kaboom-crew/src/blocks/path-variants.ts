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
export type PathSubvariantIndex = 0 | 1 | 2;

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
  return buildPathSubvariant(index, 0);
}

/** S285 — path sub-variant builder. 3 slight-curve variations per role. */
export function buildPathSubvariant(
  role: PathVariantIndex,
  sub: PathSubvariantIndex
): BufferGeometry {
  const g = new BoxGeometry(TILE_W, TILE_H, TILE_D, 4, 1, 4);
  paintVertexColors(g, PATH_PRIMARY);
  // S288 per-biome shape: path tiles have a gentle centre arc (worn footpath look).
  arcTopFace(g, 0.005);
  switch (role) {
    case 0: // edge
      if (sub === 0) paintBorder(g, PATH_SHADOW, 0.35);
      else if (sub === 1) { paintBorder(g, PATH_SHADOW, 0.4); paintCentre(g, PATH_HIGHLIGHT); }
      else paintStripe(g, PATH_SHADOW);
      break;
    case 1: // corner
      if (sub === 0) paintCorners(g, PATH_SHADOW);
      else if (sub === 1) paintCorners(g, PATH_HIGHLIGHT);
      else { paintCorners(g, PATH_SHADOW); paintCentre(g, PATH_HIGHLIGHT); }
      break;
    case 2: // filler
      if (sub === 0) paintCentre(g, PATH_HIGHLIGHT);
      else if (sub === 1) paintStripe(g, PATH_SHADOW);
      else paintBorder(g, PATH_SHADOW, 0.3);
      break;
    case 3: // isolated
      if (sub === 0) { /* plain */ }
      else if (sub === 1) paintCorners(g, PATH_SHADOW);
      else paintBorder(g, PATH_SHADOW, 0.28);
      break;
  }
  return g;
}

/**
 * Lift top-face centre vertices creating a smooth-arc cross-section
 * (centre higher than edges — the opposite of chamfer).
 */
function arcTopFace(geometry: BufferGeometry, lift: number): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const halfH = TILE_H / 2;
  for (let i = 0; i < position.count; i++) {
    if (Math.abs(position.getY(i) - halfH) > 0.001) continue;
    const dist = Math.sqrt(position.getX(i) ** 2 + position.getZ(i) ** 2);
    const factor = Math.max(0, 1 - dist / 0.707); // 0.707 ≈ half-diagonal
    position.setY(i, halfH + lift * factor);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

function paintBorder(geometry: BufferGeometry, hex: string, threshold: number): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const color = geometry.getAttribute("color") as BufferAttribute | undefined;
  if (color === undefined) return;
  const c = new Color(hex);
  for (let i = 0; i < position.count; i += 1) {
    if (Math.abs(position.getX(i)) > threshold || Math.abs(position.getZ(i)) > threshold) {
      color.setXYZ(i, c.r, c.g, c.b);
    }
  }
  color.needsUpdate = true;
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
