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

/** S172 — palette parameter for theme-aware tinting. All fields optional. */
export type SoftBlockPalette = {
  primary?: string;
  shadow?: string;
  seam?: string;
};

function darkerHex(hex: string, multiplier: number): string {
  const c = new Color(hex).multiplyScalar(multiplier);
  return "#" + c.getHexString();
}

function resolveSoftPalette(p?: SoftBlockPalette): Required<SoftBlockPalette> {
  const primary = p?.primary ?? SOFT_BLOCK_PRIMARY;
  return {
    primary,
    shadow: p?.shadow ?? (p?.primary !== undefined ? darkerHex(primary, 0.5) : SOFT_BLOCK_SHADOW),
    seam: p?.seam ?? (p?.primary !== undefined ? darkerHex(primary, 0.45) : SOFT_BLOCK_SEAM)
  };
}

export type SoftBlockVariantIndex = 0 | 1 | 2 | 3;

export function buildSoftBlockVariant(
  index: SoftBlockVariantIndex,
  palette?: SoftBlockPalette,
  bitmask?: number
): BufferGeometry {
  void bitmask; // reserved for Wang autotile
  const p = resolveSoftPalette(palette);
  switch (index) {
    case 0: return buildVariant0Crate(p);
    case 1: return buildVariant1Pallet(p);
    case 2: return buildVariant2BarrelCorner(p);
    case 3: return buildVariant3Drum(p);
  }
}

function buildVariant0Crate(p: Required<SoftBlockPalette>): BufferGeometry {
  const g = new BoxGeometry(1, 1, 1, 2, 2, 2);
  paintVertexColors(g, p.primary);
  paintBottomShadow(g, p.shadow, 1);
  paintCrateXCross(g, p.seam);
  return g;
}

function buildVariant1Pallet(p: Required<SoftBlockPalette>): BufferGeometry {
  const g = new BoxGeometry(1, 1, 1, 1, 4, 1);
  paintVertexColors(g, p.primary);
  paintBottomShadow(g, p.shadow, 1);
  paintHorizontalStrips(g, p.seam);
  return g;
}

function buildVariant2BarrelCorner(p: Required<SoftBlockPalette>): BufferGeometry {
  const base = new BoxGeometry(1, 1, 1, 1, 2, 1);
  paintVertexColors(base, p.primary);
  paintBottomShadow(base, p.shadow, 1);
  const bumpTint = new Color(p.primary).multiplyScalar(0.85);
  const bumpHex = "#" + bumpTint.getHexString();
  const bump = new CylinderGeometry(0.18, 0.22, 0.1, 12);
  bump.translate(0.25, 0.55, 0.25);
  paintVertexColors(bump, bumpHex);
  const merged = mergeGeometries([base, bump], false);
  if (merged === null) return base;
  bump.dispose();
  return merged;
}

function buildVariant3Drum(p: Required<SoftBlockPalette>): BufferGeometry {
  const body = new CylinderGeometry(0.45, 0.45, 1, 18, 3);
  paintVertexColors(body, p.primary);
  paintBottomShadow(body, p.shadow, 1);
  const capTint = new Color(p.primary).multiplyScalar(0.9);
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
