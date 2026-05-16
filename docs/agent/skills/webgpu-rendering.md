# Skill: webgpu-rendering

## Trigger

Use when an AGF user / agent is considering WebGPU, asks how to switch a project to it, or is investigating renderer-level perf where WebGPU might be relevant. Pair with [`vfx-authoring.md`](vfx-authoring.md) for the renderer features themselves and [`perf-tuning.md`](perf-tuning.md) for general FPS work.

## Current status (Sprint 61)

- **AGF now ships an opt-in WebGPU adapter.** Set `project.json#render.mode: "webgpu"` and the runtime creates `WebGPURenderer` from `three/webgpu` instead of `WebGLRenderer`. Default stays `"webgl"`.
- `examples/webgpu-spike/` is the canonical opt-in project — hello-3d-shaped scene (cube + sphere + cylinder + floor, sun + hemi light, spinning hero cube) that boots end-to-end on WebGPU. Use it as the template when adding WebGPU to a new project.
- `__agf.rendererInfo().renderer` returns `"webgl"` or `"webgpu"` so probes / overlays / dev-bridge clients can branch.
- `engine doctor` reports a `WebGPU readiness:` section per project. When `mode = "webgpu"` AND the project uses a feature without a WebGPU implementation, doctor surfaces it as a recommendation (revert or wait for S62 / S63 feature port).
- The standalone comparison harness lives at `tests/manual/webgpu-vs-webgl/` — open `http://localhost:5173/tests/manual/webgpu-vs-webgl/?renderer=webgl|webgpu` to see both renderers side-by-side.
- The spike numbers + integration plan: [`m21-webgpu-spike.md`](../../research/m21-webgpu-spike.md), [`m21-webgpu-adapter-sketch.md`](../../research/m21-webgpu-adapter-sketch.md).

### What works on the WebGPU adapter today (S61 core path)

- `MeshRenderer` with built-in primitives (`box`, `sphere`, `cylinder`, `plane`).
- `MeshStandardMaterial` / `MeshPhysicalMaterial` (direct-light path).
- All light kinds: `directional`, `point`, `spot`, `ambient`, `hemisphere`, `rect-area`.
- Directional + spot shadow maps with basic PCF filtering.
- Transmission (`material.transmission`) + MSAA antialias.
- Tone mapping (`aces-filmic`, `agx`, etc.) + exposure.
- `__agf.rendererInfo()` reports `renderer`, `meshes`, `lights`, `drawCalls`, `triangles`.

### What does NOT work yet (deferred to S62 / S63)

- Post-processing chain (`project.render.post`: bloom / SSAO / LUT / FXAA) — silently skipped.
- CSM cascade shadow maps (`project.render.shadows.csm`) — silently skipped.
- PCSS shadow algorithm (`project.render.shadows.algorithm: "pcss"`) — silently skipped, falls back to basic.
- `ReflectionProbe` + `EnvmapBinding` — silently skipped (no envmap).
- `PlanarMirror` (Reflector) — silently skipped (no mirror surface).
- GPU timer (`gpuMs` reading) — undefined on WebGPU until `GPUQuerySet` port lands.
- HDR / generated IBL — environment IBL is skipped because the WebGL PMREMGenerator crashes on WebGPURenderer (PMREM WebGPU port comes with reflection probes in S63).
- Batching (`InstancedMesh` + `BatchedMesh`) — adapter methods return -1 and the bucket falls back to per-entity Mesh. Set `render.batching.auto: false` in the project.json to silence the noise.

The doctor section flags every feature the project uses that doesn't have a WebGPU implementation; check before opting in.

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

## How to opt-in

```jsonc
// examples/<project>/project.json
"render": {
  "mode": "webgpu",
  "batching": { "auto": false },  // batching path falls back to per-entity Mesh until S63
  "color": { "toneMapping": "aces-filmic", "exposure": 1.0 }
  // Avoid `post`, `shadows.csm`, `shadows.algorithm: "pcss"`, `environment.kind: "hdr"` —
  // those silently skip on WebGPU. Doctor will flag them.
}
```

The runtime awaits `WebGPURenderer.init()` (asks for `GPUAdapter` + `GPUDevice`) before the first frame draws. If `navigator.gpu` is absent, the page errors out — there's no automatic fallback to WebGL today. Future stories can add a `mode: "webgpu-or-webgl"` policy.

## Roadmap (read-only here; canonical in `HIGH_LEVEL_BACKLOG.md`)

| Sprint | Goal |
| --- | --- |
| S60 | Spike + research + adapter sketch (no implementation). ✅ |
| S61 (this sprint) | Adapter core path shipped — mesh / light / shadow / transmission / spike project. ✅ |
| S62 | Port post-processing chain (Bloom / SSAO / LUT / FXAA) onto WebGPU `PostProcessing`. |
| S63 | Port CSM (`CSMNode`), PCSS (TSL rewrite), reflection probes + PMREM (`WebGPUCubeRenderTarget`), planar mirror (`ReflectorNode`), GPU timer (`GPUQuerySet`), HDR IBL. |
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
