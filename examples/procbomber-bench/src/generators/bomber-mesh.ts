// S101 PROCBOMBER-MESH-V0 — pure humanoid mesh generator.
//
// Six merged box parts laid out vertically: head, torso, left arm,
// right arm, left leg, right leg. Vertex colors are taken from a
// `BomberPalette` (see `bomber-palette.ts`). Output is a single
// `BufferGeometry` with positions + indices + a per-vertex `color`
// attribute, ready for an unlit MeshStandardMaterial with
// `vertexColors: true`.
//
// The mesh is centered at (0, 0, 0) on the XZ plane with the feet on
// Y = 0. Bench + future Kaboom Crew integration place the entity at any
// world transform — they don't need to know the limb anchors. The
// future animation pass (S102) will read `geometry.userData.anchors`
// for IK targets.

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  Matrix4
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { BomberPalette } from "./bomber-palette";

export type BomberMeshSpec = {
  palette: BomberPalette;
  /** Scale knobs in cell units. All optional — defaults below. */
  headSize?: number;
  torsoHeight?: number;
  torsoWidth?: number;
  armLength?: number;
  armWidth?: number;
  legLength?: number;
  legWidth?: number;
};

export const BOMBER_MESH_DEFAULTS = {
  headSize: 0.35,
  torsoHeight: 0.45,
  torsoWidth: 0.45,
  // S103 PROCBOMBER-LIMB-SEGMENT-SLIDERS: split arm + leg into two
  // segments with independent length knobs. Defaults sum to roughly
  // the old single-segment sizes (~0.2 each).
  upperArmLength: 0.2,
  forearmLength: 0.2,
  armWidth: 0.15,
  upperLegLength: 0.18,
  lowerLegLength: 0.18,
  legWidth: 0.18,
  // Kept for back-compat with any caller still reading single-segment
  // values; treat as the SUM of upper + lower for callers that don't
  // know about the split. The generator no longer uses these.
  armLength: 0.4,
  legLength: 0.36
} as const;

export type BomberPartName = "head" | "torso" | "armL" | "armR" | "legL" | "legR";

export type BomberAnchors = Readonly<{
  [K in BomberPartName]: { center: readonly [number, number, number] };
}>;

/**
 * Build a humanoid bomber `BufferGeometry`. Pure: same spec yields a
 * geometry with identical vertex positions + colors every call (modulo
 * BufferGeometry identity).
 */
export function generateBomberMesh(spec: BomberMeshSpec): BufferGeometry {
  const s = {
    headSize: spec.headSize ?? BOMBER_MESH_DEFAULTS.headSize,
    torsoHeight: spec.torsoHeight ?? BOMBER_MESH_DEFAULTS.torsoHeight,
    torsoWidth: spec.torsoWidth ?? BOMBER_MESH_DEFAULTS.torsoWidth,
    armLength: spec.armLength ?? BOMBER_MESH_DEFAULTS.armLength,
    armWidth: spec.armWidth ?? BOMBER_MESH_DEFAULTS.armWidth,
    legLength: spec.legLength ?? BOMBER_MESH_DEFAULTS.legLength,
    legWidth: spec.legWidth ?? BOMBER_MESH_DEFAULTS.legWidth
  };
  const palette = spec.palette;

  // Y coordinate of each part center, from the ground up.
  const legY = s.legLength / 2;
  const torsoY = s.legLength + s.torsoHeight / 2;
  const headY = s.legLength + s.torsoHeight + s.headSize / 2;
  const armY = s.legLength + s.torsoHeight - s.armLength / 2; // shoulder-aligned

  const halfTorso = s.torsoWidth / 2;
  const armOffset = halfTorso + s.armWidth / 2;
  const legOffset = halfTorso * 0.5;

  type Part = {
    name: BomberPartName;
    box: { x: number; y: number; z: number };
    center: readonly [number, number, number];
    color: string;
  };
  // S102 PROCBOMBER-PALETTE-8CH: per-part channels (8-channel palette).
  // Single-mesh path retained; the per-part mesh tree (S102
  // PROCBOMBER-MESH-TREE-V0) will use the same channel mapping.
  const parts: Part[] = [
    {
      name: "head",
      box: { x: s.headSize, y: s.headSize, z: s.headSize },
      center: [0, headY, 0],
      color: palette.head
    },
    {
      name: "torso",
      box: { x: s.torsoWidth, y: s.torsoHeight, z: s.torsoWidth * 0.65 },
      center: [0, torsoY, 0],
      color: palette.torsoTop
    },
    {
      name: "armL",
      box: { x: s.armWidth, y: s.armLength, z: s.armWidth },
      center: [-armOffset, armY, 0],
      color: palette.upperArm
    },
    {
      name: "armR",
      box: { x: s.armWidth, y: s.armLength, z: s.armWidth },
      center: [armOffset, armY, 0],
      color: palette.upperArm
    },
    {
      name: "legL",
      box: { x: s.legWidth, y: s.legLength, z: s.legWidth },
      center: [-legOffset, legY, 0],
      color: palette.upperLeg
    },
    {
      name: "legR",
      box: { x: s.legWidth, y: s.legLength, z: s.legWidth },
      center: [legOffset, legY, 0],
      color: palette.upperLeg
    }
  ];

  const partGeoms: BufferGeometry[] = [];
  for (const part of parts) {
    const g = new BoxGeometry(part.box.x, part.box.y, part.box.z);
    const offset = new Matrix4().makeTranslation(part.center[0], part.center[1], part.center[2]);
    g.applyMatrix4(offset);
    paintVertexColors(g, part.color);
    partGeoms.push(g);
  }

  const merged = mergeGeometries(partGeoms, false);
  if (merged === null) {
    return partGeoms[0]!;
  }

  const anchors: BomberAnchors = {
    head: { center: [0, headY, 0] },
    torso: { center: [0, torsoY, 0] },
    armL: { center: [-armOffset, armY, 0] },
    armR: { center: [armOffset, armY, 0] },
    legL: { center: [-legOffset, legY, 0] },
    legR: { center: [legOffset, legY, 0] }
  };
  merged.userData["anchors"] = anchors;
  merged.userData["totalHeight"] = s.legLength + s.torsoHeight + s.headSize;
  merged.userData["palette"] = palette.name;
  return merged;
}

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
