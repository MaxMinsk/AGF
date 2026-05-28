// S176 KABOOM-FLOOR-WANG-TILES MVP (GDP-2026-05-28-012) — grass
// procedural variant builders. Each returns a thin 1.0 × 0.05 × 1.0
// BufferGeometry so the per-cell overlay entity sits flush above the
// scene's single stretched-box floor backdrop. Variants differ only in
// vertex-colour pattern — no extra geometry merging, no UVs, no
// textures. Same approach as floor-tile-variants from S165.
//
// Variant 0 — plain green tile (uniform GRASS_PRIMARY).
// Variant 1 — green with darker corner-tint (suggests blade edge).
// Variant 2 — green with mid-cell highlight (suggests centre tuft).
// Variant 3 — green with stripe (suggests path-edge-ish).
//
// `bitmask` is RESERVED for future Wang sub-variant selection. v1
// ignores it — the 16-bitmask → 4-variant collapse happens in the
// kaboom-side wang-family-lookup, not here.

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color
} from "three";

import { paintVertexColors } from "./hard-block-variants";

/** Mid green primary tone (matches docs/game-design/terrain-design.md §3 grass). */
export const GRASS_PRIMARY = "#4a8a3e";
/** Darker shadow / blade-edge tint. */
export const GRASS_SHADOW = "#3a6a30";
/** Brighter highlight tint for the centre tuft. */
export const GRASS_HIGHLIGHT = "#5fa84a";

export type GrassVariantIndex = 0 | 1 | 2 | 3;

const TILE_W = 1.0;
const TILE_H = 0.05;
const TILE_D = 1.0;

/**
 * Build the geometry for grass variant `index`. All four variants share
 * the 1×0.05×1 outer dimensions so the overlay sits flush above the
 * scene's stretched-box floor. Bitmask is reserved for future sub-
 * variant work and ignored in v1.
 */
export function buildGrassVariant(
  index: GrassVariantIndex,
  bitmask?: number
): BufferGeometry {
  void bitmask; // reserved for future sub-variant lookup
  switch (index) {
    case 0: return buildVariant0Plain();
    case 1: return buildVariant1CornerTint();
    case 2: return buildVariant2CentreHighlight();
    case 3: return buildVariant3Stripe();
  }
}

// ---- variants ----

function buildVariant0Plain(): BufferGeometry {
  // 1×1×1 subdivisions — uniform colour doesn't need extra verts.
  const g = new BoxGeometry(TILE_W, TILE_H, TILE_D, 1, 1, 1);
  paintVertexColors(g, GRASS_PRIMARY);
  return g;
}

function buildVariant1CornerTint(): BufferGeometry {
  // 4×1×4 subdivisions so the four corner verts on the top face are
  // addressable separately from the inner verts.
  const g = new BoxGeometry(TILE_W, TILE_H, TILE_D, 4, 1, 4);
  paintVertexColors(g, GRASS_PRIMARY);
  paintCorners(g, GRASS_SHADOW);
  return g;
}

function buildVariant2CentreHighlight(): BufferGeometry {
  // 4×1×4 subdivisions gives a centre vertex (0, ±h/2, 0) to highlight.
  const g = new BoxGeometry(TILE_W, TILE_H, TILE_D, 4, 1, 4);
  paintVertexColors(g, GRASS_PRIMARY);
  paintCentre(g, GRASS_HIGHLIGHT);
  return g;
}

function buildVariant3Stripe(): BufferGeometry {
  // 4×1×4 subdivisions so a +Z-direction stripe band is paintable.
  const g = new BoxGeometry(TILE_W, TILE_H, TILE_D, 4, 1, 4);
  paintVertexColors(g, GRASS_PRIMARY);
  paintStripe(g, GRASS_SHADOW);
  return g;
}

// ---- vertex-paint helpers (file-local) ----

/** Darken vertices near the 4 corners of the top face. */
function paintCorners(geometry: BufferGeometry, hex: string): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const color = geometry.getAttribute("color") as BufferAttribute | undefined;
  if (color === undefined) return;
  const c = new Color(hex);
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    // Both |x| and |z| near the outer edge → corner region.
    if (Math.abs(x) > 0.4 && Math.abs(z) > 0.4) {
      color.setXYZ(i, c.r, c.g, c.b);
    }
  }
  color.needsUpdate = true;
}

/** Highlight vertices near the cell centre. */
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

/** Darken a stripe along the x ≈ 0 column (a narrow vertical band on the tile). */
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
