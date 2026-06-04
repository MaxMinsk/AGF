// S176 KABOOM-FLOOR-WANG-TILES MVP — grass procedural variant builders.
// S284 KABOOM-GRASS-EDGE-REWRITE — adds 3 sub-variants per Wang role.
//
// Geometry: 1.0 × 0.05 × 1.0 slab. Sub-variant 0 is plain; sub-variants
// 1 + 2 carry distinct vertex-colour accents so adjacent same-role cells
// look different. All sub-variants also apply a subtle top-face edge
// chamfer (outer verts slightly lowered) to break the "flat square" read.
//
// Role / sub-variant matrix:
//   Role 0 — edge (single-open-face cell):
//     sub 0 — plain primary + shadow border strip
//     sub 1 — shadow border + highlight inner band
//     sub 2 — highlight inner band + darker fringe on one side
//   Role 1 — corner / T-junction:
//     sub 0 — primary + shadow corners
//     sub 1 — primary + highlight corners
//     sub 2 — primary + shadow corners + highlight centre
//   Role 2 — filler (surrounded):
//     sub 0 — uniform primary
//     sub 1 — primary + centre highlight
//     sub 2 — primary + grain stripe
//   Role 3 — isolated (no neighbours):
//     sub 0 — plain primary
//     sub 1 — primary + corner shadow
//     sub 2 — primary + border fringe
//
// Legacy entry point `buildGrassVariant(index, bitmask?)` is kept for
// callers that haven't migrated to the sub-variant path yet.

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
/** Darker fringe tint for sub-variant 2. */
export const GRASS_FRINGE = "#2e5228";

export type GrassVariantIndex = 0 | 1 | 2 | 3;
export type GrassSubvariantIndex = 0 | 1 | 2;

const TILE_W = 1.0;
const TILE_H = 0.05;
const TILE_D = 1.0;
const SUBDIVISIONS = 4;

// ---------------------------------------------------------------------------
// Public API — new sub-variant path (S284)
// ---------------------------------------------------------------------------

/**
 * Build a grass tile geometry for (role, subvariant).
 * Role corresponds to the Wang variant role (0=edge, 1=corner, 2=filler,
 * 3=isolated). Subvariant 0-2 provides visual distinctness for same-role
 * adjacent cells.
 */
export function buildGrassSubvariant(
  role: GrassVariantIndex,
  sub: GrassSubvariantIndex
): BufferGeometry {
  switch (role) {
    case 0: return buildEdgeSub(sub);
    case 1: return buildCornerSub(sub);
    case 2: return buildFillerSub(sub);
    case 3: return buildIsolatedSub(sub);
  }
}

// ---------------------------------------------------------------------------
// Legacy API — kept for backwards compatibility
// ---------------------------------------------------------------------------

export function buildGrassVariant(
  index: GrassVariantIndex,
  bitmask?: number
): BufferGeometry {
  void bitmask;
  return buildGrassSubvariant(index, 0);
}

// ---------------------------------------------------------------------------
// Role builders
// ---------------------------------------------------------------------------

function buildEdgeSub(sub: GrassSubvariantIndex): BufferGeometry {
  const g = makeBase();
  chamferTopEdge(g, 0.006);
  switch (sub) {
    case 0:
      paintBorder(g, GRASS_SHADOW, 0.35);
      break;
    case 1:
      paintBorder(g, GRASS_SHADOW, 0.35);
      paintInnerBand(g, GRASS_HIGHLIGHT, 0.3);
      break;
    case 2:
      paintInnerBand(g, GRASS_HIGHLIGHT, 0.25);
      paintFringe(g, GRASS_FRINGE, 0.4);
      break;
  }
  return g;
}

function buildCornerSub(sub: GrassSubvariantIndex): BufferGeometry {
  const g = makeBase();
  chamferTopEdge(g, 0.005);
  switch (sub) {
    case 0:
      paintCorners(g, GRASS_SHADOW);
      break;
    case 1:
      paintCorners(g, GRASS_HIGHLIGHT);
      break;
    case 2:
      paintCorners(g, GRASS_SHADOW);
      paintCentre(g, GRASS_HIGHLIGHT, 0.2);
      break;
  }
  return g;
}

