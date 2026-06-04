// S272 KABOOM-FLOOR-WANG-STONE — third floor terrain family. Same
// shape as S176 grass / S271b path: 4 procedural variant builders
// with vertex-painted thin 1×0.05×1 slabs. Cool-grey palette so
// stone reads as "weathered slab" alongside grass (verdant) and
// path (earthy).
//
// Variant 0 — plain stone tile (uniform STONE_PRIMARY).
// Variant 1 — corner-darkened (suggests cracked edge).
// Variant 2 — centre highlight (suggests a polished spot or chip).
// Variant 3 — stripe (suggests a grout line).

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color
} from "three";

import { paintVertexColors } from "./hard-block-variants";

/** Weathered cool-grey primary tone (docs/game-design/terrain-design.md §3 stone). */
export const STONE_PRIMARY = "#777a82";
/** Darker crack / shadow tint. */
export const STONE_SHADOW = "#4a4d54";
/** Brighter polish / chip highlight. */
export const STONE_HIGHLIGHT = "#9ea2ad";

export type StoneVariantIndex = 0 | 1 | 2 | 3;
export type StoneSubvariantIndex = 0 | 1 | 2;

const TILE_W = 1.0;
const TILE_H = 0.05;
const TILE_D = 1.0;

export function buildStoneVariant(
  index: StoneVariantIndex,
  bitmask?: number
): BufferGeometry {
  void bitmask;
  return buildStoneSubvariant(index, 0);
}

/** S285 — stone sub-variant builder. 3 crack-pattern variations per role. */
export function buildStoneSubvariant(
  role: StoneVariantIndex,
  sub: StoneSubvariantIndex
): BufferGeometry {
  const g = new BoxGeometry(TILE_W, TILE_H, TILE_D, 4, 1, 4);
  paintVertexColors(g, STONE_PRIMARY);
  // S288 per-biome shape: stone tiles have a sharp 90-degree bevel (chiseled look).
  sharpBevelTopEdge(g, 0.009);
  switch (role) {
    case 0: // edge — crack along border
      if (sub === 0) paintBorder(g, STONE_SHADOW, 0.35);
      else if (sub === 1) { paintBorder(g, STONE_SHADOW, 0.4); paintCentre(g, STONE_HIGHLIGHT, 0.2); }
      else paintCrossHatch(g, STONE_SHADOW);
      break;
    case 1: // corner — bevel shadow
      if (sub === 0) paintCorners(g, STONE_SHADOW);
      else if (sub === 1) paintCorners(g, STONE_HIGHLIGHT);
      else { paintCorners(g, STONE_SHADOW); paintCentre(g, STONE_HIGHLIGHT, 0.15); }
      break;
    case 2: // filler — subtle grain
      if (sub === 0) paintCentre(g, STONE_HIGHLIGHT, 0.1);
      else if (sub === 1) paintCrossHatch(g, STONE_SHADOW);
      else paintBorder(g, STONE_SHADOW, 0.32);
      break;
    case 3: // isolated
      if (sub === 0) { /* plain */ }
      else if (sub === 1) paintCorners(g, STONE_SHADOW);
      else paintBorder(g, STONE_SHADOW, 0.3);
      break;
  }
  return g;
}

/**
 * Sharp step-bevel: outer edge band snapped to a lower Y level (hard step,
 * not a smooth slope) — chiseled/beveled stone appearance.
 */
function sharpBevelTopEdge(geometry: BufferGeometry, depth: number): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const halfH = TILE_H / 2;
  const edgeBand = 0.3;
  for (let i = 0; i < position.count; i++) {
    if (Math.abs(position.getY(i) - halfH) > 0.001) continue;
    const x = Math.abs(position.getX(i));
    const z = Math.abs(position.getZ(i));
    if (x > edgeBand || z > edgeBand) {
      position.setY(i, halfH - depth);
    }
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

function paintCentre(geometry: BufferGeometry, hex: string, radius: number): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const color = geometry.getAttribute("color") as BufferAttribute | undefined;
  if (color === undefined) return;
  const c = new Color(hex);
  for (let i = 0; i < position.count; i += 1) {
    if (Math.abs(position.getX(i)) < radius && Math.abs(position.getZ(i)) < radius) {
      color.setXYZ(i, c.r, c.g, c.b);
    }
  }
  color.needsUpdate = true;
}

function paintCrossHatch(geometry: BufferGeometry, hex: string): void {
  // Two thin orthogonal stripes creating a cross-hatch crack pattern.
  const position = geometry.getAttribute("position") as BufferAttribute;
  const color = geometry.getAttribute("color") as BufferAttribute | undefined;
  if (color === undefined) return;
  const c = new Color(hex);
  for (let i = 0; i < position.count; i += 1) {
    const x = Math.abs(position.getX(i));
    const z = Math.abs(position.getZ(i));
    if (x < 0.1 || z < 0.1) color.setXYZ(i, c.r, c.g, c.b);
  }
  color.needsUpdate = true;
}

function buildVariant0Plain(): BufferGeometry {
  const g = new BoxGeometry(TILE_W, TILE_H, TILE_D, 1, 1, 1);
  paintVertexColors(g, STONE_PRIMARY);
  return g;
}

function buildVariant1CornerTint(): BufferGeometry {
  const g = new BoxGeometry(TILE_W, TILE_H, TILE_D, 4, 1, 4);
  paintVertexColors(g, STONE_PRIMARY);
  paintCorners(g, STONE_SHADOW);
  return g;
}

function buildVariant2CentreHighlight(): BufferGeometry {
  const g = new BoxGeometry(TILE_W, TILE_H, TILE_D, 4, 1, 4);
  paintVertexColors(g, STONE_PRIMARY);
  paintCentre(g, STONE_HIGHLIGHT, 0.15);
  return g;
}

function buildVariant3Stripe(): BufferGeometry {
  const g = new BoxGeometry(TILE_W, TILE_H, TILE_D, 4, 1, 4);
  paintVertexColors(g, STONE_PRIMARY);
  paintStripe(g, STONE_SHADOW);
  return g;
}

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
