// S091 AGF-RENDER-DEBUG-MODE-AGENT. Renderer-level material override the
// agent flips at runtime to debug a frame *without* editing the project.
// Pure helpers — the adapter holds the cache + override material and
// calls these on `setDebugMode()`. Extracted so the swap/restore
// lifecycle can be unit-tested against a tiny fake scene without
// constructing a real WebGLRenderer.

import { Mesh, MeshBasicMaterial, MeshNormalMaterial, ShaderMaterial, type Material } from "three";

export type RenderDebugMode = "off" | "wireframe" | "unlit-white" | "normals" | "uv";

export const RENDER_DEBUG_MODES: ReadonlyArray<RenderDebugMode> = [
  "off",
  "wireframe",
  "unlit-white",
  "normals",
  "uv"
];

export type DebugCacheEntry = {
  material: Material | Material[];
  /** Set only for the `wireframe` mode — the per-material `wireframe` flag we flipped to true. */
  wireframe?: boolean | boolean[];
};

export type DebugCache = Map<Mesh, DebugCacheEntry>;

/** Builds the override material for the substitution modes. `wireframe`
 *  flips the per-material flag instead of swapping, so it returns
 *  undefined. `off` is a no-op and also returns undefined. */
export function createDebugOverrideMaterial(mode: RenderDebugMode): Material | undefined {
  if (mode === "unlit-white") {
    return new MeshBasicMaterial({ color: 0xffffff });
  }
  if (mode === "normals") {
    return new MeshNormalMaterial();
  }
  if (mode === "uv") {
    return new ShaderMaterial({
      vertexShader: [
        "varying vec2 vDebugUv;",
        "void main() {",
        "  vDebugUv = uv;",
        "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
        "}"
      ].join("\n"),
      fragmentShader: [
        "varying vec2 vDebugUv;",
        "void main() {",
        "  gl_FragColor = vec4(vDebugUv.x, vDebugUv.y, 0.0, 1.0);",
        "}"
      ].join("\n")
    });
  }
  return undefined;
}

export function readWireframeSnapshot(
  material: Material | Material[]
): boolean | boolean[] {
  if (Array.isArray(material)) {
    return material.map((m) => (m as Material & { wireframe?: boolean }).wireframe ?? false);
  }
  return (material as Material & { wireframe?: boolean }).wireframe ?? false;
}

export function applyWireframe(
  material: Material | Material[],
  value: boolean | boolean[]
): void {
  if (Array.isArray(material)) {
    for (let i = 0; i < material.length; i += 1) {
      const slot = material[i] as Material & { wireframe?: boolean };
      const next = Array.isArray(value) ? value[i] : value;
      if (typeof next === "boolean" && "wireframe" in slot) {
        slot.wireframe = next;
      }
    }
    return;
  }
  const m = material as Material & { wireframe?: boolean };
  const next = Array.isArray(value) ? value[0] ?? false : value;
  if ("wireframe" in m) {
    m.wireframe = next;
  }
}

type Traversable = { traverse(cb: (obj: { isMesh?: boolean } & object) => void): void };

/** Walk the scene, populate the cache, swap (or flip wireframe). Mutates
 *  the supplied cache. The shared override material (when present) must
 *  be disposed by the caller via `restoreDebugOverrides` -> dispose. */
export function applyDebugOverrides(
  scene: Traversable,
  mode: RenderDebugMode,
  cache: DebugCache,
  overrideMaterial: Material | undefined
): void {
  if (mode === "off") return;
  scene.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    if (mode === "wireframe") {
      const snapshot = readWireframeSnapshot(obj.material);
      cache.set(obj, { material: obj.material, wireframe: snapshot });
      applyWireframe(obj.material, true);
    } else if (overrideMaterial !== undefined) {
      cache.set(obj, { material: obj.material });
      obj.material = overrideMaterial;
    }
  });
}

/** Walk the cache, restore original material (and original wireframe
 *  flag when set), and empty the cache. Does NOT dispose the override
 *  material — the adapter owns that lifecycle. */
export function restoreDebugOverrides(cache: DebugCache): void {
  for (const [mesh, snap] of cache) {
    mesh.material = snap.material;
    if (snap.wireframe !== undefined) {
      applyWireframe(snap.material, snap.wireframe);
    }
  }
  cache.clear();
}
