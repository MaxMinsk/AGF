// One-shot generator for examples/hello-3d/assets/runtime/models/cube.glb.
//
// Writes a minimal binary glTF 2.0 file (GLB) with a single mesh: 24 vertices
// (4 per face × 6 faces), face-aligned normals, 36 indices, and a default
// PBR material. No npm dependency — just node:fs and Buffer arithmetic.
//
// Run with `node scripts/build-cube-glb.mjs`. The output is committed; this
// script exists so the asset is reproducible and reviewable, not so it runs
// in CI.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(repoRoot, "examples/hello-3d/assets/runtime/models/cube.glb");

const faces = [
  { normal: [1, 0, 0], v: [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]] },
  { normal: [-1, 0, 0], v: [[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5]] },
  { normal: [0, 1, 0], v: [[-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]] },
  { normal: [0, -1, 0], v: [[-0.5, -0.5, 0.5], [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5]] },
  { normal: [0, 0, 1], v: [[0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, -0.5, 0.5]] },
  { normal: [0, 0, -1], v: [[-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0.5, -0.5, -0.5]] }
];

const positions = new Float32Array(24 * 3);
const normals = new Float32Array(24 * 3);
const indices = new Uint16Array(36);

let vIndex = 0;
let iIndex = 0;
for (const face of faces) {
  const start = vIndex;
  for (const v of face.v) {
    positions.set(v, vIndex * 3);
    normals.set(face.normal, vIndex * 3);
    vIndex += 1;
  }
  indices.set([start, start + 1, start + 2, start, start + 2, start + 3], iIndex);
  iIndex += 6;
}

const positionsBuf = Buffer.from(positions.buffer);
const normalsBuf = Buffer.from(normals.buffer);
const indicesBuf = Buffer.from(indices.buffer);

const binData = Buffer.concat([positionsBuf, normalsBuf, indicesBuf]);

const json = {
  asset: { version: "2.0", generator: "agf cube generator" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: "cube" }],
  meshes: [
    {
      name: "cube",
      primitives: [
        {
          attributes: { POSITION: 0, NORMAL: 1 },
          indices: 2,
          material: 0
        }
      ]
    }
  ],
  materials: [
    {
      name: "default",
      pbrMetallicRoughness: {
        baseColorFactor: [0.8, 0.8, 0.8, 1.0],
        metallicFactor: 0.0,
        roughnessFactor: 1.0
      }
    }
  ],
  buffers: [{ byteLength: binData.length }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: positionsBuf.length, target: 34962 },
    { buffer: 0, byteOffset: positionsBuf.length, byteLength: normalsBuf.length, target: 34962 },
    { buffer: 0, byteOffset: positionsBuf.length + normalsBuf.length, byteLength: indicesBuf.length, target: 34963 }
  ],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: 24,
      type: "VEC3",
      min: [-0.5, -0.5, -0.5],
      max: [0.5, 0.5, 0.5]
    },
    { bufferView: 1, componentType: 5126, count: 24, type: "VEC3" },
    { bufferView: 2, componentType: 5123, count: 36, type: "SCALAR" }
  ]
};

const jsonStr = JSON.stringify(json);
const jsonBuf = Buffer.from(jsonStr, "utf8");
const jsonPadding = (4 - (jsonBuf.length % 4)) % 4;
const jsonPaddedBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPadding, 0x20)]);

const binPadding = (4 - (binData.length % 4)) % 4;
const binPaddedBuf = Buffer.concat([binData, Buffer.alloc(binPadding, 0x00)]);

const jsonChunkHeader = Buffer.alloc(8);
jsonChunkHeader.writeUInt32LE(jsonPaddedBuf.length, 0);
jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4);

const binChunkHeader = Buffer.alloc(8);
binChunkHeader.writeUInt32LE(binPaddedBuf.length, 0);
binChunkHeader.writeUInt32LE(0x004e4942, 4);

const headerSize = 12;
const totalLength = headerSize + 8 + jsonPaddedBuf.length + 8 + binPaddedBuf.length;

const header = Buffer.alloc(headerSize);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(totalLength, 8);

const glb = Buffer.concat([header, jsonChunkHeader, jsonPaddedBuf, binChunkHeader, binPaddedBuf]);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, glb);

console.log(`Wrote ${outputPath} (${glb.length} bytes)`);
