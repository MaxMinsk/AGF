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
  Color
} from "three";

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
  // S170 hotfix (2026-05-28): merge of BoxGeometry + CylinderGeometry
  // produced an indexed BufferGeometry that the WebGPU renderer
  // rejected via 'setIndexBuffer parameter 1 is not of type GPUBuffer'
  // — the merge result's index buffer had an inconsistent attribute
  // layout across the parts. Reverted to a pure BoxGeometry variant
  // with subdivisions + corner tint so it still reads as distinct
  // from the other variants. The cylindrical bump is sacrificed.
  const g = new BoxGeometry(1, 1, 1, 2, 2, 2);
  paintVertexColors(g, SOFT_BLOCK_PRIMARY);
  paintBottomShadow(g, SOFT_BLOCK_SHADOW, 1);
  paintCornerTint(g, "#" + new Color(SOFT_BLOCK_PRIMARY).multiplyScalar(0.85).getHexString());
  return g;
}

function buildVariant3Drum(): BufferGeometry {
  // S170 hotfix (2026-05-28): same WebGPU merge issue as variant 2.
  // Reverted to pure BoxGeometry with all-around top-edge bevel tint
  // to give a distinct silhouette read without merging geometries.
  const g = new BoxGeometry(1, 1, 1, 1, 3, 1);
  paintVertexColors(g, SOFT_BLOCK_PRIMARY);
  paintBottomShadow(g, SOFT_BLOCK_SHADOW, 1);
  paintTopBandTint(g, "#" + new Color(SOFT_BLOCK_PRIMARY).multiplyScalar(0.9).getHexString());
  return g;
}

/** S170 hotfix — tint the 4 corner top-vertices toward `hex`. */
function paintCornerTint(g: BufferGeometry, hex: string): void {
  const color = g.getAttribute("color") as BufferAttribute | undefined;
  const pos = g.getAttribute("position") as BufferAttribute | undefined;
  if (color === undefined || pos === undefined) return;
  const c = new Color(hex);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (y > 0.4 && Math.abs(x) > 0.2 && Math.abs(z) > 0.2) {
      color.setXYZ(i, c.r, c.g, c.b);
    }
  }
  color.needsUpdate = true;
}

/** S170 hotfix — tint the top-band vertices toward `hex`. */
function paintTopBandTint(g: BufferGeometry, hex: string): void {
  const color = g.getAttribute("color") as BufferAttribute | undefined;
  const pos = g.getAttribute("position") as BufferAttribute | undefined;
  if (color === undefined || pos === undefined) return;
  const c = new Color(hex);
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    if (y > 0.3) {
      color.setXYZ(i, c.r, c.g, c.b);
    }
  }
  color.needsUpdate = true;
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
