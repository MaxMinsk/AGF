// Generates examples/beacon-world/assets/runtime/models/beacon.glb — a
// hexagonal prism with flat per-face normals. Replaces the box primitive that
// Beacon World's beacons were rendering with, so the silhouette reads as a
// crystalline pillar rather than a stretched cube.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeGlb } from "./lib/write-glb.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(repoRoot, "examples/beacon-world/assets/runtime/models/beacon.glb");

const SIDES = 6;
const RADIUS = 0.5;
const HALF_HEIGHT = 0.5;

const topRing = [];
const bottomRing = [];
for (let i = 0; i < SIDES; i += 1) {
  const angle = (i / SIDES) * Math.PI * 2;
  const x = Math.cos(angle) * RADIUS;
  const z = Math.sin(angle) * RADIUS;
  topRing.push([x, HALF_HEIGHT, z]);
  bottomRing.push([x, -HALF_HEIGHT, z]);
}

const positions = [];
const normals = [];
const indices = [];

function pushVertex(position, normal) {
  const index = positions.length / 3;
  positions.push(position[0], position[1], position[2]);
  normals.push(normal[0], normal[1], normal[2]);
  return index;
}

// Side faces — two triangles per side, four unique vertices per face so the
// normal stays flat across each panel.
for (let i = 0; i < SIDES; i += 1) {
  const next = (i + 1) % SIDES;
  const tA = topRing[i];
  const tB = topRing[next];
  const bA = bottomRing[i];
  const bB = bottomRing[next];
  const normal = sideNormal(tA, tB);
  const v0 = pushVertex(bA, normal);
  const v1 = pushVertex(bB, normal);
  const v2 = pushVertex(tB, normal);
  const v3 = pushVertex(tA, normal);
  indices.push(v0, v1, v2, v0, v2, v3);
}

// Top cap — fan around the top centre point, normal pointing up.
const topCentre = [0, HALF_HEIGHT, 0];
const topCentreIndex = pushVertex(topCentre, [0, 1, 0]);
const topPerimeter = topRing.map((v) => pushVertex(v, [0, 1, 0]));
for (let i = 0; i < SIDES; i += 1) {
  const a = topPerimeter[i];
  const b = topPerimeter[(i + 1) % SIDES];
  indices.push(topCentreIndex, a, b);
}

// Bottom cap — fan around the bottom centre, normal pointing down. Winding
// reversed so the face still points outward (down).
const bottomCentre = [0, -HALF_HEIGHT, 0];
const bottomCentreIndex = pushVertex(bottomCentre, [0, -1, 0]);
const bottomPerimeter = bottomRing.map((v) => pushVertex(v, [0, -1, 0]));
for (let i = 0; i < SIDES; i += 1) {
  const a = bottomPerimeter[i];
  const b = bottomPerimeter[(i + 1) % SIDES];
  indices.push(bottomCentreIndex, b, a);
}

const size = writeGlb(outputPath, {
  positions: new Float32Array(positions),
  normals: new Float32Array(normals),
  indices: new Uint16Array(indices),
  baseColor: [0.96, 0.78, 0.28, 1],
  metallicFactor: 0.2,
  roughnessFactor: 0.4,
  generator: "agf procedural beacon (hex prism)",
  meshName: "beacon"
});

console.log(`Wrote ${outputPath} (${size} bytes)`);

function sideNormal(a, b) {
  // Side panel normal lies in the XZ plane and points outward from the centre.
  // Take the midpoint of the top edge and normalise it.
  const mx = (a[0] + b[0]) / 2;
  const mz = (a[2] + b[2]) / 2;
  const length = Math.hypot(mx, mz);
  if (length === 0) {
    return [0, 0, 0];
  }
  return [mx / length, 0, mz / length];
}
