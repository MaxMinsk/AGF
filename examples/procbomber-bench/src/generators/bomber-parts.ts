// S102 PROCBOMBER-PART-BUILDERS — per-part procedural mesh generators.
//
// Each builder returns ONE BufferGeometry sized by its slice of the
// bomber recipe and tinted from the corresponding palette channel. The
// mesh-tree spawner (PROCBOMBER-MESH-TREE-V0) assembles them into the
// 9-pivot + 10-mesh ECS hierarchy; the single-mesh `generateBomberMesh`
// path stays for tests + the v0 bench code path.
//
// Each part-builder writes its mesh in its OWN-LOCAL space — the
// spawner places the entity at the pivot point and the geometry sits
// centered there. So:
//   - torso: y range = [-torsoHeight/2 .. +torsoHeight/2]
//   - head:  y range = [-headSize/2 .. +headSize/2] (centered above neck)
//   - upperArm: y range = [-armLength .. 0] (hangs DOWN from the shoulder pivot)
//   - forearm:  y range = [-armLength .. 0] (hangs DOWN from the elbow pivot)
//   - upperLeg: y range = [-legLength .. 0]
//   - lowerLeg: y range = [-legLength .. 0]
//
// Hanging the arm + leg geometry below their pivot means a positive-X
// shoulder rotation lifts the arm forward like a real shoulder joint.

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  Matrix4
} from "three";

import type { BomberPalette } from "./bomber-palette";

export type BomberPartShape = "box" | "cylinder" | "capsule";

export type BomberPartShapes = {
  head: BomberPartShape;
  torso: BomberPartShape;
  limb: BomberPartShape;
};

export const DEFAULT_BOMBER_PART_SHAPES: BomberPartShapes = {
  head: "box",
  torso: "box",
  limb: "box"
};

/**
 * S109 KABOOM-PROCEDURAL-TEXTURING. Per-bomber procedural texturing
 * layer that sits on top of the 8-channel palette + 10-mesh tree.
 * Layer 1 is `panelSeams`: extreme-Y vertices (the 8 box corners or
 * the top+bottom rings of a cylinder/capsule) are darkened to a fixed
 * fraction of the base channel colour, reading as soft edge highlights.
 * Layers 2 (decals) and 3 (patterns) ship later.
 */
export type BomberTexturing = {
  /** Default true — corner / top-and-bottom edge vertices darkened by PANEL_SEAM_FACTOR. */
  panelSeams: boolean;
};

export const DEFAULT_BOMBER_TEXTURING: BomberTexturing = {
  panelSeams: true
};

/** Darken factor applied to extreme-Y vertices when panelSeams is on. */
export const PANEL_SEAM_FACTOR = 0.85;

function buildBoxLike(
  width: number,
  height: number,
  depth: number,
  shape: BomberPartShape
): BufferGeometry {
  switch (shape) {
    case "box":
      // S109 KABOOM-PROCEDURAL-TEXTURING — heightSegments=2 splits each
      // box-side face into 2 vertical bands. The middle band's vertices
      // stay bright while the top + bottom edges get the panelSeams
      // darken pass — without subdivision every vertex of a box sits at
      // the extreme Y and the seam darkening reduces to "darken
      // everything", which is visually indistinguishable from picking a
      // slightly darker palette channel. ~12 extra verts per box × 10
      // boxes per bomber × 4 bombers per arena ≈ 480 extra verts — negligible.
      return new BoxGeometry(width, height, depth, 1, 2, 1);
    case "cylinder": {
      const radius = Math.min(width, depth) / 2;
      return new CylinderGeometry(radius, radius, height, 16);
    }
    case "capsule": {
      const radius = Math.min(width, depth) / 2;
      const cylLength = Math.max(0.0001, height - 2 * radius);
      return new CapsuleGeometry(radius, cylLength, 4, 12);
    }
  }
}

