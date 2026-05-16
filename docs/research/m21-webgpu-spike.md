# M21 — WebGPU spike (Sprint 60)

Captured: 2026-05-16. Sources: `tests/manual/webgpu-vs-webgl/` (comparison harness), `scripts/perf-probe-webgpu.mjs` (playwright measurement), `docs/research/perf/webgpu-spike-*.json` (raw numbers).

## Question

Should AGF's renderer plan to migrate from `WebGLRenderer` to three.js's `WebGPURenderer`? If yes, on what schedule and with what scope?

## TL;DR

**Adopt as opt-in this sprint, plan to default-flip by S65.** Recommended path:

1. Sprint 61: define a `RenderAdapter` interface and land a `WebGpuRenderAdapter` supporting the *core* render path (mesh, lights, shadows, transmission, MSAA, MeshStandard / MeshPhysical, instanced + batched meshes). `project.json#render.mode: "webgl" | "webgpu"` switches between adapters; default remains `webgl` while feature parity gaps close.
2. Sprint 62–63: port the post-processing chain (Bloom, SSAO, LUT, FXAA), reflection probes, PCSS via TSL, GPU timer (`GPUQuerySet timestamp`).
3. Sprint 64–65: re-bench, then **flip default to webgpu** with `webgl` as the legacy fallback. By that point three.js will likely be r190+ with a stable WebGPU node-material API.

Why opt-in *and* default-eventual:

- **For realistic AGF workloads (100–500 draws), WebGPU is decisively better.** Light scene = +278 % fps, medium scene = +34 % fps. AGF's actual projects (material-bench ~140 draws, shadows-bench ~400–600 effective with cascades, beacon-world ~200–500) all sit in this range.
- **WebGPU smooths the stutter that motivated this spike.** Frame-time variance (p99 ÷ p50) at light/medium load: **WebGL 3.6 × — WebGPU 2.0 ×**. The "small podergivanija" complaint becomes a smoother frame curve, not just a faster average.
- **WebGPU is 30 % slower than WebGL at 1200+ draws today** — but that's pathological for AGF (10× current real workloads). Three.js's WebGPU backend optimisation is closing the high-draw-count gap each minor release; expect the crossover to land in 6–12 months.
- About 40 % of AGF's render features need rewrites (post-processing chain, PCSS shader patches, GPU timer, CSM). That's the gating work for the default flip.

## Numbers (uncapped, vsync off)

Single-render mac headed chromium 1280×720, M-series GPU. 4 s sample, first 60 frames dropped as warm-up.

| Scene (boxes + spheres + shadows on) | WebGL fps | WebGL p99 / p50 | WebGPU fps | WebGPU p99 / p50 | WebGPU vs WebGL |
| --- | --- | --- | --- | --- | --- |
| **Light** (50 + 50 = 100 props) | 499 fps | 7.9 / 2.2 ms (**3.6× spread**) | **1887 fps** | 1.0 / 0.5 ms (**2.0× spread**) | **+278 %**, smoother |
| **Medium** (200 + 200 = 400 props) | 431 fps | 7.3 / 1.9 ms (3.8× spread) | **579 fps** | 2.4 / 1.7 ms (1.4× spread) | +34 %, smoother |
| **Heavy** (600 + 600 = 1200 props) | **295 fps** | 4.2 / 3.4 ms | 204 fps | 6.2 / 4.9 ms | **−31 %**, both have small spread |

Capped (vsync on) at 60 Hz: both renderers hold 60 fps even at heavy load with comparable p99 (18.3 vs 17.9 ms). At AGF's current workloads users won't see a fps difference — they *will* see a smoothness difference at light/medium.

### Realistic workload calibration

The "heavy" scene (1200 props) is **deliberately pathological** for stress-testing — actual AGF projects sit much lower:

