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

const TILE_W = 1.0;
const TILE_H = 0.05;
const TILE_D = 1.0;

export function buildDirtVariant(
  index: DirtVariantIndex,
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
  paintCentre(g, DIRT_HIGHLIGHT);
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