export type BomberPartSizes = {
  headSize: number;
  torsoHeight: number;
  torsoWidth: number;
  // S103 PROCBOMBER-LIMB-SEGMENT-SLIDERS: each limb is two segments
  // with independent length knobs.
  upperArmLength: number;
  forearmLength: number;
  armWidth: number;
  upperLegLength: number;
  lowerLegLength: number;
  legWidth: number;
};

export type BomberPartName =
  | "torso"
  | "head"
  | "upperArm"
  | "forearm"
  | "upperLeg"
  | "lowerLeg";

/** Procedural-mesh-registry key for a given body part. */
export function partKey(name: BomberPartName): string {
  return `procbomber-${name}`;
}

/** Color channel a part reads from the 8-channel palette. */
export function partColor(palette: BomberPalette, name: BomberPartName): string {
  switch (name) {
    case "torso":     return palette.torsoTop;
    case "head":      return palette.head;
    case "upperArm":  return palette.upperArm;
    case "forearm":   return palette.forearm;
    case "upperLeg":  return palette.upperLeg;
    case "lowerLeg":  return palette.lowerLeg;
  }
}

// ---- part builders ----

export function generateTorso(
  s: BomberPartSizes,
  palette: BomberPalette,
  shape: BomberPartShape = "box",
  texturing: BomberTexturing = DEFAULT_BOMBER_TEXTURING
): BufferGeometry {
  // Slight Z compression (0.65×) for a flat-chested toy proportion.
  const g = buildBoxLike(s.torsoWidth, s.torsoHeight, s.torsoWidth * 0.65, shape);
  paintVertexColors(g, palette.torsoTop);
  paintBottomShadow(g, palette.torsoBottom, s.torsoHeight);
  applyTexturing(g, texturing);
  return g;
}

export function generateHead(
  s: BomberPartSizes,
  palette: BomberPalette,
  shape: BomberPartShape = "box",
  texturing: BomberTexturing = DEFAULT_BOMBER_TEXTURING
): BufferGeometry {
  const g = buildBoxLike(s.headSize, s.headSize, s.headSize, shape);
  paintVertexColors(g, palette.head);
  applyTexturing(g, texturing);
  return g;
}

function generateLimbSegment(
  width: number,
  length: number,
  color: string,
  shape: BomberPartShape,
  texturing: BomberTexturing
): BufferGeometry {
  const g = buildBoxLike(width, length, width, shape);
  // Hang the segment below the pivot — pivot at the TOP of the segment.
  g.applyMatrix4(new Matrix4().makeTranslation(0, -length / 2, 0));
  paintVertexColors(g, color);
  applyTexturing(g, texturing);
  return g;
}

export function generateUpperArm(
  s: BomberPartSizes,
  palette: BomberPalette,
  shape: BomberPartShape = "box",
  texturing: BomberTexturing = DEFAULT_BOMBER_TEXTURING
): BufferGeometry {
  return generateLimbSegment(s.armWidth, s.upperArmLength, palette.upperArm, shape, texturing);
}

export function generateForearm(
  s: BomberPartSizes,
  palette: BomberPalette,
  shape: BomberPartShape = "box",
  texturing: BomberTexturing = DEFAULT_BOMBER_TEXTURING
): BufferGeometry {
  return generateLimbSegment(s.armWidth, s.forearmLength, palette.forearm, shape, texturing);
}

export function generateUpperLeg(
  s: BomberPartSizes,
  palette: BomberPalette,
  shape: BomberPartShape = "box",
  texturing: BomberTexturing = DEFAULT_BOMBER_TEXTURING
): BufferGeometry {
  return generateLimbSegment(s.legWidth, s.upperLegLength, palette.upperLeg, shape, texturing);
}

export function generateLowerLeg(
  s: BomberPartSizes,
  palette: BomberPalette,
  shape: BomberPartShape = "box",
  texturing: BomberTexturing = DEFAULT_BOMBER_TEXTURING
): BufferGeometry {
  return generateLimbSegment(s.legWidth, s.lowerLegLength, palette.lowerLeg, shape, texturing);
}

