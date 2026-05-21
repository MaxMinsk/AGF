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

function buildBoxLike(
  width: number,
  height: number,
  depth: number,
  shape: BomberPartShape
): BufferGeometry {
  switch (shape) {
    case "box":
      return new BoxGeometry(width, height, depth);
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

export function generateTorso(s: BomberPartSizes, palette: BomberPalette, shape: BomberPartShape = "box"): BufferGeometry {
  // Slight Z compression (0.65×) for a flat-chested toy proportion.
  const g = buildBoxLike(s.torsoWidth, s.torsoHeight, s.torsoWidth * 0.65, shape);
  paintVertexColors(g, palette.torsoTop);
  paintBottomShadow(g, palette.torsoBottom, s.torsoHeight);
  return g;
}

export function generateHead(s: BomberPartSizes, palette: BomberPalette, shape: BomberPartShape = "box"): BufferGeometry {
  const g = buildBoxLike(s.headSize, s.headSize, s.headSize, shape);
  paintVertexColors(g, palette.head);
  return g;
}

function generateLimbSegment(width: number, length: number, color: string, shape: BomberPartShape): BufferGeometry {
  const g = buildBoxLike(width, length, width, shape);
  // Hang the segment below the pivot — pivot at the TOP of the segment.
  g.applyMatrix4(new Matrix4().makeTranslation(0, -length / 2, 0));
  paintVertexColors(g, color);
  return g;
}

export function generateUpperArm(s: BomberPartSizes, palette: BomberPalette, shape: BomberPartShape = "box"): BufferGeometry {
  return generateLimbSegment(s.armWidth, s.upperArmLength, palette.upperArm, shape);
}

export function generateForearm(s: BomberPartSizes, palette: BomberPalette, shape: BomberPartShape = "box"): BufferGeometry {
  return generateLimbSegment(s.armWidth, s.forearmLength, palette.forearm, shape);
}

export function generateUpperLeg(s: BomberPartSizes, palette: BomberPalette, shape: BomberPartShape = "box"): BufferGeometry {
  return generateLimbSegment(s.legWidth, s.upperLegLength, palette.upperLeg, shape);
}

export function generateLowerLeg(s: BomberPartSizes, palette: BomberPalette, shape: BomberPartShape = "box"): BufferGeometry {
  return generateLimbSegment(s.legWidth, s.lowerLegLength, palette.lowerLeg, shape);
}

/** Dispatcher used by the mesh-tree spawner. */
export function generatePart(
  name: BomberPartName,
  s: BomberPartSizes,
  palette: BomberPalette,
  shapes: BomberPartShapes = DEFAULT_BOMBER_PART_SHAPES
): BufferGeometry {
  switch (name) {
    case "torso":     return generateTorso(s, palette, shapes.torso);
    case "head":      return generateHead(s, palette, shapes.head);
    case "upperArm":  return generateUpperArm(s, palette, shapes.limb);
    case "forearm":   return generateForearm(s, palette, shapes.limb);
    case "upperLeg":  return generateUpperLeg(s, palette, shapes.limb);
    case "lowerLeg":  return generateLowerLeg(s, palette, shapes.limb);
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
