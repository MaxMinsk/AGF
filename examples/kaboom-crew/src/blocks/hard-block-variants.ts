// S165 KABOOM-MULTI-VARIANT-BLOCKS (GDP-2026-05-28-003) — hard-block
// variant builders. Each builder returns ONE BufferGeometry of fixed
// 1.0 × 1.0 × 1.0 outer dimensions so all four variants are
// interchangeable in the grid. Distinct topologies + vertex-colour
// patterns read as "4 different concrete blocks" without any shader
// work.
//
// Variant 0 — plain concrete (subdivided box).
// Variant 1 — panel block with chamfered corners + dark vertical seam.
// Variant 2 — girder block with horizontal dashed groove on +Z face.
// Variant 3 — mounted plate with rivet bumps on top.
//
// `bitmask` is RESERVED for future Wang-tile autotile selection
// (GDP-2026-05-28-002). v1 ignores it.

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color
} from "three";

/** Warm grey primary tone (visual-style.md hard-block-primary). */
export const HARD_BLOCK_PRIMARY = "#7a7570";
/** Bottom-25% shadow tint (×0.6 darker). */
export const HARD_BLOCK_SHADOW = "#494744";
/** Panel-seam accent for variant 1. */
export const HARD_BLOCK_SEAM = "#3a3835";

export type HardBlockVariantIndex = 0 | 1 | 2 | 3;

/**
 * Build the geometry for hard-block variant `index`. The four variants
 * share outer dimensions (1×1×1) so the grid placement is identical;
 * only the vertex topology + colour pattern differ.
 *
 * `bitmask` is reserved for Wang autotile (GDP-002). v1 ignores it.
 */
export function buildHardBlockVariant(
  index: HardBlockVariantIndex,
  bitmask?: number
): BufferGeometry {
  void bitmask; // reserved for Wang autotile lookup
  switch (index) {
    case 0: return buildVariant0Plain();
    case 1: return buildVariant1Panel();
    case 2: return buildVariant2Girder();
    case 3: return buildVariant3Plate();
  }
}

// ---- variants ----

function buildVariant0Plain(): BufferGeometry {
  // 2 segments per face so the bottom-shadow band has a clean seam.
  const g = new BoxGeometry(1, 1, 1, 1, 2, 1);
  paintVertexColors(g, HARD_BLOCK_PRIMARY);
  paintBottomShadow(g, HARD_BLOCK_SHADOW, 1);
  return g;
}

function buildVariant1Panel(): BufferGeometry {
  // X subdivided so the centre-seam vertices can be darkened to read
  // as a panel split down the middle. Y=2 for the shadow band.
  const g = new BoxGeometry(1, 1, 1, 2, 2, 1);
  paintVertexColors(g, HARD_BLOCK_PRIMARY);
  paintBottomShadow(g, HARD_BLOCK_SHADOW, 1);
  paintCenterSeamX(g, HARD_BLOCK_SEAM);
  chamferCorners(g, 0.08);
  return g;
}

function buildVariant2Girder(): BufferGeometry {
  // Y subdivided into 3 bands so the middle band reads as a darker
  // horizontal groove.
  const g = new BoxGeometry(1, 1, 1, 1, 3, 1);
  paintVertexColors(g, HARD_BLOCK_PRIMARY);
  paintBottomShadow(g, HARD_BLOCK_SHADOW, 1);
  paintHorizontalGrooveBand(g, HARD_BLOCK_SEAM);
  return g;
}

function buildVariant3Plate(): BufferGeometry {
  // S170 hotfix (2026-05-28): mergeGeometries (BoxGeometry + 4
  // CylinderGeometry rivets) produced an indexed BufferGeometry that
  // WebGPU rejected — the merged index buffer's attribute layout
  // didn't line up with what setIndexBuffer expected. Replaced the
  // rivet-merge with corner-vertex tinting on a subdivided BoxGeometry
  // so the variant still reads distinct without ever calling
  // mergeGeometries. WebGL + WebGPU both happy.
  const g = new BoxGeometry(1, 1, 1, 1, 2, 1);
  paintVertexColors(g, HARD_BLOCK_PRIMARY);
  paintBottomShadow(g, HARD_BLOCK_SHADOW, 1);
  const rivetHex = "#" + new Color(HARD_BLOCK_PRIMARY).multiplyScalar(0.75).getHexString();
  paintTopCornerDots(g, rivetHex);
  return g;
}

