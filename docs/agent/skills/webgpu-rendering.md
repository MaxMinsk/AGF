# Skill: webgpu-rendering

## Trigger

Use when an AGF user / agent is considering WebGPU, asks how to switch a project to it, or is investigating renderer-level perf where WebGPU might be relevant. Pair with [`vfx-authoring.md`](vfx-authoring.md) for the renderer features themselves and [`perf-tuning.md`](perf-tuning.md) for general FPS work.

## Current status (Sprint 70)

- **AGF ships an opt-in WebGPU adapter.** Set `project.json#render.mode: "webgpu"` and the runtime creates `WebGPURenderer` from `three/webgpu` instead of `WebGLRenderer`. Default stays `"webgl"`.
- **5 of 9 example projects are on WebGPU**: `webgpu-spike`, `webgpu-light-test`, `hello-3d`, `physics-bench`, `beacon-world`. The remaining four (`material-bench`, `shadows-bench`, `water-bench`, `batch-bench`) are blocked on upstream three.js issues or the in-progress bucket port — see the deferred list below.
- `__agf.rendererInfo().renderer` returns `"webgl"` or `"webgpu"` so probes / overlays / dev-bridge clients can branch.
- `__agf.rendererInfo().gpuMs` is populated on **both** renderers (S70: WebGPU via `GPUQuerySet { type: "timestamp" }` + throttled `resolveTimestampsAsync`, undefined on devices without the feature).
- **Auto-fallback to WebGL**: opening a `mode: "webgpu"` project in a browser without `navigator.gpu` now warns and falls back to WebGL instead of black-screening (S68).
- **Three.js's WebGPURenderer has its own WebGL2 fallback backend.** Headless CI / older browsers stay on WebGL2 transparently — smoke tests pass on either path.
- `engine doctor` reports a `WebGPU readiness:` section per project. When `mode = "webgpu"` AND the project uses a feature without a WebGPU implementation, doctor surfaces it as a recommendation.
- The standalone comparison harness lives at `tests/manual/webgpu-vs-webgl/` — open `http://localhost:5173/tests/manual/webgpu-vs-webgl/?renderer=webgl|webgpu` to see both renderers side-by-side.
- The spike numbers + integration plan: [`m21-webgpu-spike.md`](../../research/m21-webgpu-spike.md), [`m21-webgpu-adapter-sketch.md`](../../research/m21-webgpu-adapter-sketch.md).

### What works on the WebGPU adapter today

