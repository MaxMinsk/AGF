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
  Color,
  Matrix4
} from "three";

import type { BomberPalette } from "./bomber-palette";

export type BomberPartSizes = {
  headSize: number;
  torsoHeight: number;
  torsoWidth: number;
  armLength: number;
  armWidth: number;
  legLength: number;
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

export function generateTorso(s: BomberPartSizes, palette: BomberPalette): BufferGeometry {
  // Slight Z compression (0.65×) for a flat-chested toy proportion.
  const g = new BoxGeometry(s.torsoWidth, s.torsoHeight, s.torsoWidth * 0.65);
  paintVertexColors(g, palette.torsoTop);
  // Bottom-row vertices get the torsoBottom shadow tint — gives the
  // contact-shadow split the design doc calls for, without a shader.
  paintBottomShadow(g, palette.torsoBottom, s.torsoHeight);
  return g;
}

export function generateHead(s: BomberPartSizes, palette: BomberPalette): BufferGeometry {
  const g = new BoxGeometry(s.headSize, s.headSize, s.headSize);
  paintVertexColors(g, palette.head);
  return g;
}

function generateLimbSegment(width: number, length: number, color: string): BufferGeometry {
  // Hang the segment below the pivot — pivot at the TOP of the segment
  // (top face at local Y = 0).
  const g = new BoxGeometry(width, length, width);
  g.applyMatrix4(new Matrix4().makeTranslation(0, -length / 2, 0));
  paintVertexColors(g, color);
  return g;
}

export function generateUpperArm(s: BomberPartSizes, palette: BomberPalette): BufferGeometry {
  return generateLimbSegment(s.armWidth, s.armLength, palette.upperArm);
}

export function generateForearm(s: BomberPartSizes, palette: BomberPalette): BufferGeometry {
  return generateLimbSegment(s.armWidth, s.armLength, palette.forearm);
}

export function generateUpperLeg(s: BomberPartSizes, palette: BomberPalette): BufferGeometry {
  return generateLimbSegment(s.legWidth, s.legLength, palette.upperLeg);
}

export function generateLowerLeg(s: BomberPartSizes, palette: BomberPalette): BufferGeometry {
  return generateLimbSegment(s.legWidth, s.legLength, palette.lowerLeg);
}

/** Dispatcher used by the mesh-tree spawner. */
export function generatePart(
  name: BomberPartName,
  s: BomberPartSizes,
  palette: BomberPalette
): BufferGeometry {
  switch (name) {
    case "torso":     return generateTorso(s, palette);
    case "head":      return generateHead(s, palette);
    case "upperArm":  return generateUpperArm(s, palette);
    case "forearm":   return generateForearm(s, palette);
    case "upperLeg":  return generateUpperLeg(s, palette);
    case "lowerLeg":  return generateLowerLeg(s, palette);
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