/** Dispatcher used by the mesh-tree spawner. */
export function generatePart(
  name: BomberPartName,
  s: BomberPartSizes,
  palette: BomberPalette,
  shapes: BomberPartShapes = DEFAULT_BOMBER_PART_SHAPES,
  texturing: BomberTexturing = DEFAULT_BOMBER_TEXTURING
): BufferGeometry {
  switch (name) {
    case "torso":     return generateTorso(s, palette, shapes.torso, texturing);
    case "head":      return generateHead(s, palette, shapes.head, texturing);
    case "upperArm":  return generateUpperArm(s, palette, shapes.limb, texturing);
    case "forearm":   return generateForearm(s, palette, shapes.limb, texturing);
    case "upperLeg":  return generateUpperLeg(s, palette, shapes.limb, texturing);
    case "lowerLeg":  return generateLowerLeg(s, palette, shapes.limb, texturing);
  }
}

// ---- vertex paint helpers ----

function paintVertexColors(geometry: BufferGeometry, hex: string): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const count = position.count;
  const colorAttr = new Float32Array(count * 3);
  const c = new Color(hex);
  for (let i = 0; i < count; i += 1) {
    colorAttr[i * 3] = c.r;
    colorAttr[i * 3 + 1] = c.g;
    colorAttr[i * 3 + 2] = c.b;
  }
  geometry.setAttribute("color", new BufferAttribute(colorAttr, 3));
}

/**
 * S109 KABOOM-PROCEDURAL-TEXTURING — Layer 1 (panel seams).
 *
 * Multiplies the existing vertex colour at extreme-Y vertices by
 * PANEL_SEAM_FACTOR. For a `BoxGeometry` this hits exactly the 8 corner
 * vertices (4 top + 4 bottom); for cylinder + capsule it darkens the
 * top + bottom rings (the equivalent "edges"). Reads as a soft panel
 * seam without any shader work — purely a vertex-colour pass.
 *
 * Idempotent (a second call darkens twice — callers should run it
 * once per geometry, after every other colour pass).
 */
function applyPanelSeamDarken(geometry: BufferGeometry): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const color = geometry.getAttribute("color") as BufferAttribute | undefined;
  if (color === undefined) return;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const span = maxY - minY;
  if (span <= 0) return;
  // 0.5% epsilon — captures the top/bottom rings of cylinders without
  // sweeping any side-wall verts on tall boxes.
  const eps = span * 0.005;
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    if (y <= minY + eps || y >= maxY - eps) {
      const r = color.getX(i) * PANEL_SEAM_FACTOR;
      const g = color.getY(i) * PANEL_SEAM_FACTOR;
      const b = color.getZ(i) * PANEL_SEAM_FACTOR;
      color.setXYZ(i, r, g, b);
    }
  }
  color.needsUpdate = true;
}

/**
 * Apply every enabled procedural-texturing layer in the canonical
 * order. Today: just Layer 1 (panel seams). Layers 2 (decals) and
 * 3 (patterns) will compose in here when they land.
 */
function applyTexturing(geometry: BufferGeometry, texturing: BomberTexturing): void {
  if (texturing.panelSeams) {
    applyPanelSeamDarken(geometry);
  }
}

/**
 * Overpaint the bottom band of the geometry with a darker hex value.
 * Used by the torso so the lower third reads as a contact-shadow.
 * `heightExtent` is the geometry's Y range (Y centered at 0).
 */
function paintBottomShadow(
  geometry: BufferGeometry,
  hex: string,
  heightExtent: number,
  bandFraction = 0.3
): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const color = geometry.getAttribute("color") as BufferAttribute;
  const c = new Color(hex);
  const lowY = -heightExtent / 2;
  const bandTop = lowY + heightExtent * bandFraction;
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    if (y <= bandTop) {
      color.setXYZ(i, c.r, c.g, c.b);
    }
  }
  color.needsUpdate = true;
}
