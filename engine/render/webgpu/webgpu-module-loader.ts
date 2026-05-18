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
  CubeRenderTarget
} from "three/webgpu";

export type WebGpuModule = {
  WebGPURenderer: typeof WebGPURenderer;
  PMREMGenerator: typeof PMREMGenerator;
  CubeRenderTarget: typeof CubeRenderTarget;
};

let cached: Promise<WebGpuModule> | undefined;

export function loadWebGpuModule(): Promise<WebGpuModule> {
  if (cached === undefined) {
    cached = import("three/webgpu").then((mod) => ({
      WebGPURenderer: mod.WebGPURenderer,
      PMREMGenerator: mod.PMREMGenerator,
      CubeRenderTarget: mod.CubeRenderTarget
    }));
  }
  return cached;
}
