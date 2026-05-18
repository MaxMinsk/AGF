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
  /** Multiplied component (chainable node operator) used by the tint mul. */
  mul: (other: TslColorNode) => TslColorNode;
};

/**
 * S74 / S76 WEBGPU-csm. `three.js`'s `CSMShadowNode` constructor as
 * imported from `three/examples/jsm/csm/CSMShadowNode.js`. Used by the
 * adapter's `buildWebGpuCsm`. The constructor returns a `ShadowBaseNode`
 * instance (typed structurally here — we only consume `.camera`,
 * `.fade`, `.dispose()`).
 */
export type CsmShadowNodeCtor = new (
  light: { shadow: { shadowNode?: unknown }; isDirectionalLight?: boolean },
  data?: {
    cascades?: number;
    maxFar?: number;
    mode?: "practical" | "uniform" | "logarithmic" | "custom";
    lightMargin?: number;
  }
) => {
  camera: unknown;
  fade: boolean;
  dispose?: () => void;
};

/**
 * Opaque handle to a TSL color/vec3 node — produced by the `color()`
 * factory. We don't need the internal node structure here; treat it as
 * an opaque token that can be multiplied with other nodes.
 */
export type TslColorNode = {
  mul: (other: TslColorNode) => TslColorNode;
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
  /**
   * TSL `color()` factory. Accepts any of the same inputs three.js's
   * `Color` constructor accepts (hex string, hex number, r/g/b triple)
   * and returns an opaque color-vec3 node that participates in TSL
   * `.mul()`, `.add()`, `.mix()` etc.
   */
  color: (input: string | number) => TslColorNode;
  /**
   * S76 WEBGPU-csm. `CSMShadowNode` constructor — loaded together with
   * the rest of the WebGPU module so `buildWebGpuCsm` can construct +
   * assign the shadow node SYNCHRONOUSLY, BEFORE the host
   * DirectionalLight enters the scene graph. Previous attempts to
   * lazy-load it (S74 / S75) had a race: three.js bakes the lighting
   * TSL graph the first time a material samples the light, and by the
   * time the async load resolved the graph was already cached without
   * the cascade-shadow path → shadows weak.
   */
  CSMShadowNode: CsmShadowNodeCtor;
};

let cached: Promise<WebGpuModule> | undefined;

export function loadWebGpuModule(): Promise<WebGpuModule> {
  if (cached === undefined) {
    // `three/webgpu` exposes WebGPURenderer + PMREM + CubeRenderTarget +
    // node materials. The TSL factories (`reflector()`, `color()`) live
    // in the separate `three/tsl` entrypoint as of r0.184. CSMShadowNode
    // ships in `three/examples/jsm/csm/CSMShadowNode.js` and depends on
    // both. Load all three in parallel so any code path that needs them
    // gets them synchronously after `adapter.init()` resolves.
    cached = Promise.all([
      import("three/webgpu"),
      import("three/tsl"),
      import("three/examples/jsm/csm/CSMShadowNode.js")
    ]).then(([webgpuMod, tslMod, csmMod]) => {
      const w = webgpuMod as unknown as {
        WebGPURenderer: typeof WebGPURenderer;
        PMREMGenerator: typeof PMREMGenerator;
        CubeRenderTarget: typeof CubeRenderTarget;
        MeshBasicNodeMaterial: typeof MeshBasicNodeMaterial;
      };
      const t = tslMod as unknown as {
        reflector: WebGpuModule["reflector"];
        color: WebGpuModule["color"];
      };
      const csm = csmMod as unknown as { CSMShadowNode: CsmShadowNodeCtor };
      return {
        WebGPURenderer: w.WebGPURenderer,
        PMREMGenerator: w.PMREMGenerator,
        CubeRenderTarget: w.CubeRenderTarget,
        MeshBasicNodeMaterial: w.MeshBasicNodeMaterial,
        reflector: t.reflector,
        color: t.color,
        CSMShadowNode: csm.CSMShadowNode
      };
    });
  }
  return cached;
}

// S76 — CsmShadowNodeCtor merged into the main WebGpuModule loader so
// buildWebGpuCsm can construct + assign synchronously. `loadCsmShadowNode`
// helper removed; callers use `webGpuModule.CSMShadowNode`.
