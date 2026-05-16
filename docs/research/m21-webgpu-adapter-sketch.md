# M21 — WebGPU adapter integration sketch

Companion to [`m21-webgpu-spike.md`](m21-webgpu-spike.md). Concrete integration plan, **not** an implementation — Sprint 61 will land the actual code.

## Today's shape

```
engine/render/
  three-render-adapter.ts   ── single class, ~2500 LOC, hardcoded WebGLRenderer
  three-renderer.ts         ── wrapper that owns the adapter + ECS-side world
  gpu-timer.ts              ── WebGL2-specific (EXT_disjoint_timer_query)
  texture-loader.ts         ── renderer-agnostic, AssetRegistry-backed
  systems/                  ── reflection-probe, planar-mirror, batching, etc.
                              all reach into ThreeRenderAdapter via concrete type
```

Every system that touches the renderer imports the concrete `ThreeRenderAdapter` and calls its methods directly. There is no abstraction layer between systems and three.js's `WebGLRenderer`.

## Target shape

```
engine/render/
  render-adapter.ts                ── interface + capabilities + types
  webgl/
    three-render-adapter.ts        ── existing class, renamed/moved, implements RenderAdapter
    webgl-gpu-timer.ts             ── current gpu-timer.ts moved
  webgpu/
    webgpu-render-adapter.ts       ── new class implementing RenderAdapter via WebGPURenderer
    webgpu-gpu-timer.ts            ── new, wraps GPUQuerySet timestamp queries
  three-renderer.ts                ── unchanged signature, picks adapter based on project.render.mode
  systems/                         ── unchanged, import RenderAdapter interface (not concrete class)
```

## RenderAdapter interface

The interface extracted from `ThreeRenderAdapter` covers the renderer-agnostic public surface that systems already call. Roughly grouped:

### Core lifecycle

```ts
interface RenderAdapter {
  readonly capabilities: RenderAdapterCapabilities;

  init(): Promise<void>;   // async on webgpu (await WebGPURenderer.init()), no-op on webgl
  resize(width: number, height: number): void;
  dispose(): void;

  draw(): void;
  info(): AdapterInfo;
}
```

`init()` becoming async is the biggest cross-cutting change. The runtime's start-up must `await adapter.init()` before the first render. Today it's synchronous; the move to `init()`-returns-Promise is the breaking change.

### Capabilities flags

```ts
interface RenderAdapterCapabilities {
  readonly kind: "webgl" | "webgpu";
  readonly supportsGpuTimer: boolean;          // true for both eventually
  readonly supportsCsm: boolean;               // webgl: true, webgpu: false until CSMNode lands
  readonly supportsPcss: boolean;              // webgl: true, webgpu: false until TSL port lands
  readonly supportsPostProcessing: boolean;    // webgl: true, webgpu: false in S61
  readonly supportsPlanarMirror: boolean;      // webgl: true, webgpu: false in S61
  readonly supportsReflectionProbe: boolean;   // webgl: true, webgpu: false in S61
  readonly supportsRectAreaLight: boolean;     // webgl: true, webgpu: limited
  readonly supportsCubemap: boolean;           // both true
  readonly supportsTransmission: boolean;      // both true
}
```

Systems that need a feature query `adapter.capabilities` before calling. `engine doctor`'s "WebGPU readiness" section walks the project's scene + project.json and lists features the active adapter doesn't support.

### Mesh / light / camera lifecycle

```ts
interface RenderAdapter {
  acquireMesh(initial: { geometry: BufferGeometry; color?: string }): MeshHandle;
  releaseMesh(handle: MeshHandle): void;
  setMeshTransform(handle: MeshHandle, world: ResolvedWorld): void;
  setMeshMaterialPatch(handle: MeshHandle, patch: MaterialPatch): void;
  // …

  acquireLight(params: LightParams): LightHandle;
  releaseLight(handle: LightHandle): void;
  setLightTransform(handle: LightHandle, world: ResolvedWorld): void;

  acquireCamera(params: CameraParams): CameraHandle;
  releaseCamera(handle: CameraHandle): void;
  setCameraParams(handle: CameraHandle, params: CameraParams): void;
  setActiveCamera(handle: CameraHandle): void;
}
```

These map 1:1 to three.js public objects (`Mesh`, `Light`, `PerspectiveCamera`) on both renderers, so the implementations diverge only in lifetime / disposal details.

### Pool API (instancing / batching)

```ts
interface RenderAdapter {
  acquirePool(spec: BucketSpec): PoolHandle;
  releasePool(handle: PoolHandle): void;
  setPoolInstance(handle: PoolHandle, slot: InstanceIndex, world: ResolvedWorld, color?: Color): void;
  removePoolInstance(handle: PoolHandle, slot: InstanceIndex): void;
}
```

`InstancedMesh` + `BatchedMesh` both work on WebGPURenderer in r0.184, so this layer is mostly straight delegation.

### Feature gates (capability-checked)

```ts
interface RenderAdapter {
  // Returns undefined when capabilities.supportsPostProcessing === false.
  setPostPipeline?(passes: ReadonlyArray<PostPassConfig> | undefined): void;

  // Returns 0 / undefined when capabilities.supportsReflectionProbe === false.
  acquireReflectionProbe?(spec: ReflectionProbeSpec): number;
  // …

  acquirePlanarMirror?(spec: PlanarMirrorSpec): number;
  // …
}
```

Optional methods on the interface. Systems either gate via `capabilities` or check `typeof method === "function"` before calling. `ReflectionProbeSystem` becomes a no-op on adapters without probe support, and `engine doctor` flags the project.

## Adapter selection

`engine/runtime/start.ts` currently calls `new ThreeRenderAdapter(options)` directly. The new shape:

```ts
const adapter: RenderAdapter =
  project.render.mode === "webgpu"
    ? new WebGpuRenderAdapter(options)
    : new ThreeRenderAdapter(options);
await adapter.init();
```

`project.json` schema gets `render.mode: "webgl" | "webgpu"`, default `webgl`.

## Backwards compatibility strategy

- Existing `engine/render/three-render-adapter.ts` keeps its public surface; the file moves to `engine/render/webgl/three-render-adapter.ts` and adds `implements RenderAdapter` + `capabilities = { kind: "webgl", … }`. Imports update.
- Systems are touched to import from `engine/render/render-adapter.ts` (the interface) rather than the concrete class. This is a mechanical rename across ~10 files.
- `__agf.rendererInfo()` returns the same shape with one new field `renderer: "webgl" | "webgpu"` (S60 Story 6 `PERF-renderer-info-renderer-kind` is the prep for this).
- All existing tests keep passing because the default stays `webgl`.

## Risks

1. **`init()` becoming async** ripples into start-up. The runtime needs to `await adapter.init()` before any `acquireMesh` or `draw` call. Boot-time tests that don't await may flake.
2. **Three.js WebGPU exports moving** — every minor release has refactored the node-material exports. Pin the three.js version per AGF release; bump deliberately.
3. **Capability-gated optional methods** add a TS-side ergonomic cost — callers either branch or assert non-null. Encapsulating in the system itself (each system handles its own capability check at register-time) keeps callers clean.
4. **Cube render-target equivalents on WebGPU** are not 1:1. Reflection probes will need a re-spike during their port (S62/S63).

## Out of scope for this sketch

- Specific TSL implementations of PCSS / CSM / post-passes — those land in their own stories.
- Per-platform fallback policy (webgpu requested but unavailable). For S61 we should fail-fast and require an explicit fallback opt-in; agents who want a fallback can wrap their bootstrap.
- WebXR support on WebGPU — orthogonal, parked.
