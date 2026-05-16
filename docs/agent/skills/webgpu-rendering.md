# Skill: webgpu-rendering

## Trigger

Use when an AGF user / agent is considering WebGPU, asks how to switch a project to it, or is investigating renderer-level perf where WebGPU might be relevant. Pair with [`vfx-authoring.md`](vfx-authoring.md) for the renderer features themselves and [`perf-tuning.md`](perf-tuning.md) for general FPS work.

## Current status (Sprint 60)

- AGF runs exclusively on `WebGLRenderer` today. There is no `WebGpuRenderAdapter` yet — the spike data lives in [`docs/research/m21-webgpu-spike.md`](../../research/m21-webgpu-spike.md) and the integration plan in [`docs/research/m21-webgpu-adapter-sketch.md`](../../research/m21-webgpu-adapter-sketch.md).
- `project.json#render.mode` is reserved for `"webgl" | "webgpu"` (today only `"webgl"` is accepted). `__agf.rendererInfo().renderer` already returns `"webgl"` so probes can branch when the adapter ships.
- `engine doctor` reports a `WebGPU readiness:` section listing features in a project that block a hypothetical WebGPU migration (post-processing passes, CSM, reflection probes, planar mirrors).
- The standalone comparison harness lives at `tests/manual/webgpu-vs-webgl/` — open `http://localhost:5173/tests/manual/webgpu-vs-webgl/?renderer=webgl` or `?renderer=webgpu` to see both renderers side-by-side.

## Why an agent / user might want WebGPU

The spike measurements show two consistent wins at AGF's realistic workloads (100–500 draws):

1. **Higher uncapped fps** — +34 % at medium (400 draws), +278 % at light (100 draws). Visible only if vsync is disabled or you have a > 60 Hz monitor.
2. **Lower frame-time variance** — p99 / p50 ratio drops from ~3.6× (WebGL) to ~2.0× (WebGPU) at light/medium. **This is what fixes the "small podergivanija" stutter feel** at 60 Hz — fewer frames mis-time the vsync window.

The compute-shader story (GPU-side skinning, particle physics, terrain GPGPU) only becomes relevant after the basic adapter ships. AGF has no compute-shader code today.

## Why NOT to migrate yet

- **No WebGPU adapter implementation** — there is nothing to opt into. Story-level work lands in S61 + S62 + S63 under the `M21-webgpu-adapter` epic.
- **40 % of AGF's render surface needs porting** to WebGPU equivalents — post-processing chain (Bloom/SSAO/LUT/FXAA), CSM cascade shadow maps, PCSS shader patches (`onBeforeCompile`), reflection probe cube-camera path, planar mirror Reflector, GPU timer (`EXT_disjoint_timer_query` → `GPUQuerySet`).
- **Three.js's WebGPU backend regresses at high draw counts** (1200+ draws) in r0.184 — currently 30 % *slower* than WebGL there. Three.js is closing the gap each minor; we re-bench per release.
- **The default flip is planned for S65** — until then, opting into webgpu means losing post-processing on any project that uses it.

If you're an agent helping a user pick a renderer today, the answer is: **WebGL, default**. The migration plan is in place; users don't need to make a choice yet.

## Roadmap (read-only here; canonical in `HIGH_LEVEL_BACKLOG.md`)

| Sprint | Goal |
| --- | --- |
| S60 (this sprint) | Spike + research + adapter sketch (no implementation). |
| S61 | `RenderAdapter` interface extract + `WebGpuRenderAdapter` core path (mesh / light / shadow / transmission). Opt-in via `project.render.mode = "webgpu"`. |
| S62 | Port post-processing chain (Bloom / SSAO / LUT / FXAA) onto WebGPU `PostProcessing`. |
| S63 | Port CSM (`CSMNode`), PCSS (TSL rewrite), reflection probes (`WebGPUCubeRenderTarget`), planar mirror (`ReflectorNode`), GPU timer (`GPUQuerySet`). |
| S64 | Re-bench, fix three.js WebGPU regressions, migrate every example to opt-in webgpu. |
| S65 | Default-flip: `webgpu` becomes the default, `webgl` becomes the legacy explicit opt-in. |

## Reading `__agf.rendererInfo().renderer`

```ts
const info = window.__agf.rendererInfo();
if (info.renderer === "webgpu") {
  // info.drawCalls counts differently — per command-buffer rather than per
  // mesh draw. Don't compare 1:1 with webgl counts.
} else {
  // webgl path — drawCalls is per-mesh, as documented.
}
```

## Doctor section

`engine doctor <projectDir>` includes a `WebGPU readiness:` block per project. It lists:

- `project.render.mode` (today always reads `webgl` or `unspecified`).
- Features the project uses that don't have a WebGPU equivalent yet (post-passes, CSM, reflection probes, planar mirrors).

Run before considering an opt-in to see what would break.

## Pitfalls

- **`init()` is async on `WebGPURenderer`**. Today's `ThreeRenderAdapter` constructor is synchronous. Once `WebGpuRenderAdapter` ships, the runtime will `await adapter.init()` before the first render. Don't try to call `acquireMesh` etc. before init resolves.
- **`info.render.calls` doesn't mean the same thing across renderers.** WebGPU counts at command-buffer granularity; WebGL counts per draw. Trends are still valid; absolute thresholds are not.
- **`onBeforeCompile` doesn't exist on WebGPU.** Any GLSL shader patch (PCSS, custom uniforms, CSM injection) needs a TSL node-material rewrite. Don't bring patches from a WebGL project into a WebGPU project verbatim.
- **`EffectComposer` ≠ WebGPU `PostProcessing`**. Different module path (`three/addons/postprocessing/PostProcessing.js`), different pass API. The classic composer pipeline does NOT work on WebGPURenderer.
- **`outputBufferType: HalfFloatType` on WebGPU** adds an extra colour-format conversion at the end. If the project doesn't need HDR output, opt back to `UnsignedByteType` to save the conversion.

## Verification

- Spike numbers and methodology: `docs/research/m21-webgpu-spike.md`.
- Integration plan: `docs/research/m21-webgpu-adapter-sketch.md`.
- Reproduce measurements: `npm run dev` + `node scripts/perf-probe-webgpu.mjs --headed --no-vsync`.
- Comparison page: `http://localhost:5173/tests/manual/webgpu-vs-webgl/?renderer=webgl|webgpu`.
