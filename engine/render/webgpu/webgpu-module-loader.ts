// S70 WEBGPU-lazy-import. Wraps the dynamic import of `three/webgpu` so
// the rest of the adapter sees a typed module reference instead of an
// untyped `await import(...)` literal. Keeping the dynamic import behind
// a single helper also gives Rollup one stable boundary to split the
// WebGPU-only chunk on (`manualChunks` in `vite.config.ts` matches files
// inside `three/build/three.webgpu.js` + dependents).
//
// Why dynamic instead of static: `three/webgpu` re-exports a much larger
// surface than `three` (the entire TSL / node-material runtime), adding
// ~145 KB gzipped to whichever chunk references it statically. WebGL-only
// projects shouldn't pay that bill.
//
// The loader memoises so concurrent `init()` calls on multiple adapters
// share a single module load.

import type {
  WebGPURenderer,
  PMREMGenerator,
  CubeRenderTarget,
  MeshBasicNodeMaterial
} from "three/webgpu";
import type { Object3D } from "three";

/**
 * Minimal structural shape of the TSL `reflector()` factory's return
 * value. The factory itself isn't in the @types/three typings as of
 * three.js 0.184; we type it structurally so the WebGPU planar-mirror
 * path doesn't have to scatter `as unknown` casts around every use.
 */
export type ReflectorFactoryResult = {
  target: Object3D;
};

export type WebGpuModule = {
  WebGPURenderer: typeof WebGPURenderer;
  PMREMGenerator: typeof PMREMGenerator;
  CubeRenderTarget: typeof CubeRenderTarget;
  // S72 WEBGPU-planar-mirror. TSL `reflector()` factory + node-material
  // pair used to implement `acquirePlanarMirror` on the WebGPU adapter.
  // Different API shape than the WebGL `Reflector` class (Mesh subclass)
  // — here `reflector()` returns a TextureNode you attach to a
  // node-material's `colorNode`, then add `reflector.target` as a child
  // of the host Mesh so the reflection plane follows the mesh transform.
  MeshBasicNodeMaterial: typeof MeshBasicNodeMaterial;
  reflector: (parameters?: { resolutionScale?: number; generateMipmaps?: boolean; bounces?: boolean; depth?: boolean; samples?: number }) => ReflectorFactoryResult;
};

let cached: Promise<WebGpuModule> | undefined;

export function loadWebGpuModule(): Promise<WebGpuModule> {
  if (cached === undefined) {
    // `three/webgpu` exposes WebGPURenderer + PMREM + CubeRenderTarget +
    // node materials, but the TSL factories (`reflector()`, etc.) live
    // in the separate `three/tsl` entrypoint as of r0.184. Load both in
    // parallel for the WebGPU paths that need them.
    cached = Promise.all([
      import("three/webgpu"),
      import("three/tsl")
    ]).then(([webgpuMod, tslMod]) => {
      const w = webgpuMod as unknown as {
        WebGPURenderer: typeof WebGPURenderer;
        PMREMGenerator: typeof PMREMGenerator;
        CubeRenderTarget: typeof CubeRenderTarget;
        MeshBasicNodeMaterial: typeof MeshBasicNodeMaterial;
      };
      const t = tslMod as unknown as { reflector: WebGpuModule["reflector"] };
      return {
        WebGPURenderer: w.WebGPURenderer,
        PMREMGenerator: w.PMREMGenerator,
        CubeRenderTarget: w.CubeRenderTarget,
        MeshBasicNodeMaterial: w.MeshBasicNodeMaterial,
        reflector: t.reflector
      };
    });
  }
  return cached;
}
