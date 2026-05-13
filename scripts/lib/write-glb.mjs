// Minimal binary glTF 2.0 writer used by procedural mesh builders under scripts/.
// Takes a typed-array geometry + a PBR base colour and writes a single-mesh GLB
// to `outputPath`. No npm dep — just node:fs and Buffer arithmetic.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * @param {string} outputPath
 * @param {{
 *   positions: Float32Array,
 *   normals: Float32Array,
 *   indices: Uint16Array,
 *   baseColor?: [number, number, number, number],
 *   metallicFactor?: number,
 *   roughnessFactor?: number,
 *   generator?: string,
 *   meshName?: string
 * }} geometry
 */
export function writeGlb(outputPath, geometry) {
  const positionsBuf = Buffer.from(geometry.positions.buffer);
  const normalsBuf = Buffer.from(geometry.normals.buffer);
  const indicesBuf = Buffer.from(geometry.indices.buffer);
  const binData = Buffer.concat([positionsBuf, normalsBuf, indicesBuf]);

  const min = vec3Min(geometry.positions);
  const max = vec3Max(geometry.positions);
  const baseColor = geometry.baseColor ?? [0.8, 0.8, 0.8, 1];

  const json = {
    asset: { version: "2.0", generator: geometry.generator ?? "agf procedural mesh" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: geometry.meshName ?? "mesh" }],
    meshes: [
      {
        name: geometry.meshName ?? "mesh",
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
          baseColorFactor: baseColor,
          metallicFactor: geometry.metallicFactor ?? 0,
          roughnessFactor: geometry.roughnessFactor ?? 1
        }
      }
    ],
    buffers: [{ byteLength: binData.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionsBuf.length, target: 34962 },
      { buffer: 0, byteOffset: positionsBuf.length, byteLength: normalsBuf.length, target: 34962 },
      {
        buffer: 0,
        byteOffset: positionsBuf.length + normalsBuf.length,
        byteLength: indicesBuf.length,
        target: 34963
      }
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: geometry.positions.length / 3,
        type: "VEC3",
        min,
        max
      },
      { bufferView: 1, componentType: 5126, count: geometry.normals.length / 3, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: geometry.indices.length, type: "SCALAR" }
    ]
  };

  const jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPadded = padBuffer(jsonBuf, 0x20);
  const binPadded = padBuffer(binData, 0x00);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonPadded.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4);

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binPadded.length, 0);
  binChunkHeader.writeUInt32LE(0x004e4942, 4);

  const headerSize = 12;
  const totalLength = headerSize + 8 + jsonPadded.length + 8 + binPadded.length;

  const header = Buffer.alloc(headerSize);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const glb = Buffer.concat([header, jsonChunkHeader, jsonPadded, binChunkHeader, binPadded]);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, glb);
  return glb.length;
}

function padBuffer(buf, fill) {
  const remainder = buf.length % 4;
  if (remainder === 0) {
    return buf;
  }
  return Buffer.concat([buf, Buffer.alloc(4 - remainder, fill)]);
}

function vec3Min(arr) {
  const min = [Infinity, Infinity, Infinity];
  for (let i = 0; i < arr.length; i += 3) {
    if (arr[i] < min[0]) min[0] = arr[i];
    if (arr[i + 1] < min[1]) min[1] = arr[i + 1];
    if (arr[i + 2] < min[2]) min[2] = arr[i + 2];
  }
  return min;
}

function vec3Max(arr) {
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < arr.length; i += 3) {
    if (arr[i] > max[0]) max[0] = arr[i];
    if (arr[i + 1] > max[1]) max[1] = arr[i + 1];
    if (arr[i + 2] > max[2]) max[2] = arr[i + 2];
  }
  return max;
}
