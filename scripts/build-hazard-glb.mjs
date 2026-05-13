// Generates examples/beacon-world/assets/runtime/models/hazard.glb — a
// spiky stellated-octahedron mesh used by both hazard.center and hazard.east.
// The two scene entities differentiate via inline MeshRenderer.color, so the
// mesh ships uncoloured (default light grey base) and the renderer's inline
// colour wins.
//
// Topology: an inner octahedron (r = 0.3) plus 8 outward spike apices placed
// at the centroid of each octahedron face, pushed to r = 0.55. Each original
// face becomes three flat-shaded triangles (apex + adjacent edges), giving
// 24 faces × 3 unique vertices = 72 vertices.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeGlb } from "./lib/write-glb.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(repoRoot, "examples/beacon-world/assets/runtime/models/hazard.glb");

const INNER_RADIUS = 0.3;
const OUTER_RADIUS = 0.55;

const top = scale([0, 1, 0], INNER_RADIUS);
const bot = scale([0, -1, 0], INNER_RADIUS);
const px = scale([1, 0, 0], INNER_RADIUS);
const nx = scale([-1, 0, 0], INNER_RADIUS);
const pz = scale([0, 0, 1], INNER_RADIUS);
const nz = scale([0, 0, -1], INNER_RADIUS);

// Wound so each face's vertices are listed counter-clockwise looking from
// outside the octahedron; that way the cross product of (b-a) × (c-a) points
// outward and we get correct face normals after stellation.
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

const positions = [];
const normals = [];
const indices = [];

faces.forEach((face) => {
  const [a, b, c] = face;
  const centroid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
  const apex = scale(normalize(centroid), OUTER_RADIUS);

  pushTriangle(apex, a, b);
  pushTriangle(apex, b, c);
  pushTriangle(apex, c, a);
});

const size = writeGlb(outputPath, {
  positions: new Float32Array(positions),
  normals: new Float32Array(normals),
  indices: new Uint16Array(indices),
  baseColor: [0.92, 0.36, 0.32, 1],
  metallicFactor: 0.1,
  roughnessFactor: 0.55,
  generator: "agf procedural hazard (stellated octahedron)",
  meshName: "hazard"
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

function scale(v, factor) {
  return [v[0] * factor, v[1] * factor, v[2] * factor];
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