- `MeshRenderer` with built-in primitives (`box`, `sphere`, `cylinder`, `plane`).
- `MeshStandardMaterial` / `MeshPhysicalMaterial` (direct-light path).
- All light kinds: `directional`, `point`, `spot`, `ambient`, `hemisphere`, `rect-area`.
- Directional + spot shadow maps with basic PCF filtering.
- HDR + generated IBL (`scene.environment` via `three/webgpu`'s `PMREMGenerator`).
- `ReflectionProbe` + `EnvmapBinding` (S64 via `three/webgpu`'s `CubeRenderTarget`).
- Transmission (`material.transmission`) + MSAA antialias.
- Tone mapping (`aces-filmic`, `agx`, etc.) + exposure.
- Auto-fallback to WebGL when `navigator.gpu` is missing.
- `__agf.rendererInfo()` reports `renderer`, `meshes`, `lights`, `drawCalls` (per-frame on either backend), `triangles`, `gpuMs`.

### What does NOT work yet

- **Post-processing chain** (`project.render.post`: bloom / SSAO / LUT / FXAA) — **blocked upstream** in three.js r0.184. Stack-trace investigation confirmed `BloomNode`'s internal pingpong quads use vanilla `ShaderMaterial`, which `StandardNodeLibrary` doesn't have an entry for. Audit tool: `__agf.__auditMaterials()`. Tracked for upstream minor releases.
- **CSM cascade shadow maps** (`project.render.shadows.csm`) — silently skipped. Needs `CSMNode` port or upstream patch.
- **PCSS shadow algorithm** (`project.render.shadows.algorithm: "pcss"`) — silently skipped, falls back to basic. Uses `onBeforeCompile` which is WebGL-only; needs TSL rewrite.
- **`PlanarMirror`** (`three/addons/objects/Reflector.js`) — silently skipped. TSL equivalent (`ReflectorNode`) has a different API (node attaches to material, not Mesh).
- **Batching** (`InstancedMesh` + `BatchedMesh` buckets) — adapter methods return `-1` and the bucket falls back to per-entity Mesh. Set `render.batching.auto: false` in the project.json. **In-progress in S70** (stories 3 + 4 port both bucket paths to WebGPU).

### Post-processing on WebGPU — blocked upstream (S65 → S67)

S65 attempted to wire `three/webgpu` `PostProcessing` + `BloomNode` (from `three/addons/tsl/display/BloomNode.js`) into the adapter. The TSL node graph build succeeded; first frame threw `THREE.NodeBuilder: Material "ShaderMaterial" is not compatible` and rendered pure black. S67 ran a stack-trace audit (`auditMaterialClasses()` on the adapter) and confirmed the offending `ShaderMaterial` instances are **inside `BloomNode` itself** (its pingpong full-screen quads), not in AGF code. Not fixable from AGF — needs an upstream change to either swap the BloomNode quads for node materials or extend `StandardNodeLibrary` to tolerate vanilla `ShaderMaterial`.

Capability flag stays `supportsPostProcessing: false` on WebGPU. Re-test on every three.js minor release; **THREE-version-tracker** is the lightweight check to run when bumping `three`.

### Live-discovered gotchas

- **`HemisphereLight` at world origin (0, 0, 0) doesn't contribute on WebGPU (three.js r0.184).** Three.js's WebGPU `HemisphereLightNode` derives its "up" direction from the light's world position; WebGL ignores position and always uses +Y. A `HemisphereLight` placed at the origin produces a zero-length direction vector and silently emits no light. The AGF adapter forces `light.position.y = 1` for any HemisphereLight whose `y <= 0` on WebGPU (S63). Net effect: scene authors can place HemisphereLight at the origin (same shape as WebGL) and it just works on both renderers. Confirmed root cause via headed playwright probe — moving the hemisphere up by 5 units fixed the original "all materials render black" symptom; everything else was a red herring.
- **`__agf.rendererInfo().drawCalls` was reading the cumulative `info.render.calls` on WebGPU** (never reset by `Info.reset()` in r0.184 — verified). Patched to read `info.render.frameCalls` on the WebGPU path so the counter shows per-frame draws, matching WebGL semantics. If you see a `drawCalls` value monotonically growing in older builds, that's the same bug.
- **Reflection probes with `updateRate > 0` cause shadow-map flicker on moving casters (WebGPU r0.184).** When a `ReflectionProbe` has a non-zero `updateRate` (continuously re-bakes), each probe update temporarily hides the excluded entities and re-renders the scene including its shadow pass. The next main render reads a shadow map baked WITHOUT the probe owner — visible as a per-frame flicker under animated casters. **Fix:** use `updateRate: 0` (bake-once) when the probe is on a moving caster, or move the caster out of the shadow path. Engine-side proper fix needs separated shadow-pass + probe-pass timing, tracked for a future sprint. (Pure-WebGL spike with the same setup doesn't flicker because WebGL re-bakes shadows in a different phase order.)

The doctor section flags every feature the project uses that doesn't have a WebGPU implementation; check before opting in.

## Why an agent / user might want WebGPU

The spike measurements show two consistent wins at AGF's realistic workloads (100–500 draws):

1. **Higher uncapped fps** — +34 % at medium (400 draws), +278 % at light (100 draws). Visible only if vsync is disabled or you have a > 60 Hz monitor.
2. **Lower frame-time variance** — p99 / p50 ratio drops from ~3.6× (WebGL) to ~2.0× (WebGPU) at light/medium. **This is what fixes the "small podergivanija" stutter feel** at 60 Hz — fewer frames mis-time the vsync window.

The compute-shader story (GPU-side skinning, particle physics, terrain GPGPU) only becomes relevant after the basic adapter ships. AGF has no compute-shader code today.

## Why NOT to migrate yet

- **Post-processing is upstream-blocked** — any project that uses `project.render.post` (bloom / SSAO / LUT / FXAA) can't migrate until three.js fixes `BloomNode`'s pingpong quads.
- **Batching is a stub on WebGPU** — `InstancedMesh` / `BatchedMesh` buckets return `-1` until S70's port lands. Projects that depend on auto-batching (`batch-bench`, `material-bench`'s outer ring) should wait.
- **CSM cascade shadow maps and PCSS** aren't ported — `shadows-bench`-style projects stay on WebGL.
- **`PlanarMirror`** isn't available — `water-bench` stays on WebGL.

For projects that don't touch any of the above (primitives + standard materials + direct lights + basic shadows + IBL + reflection probes), WebGPU is now the recommended path.

## How to opt-in

```jsonc
// examples/<project>/project.json
"render": {
  "mode": "webgpu",
  "batching": { "auto": false },  // until S70 bucket port lands
  "color": { "toneMapping": "aces-filmic", "exposure": 1.0 }
  // Avoid `post`, `shadows.csm`, `shadows.algorithm: "pcss"`, planar mirrors —
  // those silently skip on WebGPU. Doctor will flag them.
}
```

The runtime `await`s `WebGPURenderer.init()` (asks for `GPUAdapter` + `GPUDevice`) before the first frame draws. If `navigator.gpu` is absent, the adapter warns and falls back to WebGL automatically (S68); apps that *require* WebGPU should check `__agf.rendererInfo().renderer === "webgpu"` after boot.

## Roadmap (read-only here; canonical in `HIGH_LEVEL_BACKLOG.md`)

| Sprint | Goal |
| --- | --- |
| S60 | Spike + research + adapter sketch. ✅ |
| S61 | Adapter core path — mesh / light / shadow / transmission. ✅ |
| S62 | HDR + generated IBL via `three/webgpu` PMREMGenerator. ✅ |
| S63 | Five-light diagnostic project + HemisphereLight position fix. ✅ |
| S64 | Reflection probes + WebGPU `CubeRenderTarget`. ✅ |
| S65–67 | Post-processing port attempt → blocked upstream (BloomNode pingpong ShaderMaterial). |
| S68 | Auto-fallback policy + migrate `hello-3d` + `physics-bench`. ✅ |
| S69 | Migrate `beacon-world` (gameplay + persistence on WebGPU). ✅ |
| S70 (this sprint) | GPU timer (`GPUQuerySet`), lazy-import of `three/webgpu`, InstancedMesh + BatchedMesh bucket port → unblocks `batch-bench`. |
| Future | CSMNode port + PCSS TSL rewrite + ReflectorNode integration; default-flip once 6+ examples are clean. |

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

- `project.render.mode` (`webgl`, `webgpu`, or `unspecified`).
- Features the project uses that don't have a WebGPU equivalent yet (post-passes, CSM, planar mirrors).

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