| AGF project | Approx. draws | Where it sits |
| --- | --- | --- |
| `hello-3d` | ~7 draws | well below "light" — WebGPU wins by huge margin (1800+ fps vs 500 fps) |
| `material-bench` | ~140 draws | between "light" and "medium" — WebGPU **+34–60 %** fps |
| `shadows-bench` | ~400–600 effective (with 3 cascades) | "medium" — WebGPU **+34 %** fps |
| `beacon-world` (gameplay) | ~200–500 draws | "medium" — WebGPU **+34 %** fps |
| `batch-bench` stress mode | up to thousands | edges into "heavy" — WebGL competitive or wins (the regime three.js's WebGPU backend will close) |

For every realistic AGF use case today, **WebGPU is meaningfully faster + meaningfully smoother**. The "heavy" regression matters only for stress benches.

Reproduce: `npm run dev` + `node scripts/perf-probe-webgpu.mjs --headed --no-vsync --seconds=5`.

### Caveat — three.js r0.184 WebGPU backend maturity

The heavy-scene regression is almost certainly three.js's WebGPU command-buffer building, not WebGPU itself. Three.js's WebGL backend has had 10+ years of optimisation (state caching, draw sorting, RenderList batching); the WebGPU backend is comparatively new (`WebGPURenderer` graduated from `WebGPURenderer_Pkg` to stable around r0.180). Expect the WebGPU side of this gap to close over the next 6–12 months as three.js's WebGPU pipeline matures. Tracking with a follow-up rebench after each three.js minor.

## Feature audit — AGF render surface vs WebGPU support

| AGF feature | Status under `WebGPURenderer` (r0.184) | Migration cost |
| --- | --- | --- |
| `MeshStandardMaterial` / `MeshPhysicalMaterial` | ✅ works as-is (node-material wrapper) | none |
| `DirectionalLight` / `PointLight` / `SpotLight` / `AmbientLight` / `HemisphereLight` | ✅ works as-is | none |
| `DirectionalLight` shadow map (`PCFShadowMap` / `PCFSoftShadowMap`) | ✅ basic shadow map works | none |
| `RectAreaLight` + `RectAreaLightUniformsLib` | ⚠️ works in WebGPU but uniforms helper is WebGL-only; needs WebGPU-specific init | low |
| Transmission (`material.transmission`) | ⚠️ supported but `transmissionResolutionScale` knob doesn't transfer 1:1 — uses different backbuffer machinery | medium |
| `EXT_disjoint_timer_query_webgl2` (our `GpuTimer`) | ❌ no equivalent — WebGPU uses `GPUQuerySet { type: "timestamp" }` with totally different API | rewrite |
| `CSM` (three.js cascade shadow maps) | ⚠️ partial — `CSM.js` is WebGL-only; needs the new `CSMNode` (still experimental) or custom rewrite | high |
| `PCSS` shadow patches via `onBeforeCompile` GLSL chunks | ❌ no `onBeforeCompile` on WebGPU; would have to ship as TSL node | rewrite |
| `EffectComposer` (post-processing chain) | ⚠️ separate `PostProcessing` class for WebGPU, different API (TSL-based passes) | high |
| `UnrealBloomPass` / `SSAOPass` / `LUTPass` / `FXAAPass` | ⚠️ have WebGPU equivalents but via different imports + node-material parameterisation | medium each |
| `GroundedSkybox` (`three/addons/objects/GroundedSkybox.js`) | ✅ works as-is (uses MeshBasicMaterial) | none |
| `Reflector` (planar mirror) | ⚠️ `ReflectorNode` exists but API differs; per-frame RTT setup needs porting | medium |
| `CubeCamera` + `WebGLCubeRenderTarget` (reflection probes) | ⚠️ `WebGPUCubeRenderTarget` exists but `cubeCam.update(renderer, scene)` may not have a clean equivalent on WebGPURenderer; needs spike | medium |
| `PMREMGenerator.fromCubemap` (probe prefilter) | ✅ `PMREMGenerator` works on both renderers | none |
| `InstancedMesh` + per-instance color | ✅ works as-is | none |
| `BatchedMesh` + BVH (`@three.ez/batched-mesh-extensions`) | ⚠️ BatchedMesh works on WebGPU; the BVH extension may have backend-specific paths — needs spike | low–medium |
| HDR via `RGBELoader` + `EquirectangularReflectionMapping` | ✅ works as-is | none |
| Tone mapping (ACES Filmic, AgX) | ✅ works as-is | none |
| MSAA (`antialias: true`) | ✅ works as-is, default `samples: 4` | none |
| `scene.background` color / texture / cubemap | ✅ works as-is | none |
| ParticleEmitter (additive `InstancedMesh`) | ✅ works as-is (S47 design uses no shader patches) | none |
| MaterialBinding `setMeshMaterialPatch({ envMap, envMapIntensity, … })` | ✅ works as-is (sets material properties via three.js public API) | none |
| Tween / Spin / WaypointMover / FollowCamera / OrbitCamera / character movement | ✅ all renderer-agnostic | none |
| `__agf.rendererInfo().drawCalls` | ⚠️ `WebGPURenderer.info.render.calls` exists but counts differently (per command buffer rather than per draw) — see harness HUD | low |
| `__agf.rendererInfo().gpuMs` (our `GpuTimer`) | ❌ no work on WebGPU until `GPUQuerySet` timestamp path is added | rewrite |

**Counts**: 14 features work as-is, 11 need cleanup / rewrites, 4 are full rewrites (GPU timer, PCSS-via-onBeforeCompile, EffectComposer chain, CSM).

## Why opt-in NOW + default LATER

The win is real and substantial — but the migration cost is concentrated in a few features that aren't ready today. Two-phase plan:

1. **Migration cost is concentrated in the post-processing path.** ~30 % of the porting work is the EffectComposer chain (SSAO / Bloom / LUT) + CSM + PCSS. Until that lands, a WebGPU project loses post-processing entirely — so making it default while half the projects need post-passes would break those projects.
2. **`onBeforeCompile`-based shader patches don't translate.** Our PCSS implementation is GLSL-patch-on-MeshStandard — the WebGPU path needs a TSL node-material rewrite.
3. **Three.js's WebGPU backend still ships breaking changes** at each minor version (r170 → r184). Pinning a stable engine default against a moving upstream is risky.
4. **The frame-time consistency win is what motivates the schedule.** The micro-stutter complaint from S60 is partly browser/compositor jitter the engine can't fix directly. WebGPU's lower per-draw overhead structurally reduces the variance — and AGF's "agent-first" angle means the engine should ship the smoother rendering path as the default once it's safe.

So: opt-in this sprint, default-flip after the feature gap closes (S65 target).

## Adapter sketch

See `docs/research/m21-webgpu-adapter-sketch.md` for the concrete integration plan. Summary: extract a `RenderAdapter` interface, factor `ThreeRenderAdapter` into a base + `WebGl…` / `WebGpu…` subclasses, gate features that don't have WebGPU equivalents with `adapter.capabilities` flags that the runtime + doctor can read.

## Recommendation

**Proceed with the opt-in path in Sprint 61.** Stories:

1. Define `RenderAdapter` interface (extract from `ThreeRenderAdapter` what's renderer-agnostic).
2. New `WebGpuRenderAdapter` class implementing the core path (mesh / light / shadow / transmission / MSAA / InstancedMesh / BatchedMesh).
3. `project.json#render.mode: "webgl" | "webgpu"` (default `webgl`). `engine doctor` warns when a project opts into webgpu but uses a feature without a WebGPU implementation.
4. `examples/webgpu-spike-project/` — clone of hello-3d that opts in, so we have a continuously-running smoke that catches three.js WebGPU regressions.
5. Cross-renderer perf bench in CI — run `scripts/perf-probe-webgpu.mjs` weekly on a known scene, alarm if WebGPU regresses > 10 % between three.js minor versions.

Then Sprint 62–63 (`M21-webgpu-feature-parity` epic):

6. Port the post-processing chain (Bloom, SSAO, LUT, FXAA) onto the WebGPU `PostProcessing` pipeline.
7. Port CSM to `CSMNode` (or fall back to single-cascade shadow map on webgpu).
8. Rewrite PCSS as a TSL node so it works in both backends.
9. Wire `GPUQuerySet` timestamp queries into a `WebGpuTimer` parallel to `GpuTimer`.
10. Port `Reflector` + `CubeCamera` (reflection probe) paths.

Sprint 64–65 (`M21-webgpu-default-flip`):

11. Default-flip: `project.render.mode` defaults to `"webgpu"`, `webgl` becomes the explicit-opt-in legacy path.
12. Migrate every example project: hello-3d, material-bench, shadows-bench, water-bench, beacon-world.
13. Update preflight + smoke tests to run under both renderers.

Do **not** migrate any existing project before Sprint 64.

## References

- Raw measurements: `docs/research/perf/webgpu-spike-2026-05-16.json` (vsync on), `docs/research/perf/webgpu-spike-uncapped.json` (vsync off).
- Adapter sketch: `docs/research/m21-webgpu-adapter-sketch.md`.
- three.js WebGPU stability tracker: `https://github.com/mrdoob/three.js/issues/28323` (renderer parity).
- The harness page: `tests/manual/webgpu-vs-webgl/` (open via dev server).
- Measurement script: `scripts/perf-probe-webgpu.mjs`.
