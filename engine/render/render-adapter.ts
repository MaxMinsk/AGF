// S61 RENDER-adapter-interface. The shared contract any render adapter
// must implement, plus the capability flags systems use to gate optional
// features (post-processing, CSM, PCSS, reflection probes, planar
// mirrors, GPU timer) that don't yet have WebGPU equivalents in
// three.js r0.184.
//
// Today there's a single class — `ThreeRenderAdapter` — that flips
// between WebGLRenderer and WebGPURenderer based on its constructor
// `mode` argument and exposes the appropriate capability set. The
// interface is the source of truth for "what every system can rely on";
// methods outside this interface (legacy or feature-specific helpers
// added directly to the class) require a capability check before being
// called from generic system code.

export type RenderAdapterKind = "webgl" | "webgpu";

export type RenderAdapterCapabilities = {
  readonly kind: RenderAdapterKind;
  /** S54 RUNTIME-gpu-timing — WebGL2 `EXT_disjoint_timer_query` path. WebGPU equivalent via `GPUQuerySet` is parked. */
  readonly supportsGpuTimer: boolean;
  /** M21-shadow-csm — three.js `CSM.js` is WebGL-only; CSMNode equivalent on WebGPU is parked. */
  readonly supportsCsm: boolean;
  /** M21-shadow-pcss — GLSL chunks via `onBeforeCompile`; no equivalent on WebGPU. */
  readonly supportsPcss: boolean;
  /** S57 POST-pipeline — `EffectComposer` chain (SSAO / Bloom / LUT / FXAA). WebGL: full chain. WebGPU: still no support until the AGF render setup ports off `ShaderMaterial` (the `PostProcessing` TSL node graph rejects vanilla `ShaderMaterial` — affects PMREM RoomEnvironment + shadow MeshDepthMaterial paths). */
  readonly supportsPostProcessing: boolean;
  /** S57 REFLECTION-cube-probe — `CubeCamera` + `WebGLCubeRenderTarget`. WebGPU equivalent is parked. */
  readonly supportsReflectionProbe: boolean;
  /** S59 REFLECTION-planar — `Reflector.js`. WebGPU `ReflectorNode` is parked. */
  readonly supportsPlanarMirror: boolean;
  /** S57 ASSET-textures-via-registry — uses three.js public material API; works on both renderers. */
  readonly supportsTextureBinding: boolean;
};

export const WEBGL_CAPABILITIES: RenderAdapterCapabilities = {
  kind: "webgl",
  supportsGpuTimer: true,
  supportsCsm: true,
  supportsPcss: true,
  supportsPostProcessing: true,
  supportsReflectionProbe: true,
  supportsPlanarMirror: true,
  supportsTextureBinding: true
};

export const WEBGPU_CAPABILITIES: RenderAdapterCapabilities = {
  kind: "webgpu",
  supportsGpuTimer: false,
  supportsCsm: false,
  supportsPcss: false,
  supportsPostProcessing: false,
  // S64 WEBGPU-reflection-probe: shipped — `CubeRenderTarget` from
  // `three/webgpu` paired with `CubeCamera` runs through the WebGPU
  // pipeline; PMREM prefilter already wired via S62.
  supportsReflectionProbe: true,
  // S72 WEBGPU-planar-mirror: shipped — adapter routes
  // `acquirePlanarMirror` through TSL `reflector()` +
  // `MeshBasicNodeMaterial` on the WebGPU path.
  supportsPlanarMirror: true,
  supportsTextureBinding: true
};
