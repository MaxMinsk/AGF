// S272 KABOOM-FLOOR-WANG-DIRT — fourth floor terrain family. Same
// shape as S176 grass / S271b path / S272a stone. Warm rust-brown
// palette so dirt reads as "freshly dug" vs path's "compacted
// earth" (path is more yellow / packed; dirt is redder / dustier).
//
// Variant 0 — plain dirt tile (uniform DIRT_PRIMARY).
// Variant 1 — corner-darkened (suggests scuffed edge).
// Variant 2 — centre highlight (suggests dust cloud / fleck).
// Variant 3 — stripe (suggests a drag mark).

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color
} from "three";

import { paintVertexColors } from "./hard-block-variants";

/** Warm rust-brown primary (docs/game-design/terrain-design.md §3 dirt). */
export const DIRT_PRIMARY = "#8a5a3a";
/** Darker shadow / scuff tint. */
export const DIRT_SHADOW = "#5a3820";
/** Brighter dust / fleck highlight. */
export const DIRT_HIGHLIGHT = "#b07a55";

export type DirtVariantIndex = 0 | 1 | 2 | 3;
export type DirtSubvariantIndex = 0 | 1 | 2;

const TILE_W = 1.0;
const TILE_H = 0.05;
const TILE_D = 1.0;

export function buildDirtVariant(
  index: DirtVariantIndex,
  bitmask?: number
): BufferGeometry {
  void bitmask;
  return buildDirtSubvariant(index, 0);
}

/** S285 — dirt sub-variant builder. 3 roughness/grain variations per role. */
export function buildDirtSubvariant(
  role: DirtVariantIndex,
  sub: DirtSubvariantIndex
): BufferGeometry {
  const g = new BoxGeometry(TILE_W, TILE_H, TILE_D, 4, 1, 4);
  paintVertexColors(g, DIRT_PRIMARY);
  // S288 per-biome shape: dirt tiles have irregular rough notches (loose soil).
  roughenTopEdge(g, role, sub);
  switch (role) {
    case 0: // edge — rough fringe
      if (sub === 0) paintBorder(g, DIRT_SHADOW, 0.35);
      else if (sub === 1) { paintBorder(g, DIRT_SHADOW, 0.38); paintCentre(g, DIRT_HIGHLIGHT, 0.18); }
      else paintRoughGrain(g, DIRT_SHADOW);
      break;
    case 1: // corner — irregular notch
      if (sub === 0) paintCorners(g, DIRT_SHADOW);
      else if (sub === 1) paintCorners(g, DIRT_HIGHLIGHT);
      else { paintCorners(g, DIRT_SHADOW); paintCentre(g, DIRT_HIGHLIGHT, 0.12); }
      break;
    case 2: // filler — grain variation
      if (sub === 0) paintCentre(g, DIRT_HIGHLIGHT, 0.1);
      else if (sub === 1) paintRoughGrain(g, DIRT_SHADOW);
      else paintBorder(g, DIRT_SHADOW, 0.3);
      break;
    case 3: // isolated
      if (sub === 0) { /* plain */ }
      else if (sub === 1) paintCorners(g, DIRT_SHADOW);
      else paintBorder(g, DIRT_SHADOW, 0.28);
      break;
  }
  return g;
}

/**
 * Irregular top-face roughening: deterministic per-vertex displacement based
 * on position + (role, sub) seed — creates a loose-soil irregular silhouette.
 */
function roughenTopEdge(geometry: BufferGeometry, role: number, sub: number): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const halfH = TILE_H / 2;
  const seed = role * 3 + sub;
  for (let i = 0; i < position.count; i++) {
    if (Math.abs(position.getY(i) - halfH) > 0.001) continue;
    const x = position.getX(i);
    const z = position.getZ(i);
    // Deterministic noise: hash vertex index + seed
    const h = Math.abs(Math.sin(i * 12.9898 + seed * 78.233 + x * 43.7 + z * 19.3)) % 1;
    position.setY(i, halfH - 0.007 * h);
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

function paintRoughGrain(geometry: BufferGeometry, hex: string): void {
  // Diagonal grain: x + z in a narrow band simulates a diagonal roughness streak.
  const position = geometry.getAttribute("position") as BufferAttribute;
  const color = geometry.getAttribute("color") as BufferAttribute | undefined;
  if (color === undefined) return;
  const c = new Color(hex);
  for (let i = 0; i < position.count; i += 1) {
    const diag = position.getX(i) + position.getZ(i);
    if (Math.abs(diag) < 0.15) color.setXYZ(i, c.r, c.g, c.b);
  }
  color.needsUpdate = true;
}

function buildVariant0Plain(): BufferGeometry {
  const g = new BoxGeometry(TILE_W, TILE_H, TILE_D, 1, 1, 1);
  paintVertexColors(g, DIRT_PRIMARY);
  return g;
}

function buildVariant1CornerTint(): BufferGeometry {
  const g = new BoxGeometry(TILE_W, TILE_H, TILE_D, 4, 1, 4);
  paintVertexColors(g, DIRT_PRIMARY);
  paintCorners(g, DIRT_SHADOW);
  return g;
}

function buildVariant2CentreHighlight(): BufferGeometry {
  const g = new BoxGeometry(TILE_W, TILE_H, TILE_D, 4, 1, 4);
  paintVertexColors(g, DIRT_PRIMARY);
  paintCentre(g, DIRT_HIGHLIGHT, 0.15);
  return g;
}

function buildVariant3Stripe(): BufferGeometry {
  const g = new BoxGeometry(TILE_W, TILE_H, TILE_D, 4, 1, 4);
  paintVertexColors(g, DIRT_PRIMARY);
  paintStripe(g, DIRT_SHADOW);
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
