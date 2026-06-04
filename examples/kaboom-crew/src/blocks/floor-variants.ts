// S286 KABOOM-FLOOR-WANG-FIFTH — fifth terrain family: neutral grey
// "floor" for interior / dungeon biomes. 3 sub-variants per Wang index
// via the S283 sub-variant system.
//
// Variant roles (shared 16→4 lookup table):
//   0 — edge  | 1 — corner  | 2 — filler  | 3 — isolated
//
// Sub-variants per role:
//   sub 0 — plain cool grey (#888c94)
//   sub 1 — grey with lighter inner highlight (#a0a4ad)
//   sub 2 — grey with darker border fringe (#5a5d66)

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color
} from "three";

import { paintVertexColors } from "./hard-block-variants";

/** Cool neutral grey — docs/game-design/terrain-design.md §3 floor. */
export const FLOOR_PRIMARY = "#888c94";
/** Lighter highlight tint. */
export const FLOOR_HIGHLIGHT = "#a0a4ad";
/** Darker shadow / fringe tint. */
export const FLOOR_SHADOW = "#5a5d66";

export type FloorVariantIndex = 0 | 1 | 2 | 3;
export type FloorSubvariantIndex = 0 | 1 | 2;

const TILE_W = 1.0;
const TILE_H = 0.05;
const TILE_D = 1.0;

/** S286 — floor sub-variant builder. 3 neutral-grey variations per role. */
export function buildFloorSubvariant(
  role: FloorVariantIndex,
  sub: FloorSubvariantIndex
): BufferGeometry {
  const g = new BoxGeometry(TILE_W, TILE_H, TILE_D, 4, 1, 4);
  paintVertexColors(g, FLOOR_PRIMARY);
  switch (role) {
    case 0: // edge
      if (sub === 0) paintBorder(g, FLOOR_SHADOW, 0.35);
      else if (sub === 1) { paintBorder(g, FLOOR_SHADOW, 0.4); paintCentre(g, FLOOR_HIGHLIGHT, 0.2); }
      else paintBorder(g, FLOOR_SHADOW, 0.3);
      break;
    case 1: // corner
      if (sub === 0) paintCorners(g, FLOOR_SHADOW);
      else if (sub === 1) paintCorners(g, FLOOR_HIGHLIGHT);
      else { paintCorners(g, FLOOR_SHADOW); paintCentre(g, FLOOR_HIGHLIGHT, 0.15); }
      break;
    case 2: // filler
      if (sub === 0) paintCentre(g, FLOOR_HIGHLIGHT, 0.1);
      else if (sub === 1) paintStripe(g, FLOOR_SHADOW, 0.1);
      else paintBorder(g, FLOOR_SHADOW, 0.32);
      break;
    case 3: // isolated
      if (sub === 0) { /* plain */ }
      else if (sub === 1) paintCorners(g, FLOOR_SHADOW);
      else paintBorder(g, FLOOR_SHADOW, 0.28);
      break;
  }
  return g;
}

// ---------------------------------------------------------------------------
// Vertex-colour helpers
// ---------------------------------------------------------------------------

function paintBorder(geometry: BufferGeometry, hex: string, threshold: number): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const color = geometry.getAttribute("color") as BufferAttribute | undefined;
  if (color === undefined) return;
  const c = new Color(hex);
  for (let i = 0; i < position.count; i++) {
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
  for (let i = 0; i < position.count; i++) {
    if (Math.abs(position.getX(i)) < radius && Math.abs(position.getZ(i)) < radius) {
      color.setXYZ(i, c.r, c.g, c.b);
    }
  }
  color.needsUpdate = true;
}

function paintCorners(geometry: BufferGeometry, hex: string): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const color = geometry.getAttribute("color") as BufferAttribute | undefined;
  if (color === undefined) return;
  const c = new Color(hex);
  for (let i = 0; i < position.count; i++) {
    if (Math.abs(position.getX(i)) > 0.38 && Math.abs(position.getZ(i)) > 0.38) {
      color.setXYZ(i, c.r, c.g, c.b);
    }
  }
  color.needsUpdate = true;
}

function paintStripe(geometry: BufferGeometry, hex: string, halfWidth: number): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const color = geometry.getAttribute("color") as BufferAttribute | undefined;
  if (color === undefined) return;
  const c = new Color(hex);
  for (let i = 0; i < position.count; i++) {
    if (Math.abs(position.getX(i)) < halfWidth) color.setXYZ(i, c.r, c.g, c.b);
  }
  color.needsUpdate = true;
}
