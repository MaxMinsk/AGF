// S165 KABOOM-MULTI-VARIANT-BLOCKS (GDP-2026-05-28-003) — soft-block
// variant builders. Each returns a 1.0 × 1.0 × 1.0 BufferGeometry so
// the grid placement is interchangeable across all four variants.
//
// Variant 0 — wooden crate (box + X-cross dark seams on front face).
// Variant 1 — stacked pallet (box + horizontal strip seams).
// Variant 2 — barrel-corner (box + cylindrical bump on top).
// Variant 3 — drum (cylinder + flat top cap disc).
//
// `bitmask` is RESERVED for future Wang autotile selection. v1 ignores.

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { paintBottomShadow, paintVertexColors } from "./hard-block-variants";

/** Warm tan primary tone (visual-style.md soft-block-primary). */
export const SOFT_BLOCK_PRIMARY = "#a08055";
/** Bottom shadow tint. */
export const SOFT_BLOCK_SHADOW = "#5e4a2f";
/** Plank seam accent. */
export const SOFT_BLOCK_SEAM = "#54402a";

export type SoftBlockVariantIndex = 0 | 1 | 2 | 3;

export function buildSoftBlockVariant(
  index: SoftBlockVariantIndex,
  bitmask?: number
): BufferGeometry {
  void bitmask; // reserved for Wang autotile
  switch (index) {
    case 0: return buildVariant0Crate();
    case 1: return buildVariant1Pallet();
    case 2: return buildVariant2BarrelCorner();
    case 3: return buildVariant3Drum();
  }
}

function buildVariant0Crate(): BufferGeometry {
  // 2 subdivisions per axis so the diagonal X-cross seam has nearby
  // vertices to darken. The cross is faked by tinting the centre +
  // corner vertices on the +Z face.
  const g = new BoxGeometry(1, 1, 1, 2, 2, 2);
  paintVertexColors(g, SOFT_BLOCK_PRIMARY);
  paintBottomShadow(g, SOFT_BLOCK_SHADOW, 1);
  paintCrateXCross(g, SOFT_BLOCK_SEAM);
  return g;
}

function buildVariant1Pallet(): BufferGeometry {
  // 4 horizontal Y-bands so alternating rows can be darkened to read
  // as stacked planks.
  const g = new BoxGeometry(1, 1, 1, 1, 4, 1);
  paintVertexColors(g, SOFT_BLOCK_PRIMARY);
  paintBottomShadow(g, SOFT_BLOCK_SHADOW, 1);
  paintHorizontalStrips(g, SOFT_BLOCK_SEAM);
  return g;
}

function buildVariant2BarrelCorner(): BufferGeometry {
  // Base box + a low cylindrical "bump" on top corner. The bump
  // surface stays inside the 1×1×1 envelope so the variant remains
  // grid-interchangeable.
  const base = new BoxGeometry(1, 1, 1, 1, 2, 1);
  paintVertexColors(base, SOFT_BLOCK_PRIMARY);
  paintBottomShadow(base, SOFT_BLOCK_SHADOW, 1);
  const bumpTint = new Color(SOFT_BLOCK_PRIMARY).multiplyScalar(0.85);
  const bumpHex = "#" + bumpTint.getHexString();
  const bump = new CylinderGeometry(0.18, 0.22, 0.1, 12);
  bump.translate(0.25, 0.55, 0.25);
  paintVertexColors(bump, bumpHex);
  const merged = mergeGeometries([base, bump], false);
  if (merged === null) return base;
  bump.dispose();
  return merged;
}

function buildVariant3Drum(): BufferGeometry {
  // Drum-shaped (radial) variant. Outer envelope still fits in a 1×1×1
  // cell — cylinder radius 0.5 makes the silhouette read as round even
  // though the collider stays box-shaped (see soft-block.prefab.json).
  // Height segments = 3 so the bottom-shadow band has a clean seam.
  const body = new CylinderGeometry(0.45, 0.45, 1, 18, 3);
  paintVertexColors(body, SOFT_BLOCK_PRIMARY);
  paintBottomShadow(body, SOFT_BLOCK_SHADOW, 1);
  // Top cap disc — slightly raised flat ring on top.
  const capTint = new Color(SOFT_BLOCK_PRIMARY).multiplyScalar(0.9);
  const capHex = "#" + capTint.getHexString();
  const cap = new CylinderGeometry(0.45, 0.45, 0.04, 18);
  cap.translate(0, 0.52, 0);
  paintVertexColors(cap, capHex);
  const merged = mergeGeometries([body, cap], false);
  if (merged === null) return body;
  cap.dispose();
  return merged;
}

// ---- vertex-paint helpers (file-local) ----

/**
 * Variant 0 — paint an X-shaped seam on the +Z face. Vertices that
 * sit on the +Z face (z near +0.5) AND lie on either diagonal get
 * darkened. The 2x2x2 subdivision gives us a centre vertex + the 4
 * face-corner vertices to work with.
 */
function paintCrateXCross(geometry: BufferGeometry, hex: string): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const color = geometry.getAttribute("color") as BufferAttribute | undefined;
  if (color === undefined) return;
  const c = new Color(hex);
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    if (Math.abs(z - 0.5) < 0.05) {
      // On the +Z face. Diagonal: x ≈ y or x ≈ -y. The 2-segment box
      // gives us vertex columns/rows at -0.5, 0, +0.5 — so a diagonal
      // hits |x|=|y| at the 4 corners + (0,0) centre.
      if (Math.abs(Math.abs(x) - Math.abs(y)) < 0.05) {
        color.setXYZ(i, c.r, c.g, c.b);
      }
    }
  }
  color.needsUpdate = true;
}

/**
 * Variant 1 — alternating horizontal strips. The 4-segment box has
 * rows at y ∈ {-0.5, -0.25, 0, 0.25, 0.5}. Darken the odd rows
 * (-0.25, 0.25) to read as plank seams.
 */
function paintHorizontalStrips(geometry: BufferGeometry, hex: string): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const color = geometry.getAttribute("color") as BufferAttribute | undefined;
  if (color === undefined) return;
  const c = new Color(hex);
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    // Match y ≈ ±0.25 (seam rows). Epsilon 0.05 keeps it tight.
    if (Math.abs(Math.abs(y) - 0.25) < 0.05) {
      color.setXYZ(i, c.r, c.g, c.b);
    }
  }
  color.needsUpdate = true;
}
