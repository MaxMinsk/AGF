// S106 KABOOM-ACCESSORY-CATALOG — 5 starter accessory mesh generators.
//
// Each function returns ONE BufferGeometry tinted from the existing
// 8-channel palette (accent channel for highlights, head/torsoTop for
// body fill). Each is small (≤ ~50 vertices) so adding 3 accessories
// per bomber doesn't blow up the renderer's bucket count.
//
// Geometry conventions:
//   - All meshes are centered at origin in the parent socket's local frame.
//   - The spawner offsets the entity by the socket's position; the mesh
//     itself doesn't need to "know" where it'll sit on the body.

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  Matrix4
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { BomberPalette } from "../generators/bomber-palette";

export type AccessoryKind = "antennae" | "visor" | "backpack" | "cap" | "fins";

export const ACCESSORY_KINDS: ReadonlyArray<AccessoryKind> = [
  "antennae",
  "visor",
  "backpack",
  "cap",
  "fins"
];

export function isAccessoryKind(value: unknown): value is AccessoryKind {
  return typeof value === "string" && (ACCESSORY_KINDS as ReadonlyArray<string>).includes(value);
}

function paintVertexColors(geometry: BufferGeometry, hex: string): BufferGeometry {
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
  return geometry;
}

// --- Antennae: two thin cylinders rising from the socket ---
export function generateAntennaeAccessory(palette: BomberPalette): BufferGeometry {
  const ROD_HEIGHT = 0.18;
  const ROD_RADIUS = 0.018;
  const SPACING = 0.06;
  const left = new CylinderGeometry(ROD_RADIUS, ROD_RADIUS, ROD_HEIGHT, 6);
  left.applyMatrix4(new Matrix4().makeTranslation(-SPACING / 2, ROD_HEIGHT / 2, 0));
  paintVertexColors(left, palette.accent);
  const right = new CylinderGeometry(ROD_RADIUS, ROD_RADIUS, ROD_HEIGHT, 6);
  right.applyMatrix4(new Matrix4().makeTranslation(SPACING / 2, ROD_HEIGHT / 2, 0));
  paintVertexColors(right, palette.accent);
  return mergeGeometries([left, right], false) ?? left;
}

// --- Visor: wide thin box across the eyes ---
export function generateVisorAccessory(palette: BomberPalette): BufferGeometry {
  const g = new BoxGeometry(0.32, 0.07, 0.05);
  paintVertexColors(g, palette.accent);
  return g;
}

// --- Backpack: small box on the back ---
export function generateBackpackAccessory(palette: BomberPalette): BufferGeometry {
  const g = new BoxGeometry(0.28, 0.3, 0.12);
  g.applyMatrix4(new Matrix4().makeTranslation(0, 0, -0.06));
  paintVertexColors(g, palette.torsoTop);
  // Top strap accent.
  const strap = new BoxGeometry(0.28, 0.05, 0.13);
  strap.applyMatrix4(new Matrix4().makeTranslation(0, 0.12, -0.06));
  paintVertexColors(strap, palette.accent);
  return mergeGeometries([g, strap], false) ?? g;
}

// --- Cap: wide shallow capsule on the crown ---
export function generateCapAccessory(palette: BomberPalette): BufferGeometry {
  const dome = new CapsuleGeometry(0.18, 0.04, 4, 12);
  // Squash the capsule height-wise so it sits flat on the head crown.
  dome.applyMatrix4(new Matrix4().makeScale(1, 0.5, 1));
  dome.applyMatrix4(new Matrix4().makeTranslation(0, 0.04, 0));
  paintVertexColors(dome, palette.accent);
  // Cap brim.
  const brim = new CylinderGeometry(0.22, 0.22, 0.02, 16);
  brim.applyMatrix4(new Matrix4().makeTranslation(0, 0.02, 0.04));
  paintVertexColors(brim, palette.accent);
  return mergeGeometries([dome, brim], false) ?? dome;
}

// --- Fins: pair of triangular plates on side sockets ---
// Note: fins is special — it spawns TWO entities (left + right), each
// referencing this same mesh; the spawner mirrors left's X via scale.
// For the catalog we ship the LEFT geometry; the right is the same mesh
// with scale.x = -1 applied at spawn time.
export function generateFinAccessory(palette: BomberPalette): BufferGeometry {
  // Wedge from a flattened box, tilted up.
  const g = new BoxGeometry(0.04, 0.18, 0.22);
  const tilt = new Matrix4().makeRotationZ(-0.4);
  g.applyMatrix4(tilt);
  paintVertexColors(g, palette.accent);
  return g;
}

/** Dispatcher used by the spawner + bench preview. */
export function generateAccessory(kind: AccessoryKind, palette: BomberPalette): BufferGeometry {
  switch (kind) {
    case "antennae": return generateAntennaeAccessory(palette);
    case "visor":    return generateVisorAccessory(palette);
    case "backpack": return generateBackpackAccessory(palette);
    case "cap":      return generateCapAccessory(palette);
    case "fins":     return generateFinAccessory(palette);
  }
}

/** Procedural-mesh-registry key for a given accessory. */
export function accessoryKey(kind: AccessoryKind): string {
  return `procbomber-accessory-${kind}`;
}
