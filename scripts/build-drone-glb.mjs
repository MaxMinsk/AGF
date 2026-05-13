// Generates examples/beacon-world/assets/runtime/models/drone.glb — an
// octahedron with face-aligned flat normals. The shape gives the Beacon World
// drone an obvious silhouette that reads as more than a primitive sphere.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeGlb } from "./lib/write-glb.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(repoRoot, "examples/beacon-world/assets/runtime/models/drone.glb");

const r = 0.5;
const top = [0, r, 0];
const bot = [0, -r, 0];
const px = [r, 0, 0];
const nx = [-r, 0, 0];
const pz = [0, 0, r];
const nz = [0, 0, -r];

const faces = [
  [top, px, pz],
  [top, pz, nx],
  [top, nx, nz],
  [top, nz, px],
  [bot, pz, px],
  [bot, nx, pz],
  [bot, nz, nx],
  [bot, px, nz]
];

const positions = new Float32Array(faces.length * 3 * 3);
const normals = new Float32Array(faces.length * 3 * 3);
const indices = new Uint16Array(faces.length * 3);

faces.forEach((face, faceIndex) => {
  const [a, b, c] = face;
  const normal = faceNormal(a, b, c);
  face.forEach((vertex, vertexIndex) => {
    const offset = (faceIndex * 3 + vertexIndex) * 3;
    positions[offset] = vertex[0];
    positions[offset + 1] = vertex[1];
    positions[offset + 2] = vertex[2];
    normals[offset] = normal[0];
    normals[offset + 1] = normal[1];
    normals[offset + 2] = normal[2];
  });
  indices[faceIndex * 3] = faceIndex * 3;
  indices[faceIndex * 3 + 1] = faceIndex * 3 + 1;
  indices[faceIndex * 3 + 2] = faceIndex * 3 + 2;
});

const size = writeGlb(outputPath, {
  positions,
  normals,
  indices,
  baseColor: [0.8, 0.86, 0.92, 1],
  metallicFactor: 0.7,
  roughnessFactor: 0.4,
  generator: "agf procedural drone (octahedron)",
  meshName: "drone"
});

console.log(`Wrote ${outputPath} (${size} bytes)`);

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
