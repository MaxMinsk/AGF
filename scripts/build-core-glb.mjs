// Generates examples/beacon-world/assets/runtime/models/core.glb — a small
// pentagonal bipyramid used for energy cores. 7 unique positions (2 apexes
// + 5 ring vertices) expand to 10 flat-shaded triangles = 30 vertices once
// face normals are baked in.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeGlb } from "./lib/write-glb.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(repoRoot, "examples/beacon-world/assets/runtime/models/core.glb");

const RING_RADIUS = 0.36;
const APEX_HEIGHT = 0.5;
const SIDES = 5;

const topApex = [0, APEX_HEIGHT, 0];
const bottomApex = [0, -APEX_HEIGHT, 0];

const ring = [];
for (let i = 0; i < SIDES; i += 1) {
  const angle = (i / SIDES) * Math.PI * 2;
  ring.push([Math.cos(angle) * RING_RADIUS, 0, Math.sin(angle) * RING_RADIUS]);
}

const positions = [];
const normals = [];
const indices = [];

for (let i = 0; i < SIDES; i += 1) {
  const a = ring[i];
  const b = ring[(i + 1) % SIDES];
  pushTriangle(topApex, a, b); // top fan
  pushTriangle(bottomApex, b, a); // bottom fan (reverse winding for outward normal)
}

const size = writeGlb(outputPath, {
  positions: new Float32Array(positions),
  normals: new Float32Array(normals),
  indices: new Uint16Array(indices),
  baseColor: [0.29, 0.94, 0.66, 1],
  metallicFactor: 0.05,
  roughnessFactor: 0.3,
  generator: "agf procedural energy core (pentagonal bipyramid)",
  meshName: "energy-core"
});

console.log(`Wrote ${outputPath} (${size} bytes)`);

function pushTriangle(a, b, c) {
  const normal = faceNormal(a, b, c);
  const startIndex = positions.length / 3;
  positions.push(...a, ...b, ...c);
  normals.push(...normal, ...normal, ...normal);
  indices.push(startIndex, startIndex + 1, startIndex + 2);
}

function faceNormal(a, b, c) {
  const ab = sub(b, a);
  const ac = sub(c, a);
  return normalize(cross(ab, ac));
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(v) {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (length === 0) {
    return [0, 0, 0];
  }
  return [v[0] / length, v[1] / length, v[2] / length];
}