function buildFillerSub(sub: GrassSubvariantIndex): BufferGeometry {
  const g = makeBase();
  chamferTopEdge(g, 0.004);
  switch (sub) {
    case 0:
      // Subtle centre — distinguishes filler from isolated in the legacy API.
      paintCentre(g, GRASS_HIGHLIGHT, 0.1);
      break;
    case 1:
      paintCentre(g, GRASS_HIGHLIGHT, 0.18);
      break;
    case 2:
      paintStripe(g, GRASS_SHADOW, 0.12);
      break;
  }
  return g;
}

function buildIsolatedSub(sub: GrassSubvariantIndex): BufferGeometry {
  const g = makeBase();
  chamferTopEdge(g, 0.007);
  switch (sub) {
    case 0:
      // Plain.
      break;
    case 1:
      paintCorners(g, GRASS_SHADOW);
      break;
    case 2:
      paintBorder(g, GRASS_FRINGE, 0.3);
      break;
  }
  return g;
}

// ---------------------------------------------------------------------------
// Geometry factory
// ---------------------------------------------------------------------------

function makeBase(): BufferGeometry {
  const g = new BoxGeometry(TILE_W, TILE_H, TILE_D, SUBDIVISIONS, 1, SUBDIVISIONS);
  paintVertexColors(g, GRASS_PRIMARY);
  return g;
}

// ---------------------------------------------------------------------------
// Geometry manipulation helpers
// ---------------------------------------------------------------------------

/**
 * Lower top-face vertices near the tile boundary by `depth` to simulate
 * a subtle chamfer / organic edge. Only touches vertices on the Y=+h/2
 * face whose |x| or |z| is in the outer edge band.
 */
function chamferTopEdge(geometry: BufferGeometry, depth: number): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const halfH = TILE_H / 2;
  const edgeBand = 0.28; // outer band threshold
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    if (Math.abs(y - halfH) > 0.001) continue; // only top face
    const x = Math.abs(position.getX(i));
    const z = Math.abs(position.getZ(i));
    if (x > edgeBand || z > edgeBand) {
      position.setY(i, halfH - depth);
    }
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

// ---------------------------------------------------------------------------
// Vertex-colour helpers
// ---------------------------------------------------------------------------

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

function paintBorder(geometry: BufferGeometry, hex: string, threshold: number): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const color = geometry.getAttribute("color") as BufferAttribute | undefined;
  if (color === undefined) return;
  const c = new Color(hex);
  for (let i = 0; i < position.count; i++) {
    const x = Math.abs(position.getX(i));
    const z = Math.abs(position.getZ(i));
    if (x > threshold || z > threshold) {
      color.setXYZ(i, c.r, c.g, c.b);
    }
  }
  color.needsUpdate = true;
}

function paintInnerBand(geometry: BufferGeometry, hex: string, threshold: number): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const color = geometry.getAttribute("color") as BufferAttribute | undefined;
  if (color === undefined) return;
  const c = new Color(hex);
  for (let i = 0; i < position.count; i++) {
    const x = Math.abs(position.getX(i));
    const z = Math.abs(position.getZ(i));
    if (x < threshold && z < threshold) {
      color.setXYZ(i, c.r, c.g, c.b);
    }
  }
  color.needsUpdate = true;
}

function paintFringe(geometry: BufferGeometry, hex: string, threshold: number): void {
  // Paint one axis fringe (z > threshold) to give asymmetric character.
  const position = geometry.getAttribute("position") as BufferAttribute;
  const color = geometry.getAttribute("color") as BufferAttribute | undefined;
  if (color === undefined) return;
  const c = new Color(hex);
  for (let i = 0; i < position.count; i++) {
    if (position.getZ(i) > threshold) {
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
    if (Math.abs(position.getX(i)) < halfWidth) {
      color.setXYZ(i, c.r, c.g, c.b);
    }
  }
  color.needsUpdate = true;
}