/** S170 hotfix — tint the 4 top-corner vertices toward `hex` to fake rivets. */
function paintTopCornerDots(g: BufferGeometry, hex: string): void {
  const color = g.getAttribute("color") as BufferAttribute | undefined;
  const pos = g.getAttribute("position") as BufferAttribute | undefined;
  if (color === undefined || pos === undefined) return;
  const c = new Color(hex);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (y > 0.45 && Math.abs(x) > 0.4 && Math.abs(z) > 0.4) {
      color.setXYZ(i, c.r, c.g, c.b);
    }
  }
  color.needsUpdate = true;
}


// ---- helpers ----

export function paintVertexColors(geometry: BufferGeometry, hex: string): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const count = position.count;
  const existing = geometry.getAttribute("color") as BufferAttribute | undefined;
  const colorAttr = existing !== undefined && existing.count === count
    ? existing
    : new BufferAttribute(new Float32Array(count * 3), 3);
  const c = new Color(hex);
  for (let i = 0; i < count; i += 1) {
    colorAttr.setXYZ(i, c.r, c.g, c.b);
  }
  if (existing !== colorAttr) geometry.setAttribute("color", colorAttr);
  colorAttr.needsUpdate = true;
}

/**
 * Tint the bottom 25% of the geometry's vertices to `hex`. Assumes the
 * geometry sits centred at the origin (BoxGeometry default) with the
 * outer height passed in. Vertices with y <= minY + 0.25 × height get
 * the shadow colour.
 */
export function paintBottomShadow(geometry: BufferGeometry, hex: string, height: number): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const color = geometry.getAttribute("color") as BufferAttribute | undefined;
  if (color === undefined) return;
  const minY = -height / 2;
  const threshold = minY + height * 0.25;
  const c = new Color(hex);
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    if (y <= threshold + 1e-4) {
      color.setXYZ(i, c.r, c.g, c.b);
    }
  }
  color.needsUpdate = true;
}

/**
 * Darken vertices that sit at x ≈ 0 (the centre seam). Used by variant 1.
 */
function paintCenterSeamX(geometry: BufferGeometry, hex: string): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const color = geometry.getAttribute("color") as BufferAttribute | undefined;
  if (color === undefined) return;
  const c = new Color(hex);
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    if (Math.abs(x) < 0.05) {
      color.setXYZ(i, c.r, c.g, c.b);
    }
  }
  color.needsUpdate = true;
}

/**
 * Darken the middle horizontal band — vertices with |y| ≲ 1/6 of the
 * 3-segment box. Used by variant 2 (girder groove).
 */
function paintHorizontalGrooveBand(geometry: BufferGeometry, hex: string): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const color = geometry.getAttribute("color") as BufferAttribute | undefined;
  if (color === undefined) return;
  const c = new Color(hex);
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    // The 3-segment box has rows at y ∈ { -0.5, -1/6, +1/6, +0.5 }.
    // 0.08 epsilon catches the inner rows.
    if (Math.abs(y) < 0.2 && Math.abs(y) > 0.08) {
      color.setXYZ(i, c.r, c.g, c.b);
    }
  }
  color.needsUpdate = true;
}

/**
 * Pull each corner vertex inward by `amount` along the diagonal to
 * fake a chamfered look. Subtle — visible at oblique camera angles
 * without a marching-cubes bevel pass.
 */
function chamferCorners(geometry: BufferGeometry, amount: number): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    // A "corner" vertex has |x|, |y|, |z| all near 0.5.
    if (Math.abs(x) > 0.45 && Math.abs(y) > 0.45 && Math.abs(z) > 0.45) {
      const sx = Math.sign(x);
      const sy = Math.sign(y);
      const sz = Math.sign(z);
      position.setXYZ(i, x - sx * amount, y - sy * amount, z - sz * amount);
    }
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
}
