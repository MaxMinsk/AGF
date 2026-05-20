// S091 AGF-RENDER-DEBUG-MODE-AGENT — pure swap/restore lifecycle tests
// against a tiny in-memory scene of Mesh + MeshStandardMaterial. These
// tests never touch WebGL / WebGPU — they exercise the override material
// factory + the cache lifecycle directly.

import { describe, expect, it } from "vitest";
import {
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshNormalMaterial,
  MeshStandardMaterial,
  Scene,
  ShaderMaterial
} from "three";

import {
  applyDebugOverrides,
  applyWireframe,
  createDebugOverrideMaterial,
  RENDER_DEBUG_MODES,
  readWireframeSnapshot,
  restoreDebugOverrides,
  type DebugCache
} from "../../engine/render/debug-mode";

function makeScene(): { scene: Scene; meshes: Mesh[]; originals: MeshStandardMaterial[] } {
  const scene = new Scene();
  const materials = [
    new MeshStandardMaterial({ color: 0xff0000 }),
    new MeshStandardMaterial({ color: 0x00ff00 }),
    new MeshStandardMaterial({ color: 0x0000ff })
  ];
  const meshes = materials.map((mat) => new Mesh(new BufferGeometry(), mat));
  for (const mesh of meshes) scene.add(mesh);
  return { scene, meshes, originals: materials };
}

describe("createDebugOverrideMaterial (S091 AGF-RENDER-DEBUG-MODE-AGENT)", () => {
  it("exposes the full v1 mode list", () => {
    expect(RENDER_DEBUG_MODES).toEqual(["off", "wireframe", "unlit-white", "normals", "uv"]);
  });

  it("unlit-white builds a MeshBasicMaterial", () => {
    const m = createDebugOverrideMaterial("unlit-white");
    expect(m).toBeInstanceOf(MeshBasicMaterial);
  });

  it("normals builds a MeshNormalMaterial", () => {
    const m = createDebugOverrideMaterial("normals");
    expect(m).toBeInstanceOf(MeshNormalMaterial);
  });

  it("uv builds a ShaderMaterial", () => {
    const m = createDebugOverrideMaterial("uv");
    expect(m).toBeInstanceOf(ShaderMaterial);
  });

  it("off and wireframe return no override material (handled differently)", () => {
    expect(createDebugOverrideMaterial("off")).toBeUndefined();
    expect(createDebugOverrideMaterial("wireframe")).toBeUndefined();
  });
});

describe("applyDebugOverrides + restoreDebugOverrides", () => {
  it("unlit-white swaps every mesh.material to the override and restores on undo", () => {
    const { scene, meshes, originals } = makeScene();
    const override = createDebugOverrideMaterial("unlit-white")!;
    const cache: DebugCache = new Map();
    applyDebugOverrides(scene, "unlit-white", cache, override);
    expect(cache.size).toBe(3);
    for (const mesh of meshes) {
      expect(mesh.material).toBe(override);
    }
    restoreDebugOverrides(cache);
    expect(cache.size).toBe(0);
    for (let i = 0; i < meshes.length; i += 1) {
      expect(meshes[i]!.material).toBe(originals[i]);
    }
  });

  it("wireframe flips material.wireframe in-place and restores on undo", () => {
    const { scene, meshes, originals } = makeScene();
    expect((originals[0] as MeshStandardMaterial).wireframe).toBe(false);
    const cache: DebugCache = new Map();
    applyDebugOverrides(scene, "wireframe", cache, undefined);
    for (const mat of originals) {
      expect(mat.wireframe).toBe(true);
    }
    // Same material object — not replaced.
    for (let i = 0; i < meshes.length; i += 1) {
      expect(meshes[i]!.material).toBe(originals[i]);
    }
    restoreDebugOverrides(cache);
    for (const mat of originals) {
      expect(mat.wireframe).toBe(false);
    }
  });

  it("wireframe preserves a pre-existing wireframe=true (does not zero it on restore)", () => {
    const { scene, originals } = makeScene();
    originals[1]!.wireframe = true;
    const cache: DebugCache = new Map();
    applyDebugOverrides(scene, "wireframe", cache, undefined);
    restoreDebugOverrides(cache);
    expect(originals[0]!.wireframe).toBe(false);
    expect(originals[1]!.wireframe).toBe(true);
    expect(originals[2]!.wireframe).toBe(false);
  });

  it("off is a no-op", () => {
    const { scene, meshes, originals } = makeScene();
    const cache: DebugCache = new Map();
    applyDebugOverrides(scene, "off", cache, undefined);
    expect(cache.size).toBe(0);
    for (let i = 0; i < meshes.length; i += 1) {
      expect(meshes[i]!.material).toBe(originals[i]);
    }
  });
});

describe("readWireframeSnapshot / applyWireframe", () => {
  it("snapshots and restores per-slot for material arrays", () => {
    const a = new MeshStandardMaterial();
    const b = new MeshStandardMaterial();
    a.wireframe = true;
    b.wireframe = false;
    const snap = readWireframeSnapshot([a, b]);
    expect(snap).toEqual([true, false]);
    applyWireframe([a, b], true);
    expect(a.wireframe).toBe(true);
    expect(b.wireframe).toBe(true);
    applyWireframe([a, b], snap);
    expect(a.wireframe).toBe(true);
    expect(b.wireframe).toBe(false);
  });
});
