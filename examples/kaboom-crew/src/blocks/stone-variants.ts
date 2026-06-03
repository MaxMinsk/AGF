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

const TILE_W = 1.0;
const TILE_H = 0.05;
const TILE_D = 1.0;

export function buildStoneVariant(
  index: StoneVariantIndex,
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
  paintCentre(g, STONE_HIGHLIGHT);
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
