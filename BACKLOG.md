# Backlog

Date: 2026-05-16 (Sprint 60 archived)

This file contains only the currently active detailed sprint work and the next detailed sprint. Keep broad roadmap items in `HIGH_LEVEL_BACKLOG.md`. Move completed sprint details to `BACKLOG_ARCHIVE.md` at sprint close.

## Repository Scope

This folder is the public repository root for the engine.

Example games live inside this repo as nested projects under `examples/`. The main dogfood sample game will be `examples/beacon-world/` when implementation reaches that point.

## Backlog Hygiene

- `HIGH_LEVEL_BACKLOG.md` tracks roadmap epics, parking-lot ideas and coarse priorities.
- `BACKLOG.md` tracks only the active detailed sprint and the next detailed sprint.
- `BACKLOG_ARCHIVE.md` stores completed sprint summaries and links to shipped artifacts.
- At sprint close, move completed sprint details out of `BACKLOG.md` and into `BACKLOG_ARCHIVE.md`.
- Do not let completed stories accumulate in the active backlog.
- Keep story text short enough for agents to load quickly.
- Each story should include tasks, acceptance criteria and verification.
- Documentation, code comments, identifiers, diagnostics and in-app text must be English.

## Next Sprint candidates

- **M21-shadow-map-size-real-hw** — `m21-shadows-bench-perf.md` measured shadowMapSize 1024 → 512 at only −3.8 % renderMs in headless software-WebGL. Real GPUs care a lot more about shadow-map fill rate + VRAM bandwidth. Re-run `scripts/perf-probe-shadows.mjs --only baseline,512map,2048map` on the user's machine. **User-driven** — agent doesn't run this.
- **DSS-move-then-stop-probe** — the S53 BEACON measurement showed 0 % saving in idle-only sampling because the fixed DSS only takes over after real movement. Write a probe that records idle → move → stop → idle and samples each phase; the "stopped after a move" phase is where the saving actually lands.
- **M17-static-merge-spike** — static geometry merge with reverse `EntityId` lookup for picking. Strictly opt-in per-entity (`StaticMerge` tag). Deferred until a 10k+ static-prop project asks.
- **M21-shadow-soft** — re-evaluate `PCFSoftShadowMap` vs `PCFShadowMap` vs `VSMShadowMap` once three.js stabilises soft shadows.
- **M21-shadow-glb-acne** — self-shadow polish on low-poly GLB meshes.
- **M21-webgpu-spike** — async WebGPU renderer adapter behind a profile flag.
- **M16-cache-e** — reusable matrices / pooled scratch buffers inside the LTW cache layer.
- **render-pool-caller-migration** — retire the per-kind adapter pool methods now that `acquirePool` dispatches uniformly.
- **M17-batched-glb** — thread AssetRegistry through `updateBatched` so GLB references work inside batched buckets too.
- **BATCH-BENCH-bvh-stress** — narrow-camera scenario knob for `batch-bench` so the BVH crossover can be measured live.
- **REFLECTION-planar** — `three/addons/objects/Reflector.js` vendored helper for planar mirrors (water, lobby floor).
- **POST-bloom** — worked example for bloom post-pass + tuner.
- **M20-a..l** — netcode rework (carried from Sprint 32). Own sprint.
- **M2b-seed**, **13.13** audio, **10.5+** C# WS transport.

## Current Sprint: Sprint 61 — WebGPU adapter core (opt-in path)

S60 spike landed the verdict: WebGPU is decisively better at AGF's realistic workloads (+34 % fps medium, +278 % fps light, p99/p50 variance 3.6× → 2.0×). Now we ship the actual `WebGpuRenderAdapter` as an opt-in renderer, gated by `project.json#render.mode: "webgpu"`. Existing projects keep using WebGL; only `examples/webgpu-spike-project/` opts in for the smoke trail. Sequence is the S61 → S65 plan from the adapter sketch: this sprint = core path only (mesh / light / shadow / transmission). Post-passes / CSM / PCSS / probes / mirror port land S62–S63.

### Stories

1. **RENDER-adapter-interface** — extract `RenderAdapter` interface from current `ThreeRenderAdapter` (`engine/render/render-adapter.ts`). Define `RenderAdapterCapabilities` flags (kind / supportsCsm / supportsPcss / supportsPostProcessing / supportsPlanarMirror / supportsReflectionProbe / etc.). `ThreeRenderAdapter` moves to `engine/render/webgl/three-render-adapter.ts` (just file relocation + `implements RenderAdapter` + capabilities = `{ kind: "webgl", … }`); systems re-import from the interface. Status: Not yet implemented.
2. **WEBGPU-adapter-core** — new `engine/render/webgpu/webgpu-render-adapter.ts` implementing `RenderAdapter` via `WebGPURenderer` from `three/webgpu`. Core path only: mesh / light / shadow / transmission / MSAA / InstancedMesh / BatchedMesh / `MeshStandardMaterial`. Capability flags expose post-processing / CSM / PCSS / probe / mirror as `false` for now; systems that need those become no-ops on the WebGPU adapter. Status: Not yet implemented.
3. **WEBGPU-init-async** — start.ts awaits `adapter.init()` before the first `acquireMesh` / draw. `WebGPURenderer.init()` is async (asks for `GPUAdapter` + `GPUDevice`); the runtime's start path becomes async-aware. Status: Not yet implemented.
4. **RENDER-mode-schema** — `project.json#render.mode: "webgl" | "webgpu"` (already a reserved field; expand schema to accept both values). Default stays `webgl`. Adapter selection from project meta. Status: Not yet implemented.
5. **WEBGPU-spike-project** — new `examples/webgpu-spike/` (hello-3d clone, no Spin or anything cute) that sets `render.mode: "webgpu"`. Registered with the project switcher. Continuously-running smoke that catches three.js WebGPU regressions between minor versions. Status: Not yet implemented.
6. **WEBGPU-rendererinfo-flip** — `WebGpuRenderAdapter.info()` returns `renderer: "webgpu"` plus correct `drawCalls` (read `frameCalls` or `drawCalls`, not the cumulative `calls`). `__agf.rendererInfo().renderer` flips for the opt-in project. Status: Not yet implemented.
7. **BASELINE-rebench-pre-webgpu** (carried from S60) — run `perf-probe-shadows` + `perf-probe-batching` on current main, snapshot baseline numbers under `docs/research/perf/baseline-{date}.json`. Then re-run on the new WebGPU spike project at sprint close so we have a same-machine WebGL vs WebGPU comparison anchor for the doctor / writeup. Status: Not yet implemented.
8. **WEBGPU-renderer-import-boundary** — extend `tests/unit/renderer-import-boundary.test.ts` to allow `three/webgpu` from `engine/render/webgpu/**` only. Keep `engine/core` clean of WebGPU + node-material imports. Status: Not yet implemented.
9. **DOCS-webgpu-skill-update** — `docs/agent/skills/webgpu-rendering.md` flips from "no adapter yet" to "adapter shipped (opt-in)" + records how to opt-in + lists the remaining feature gaps (post-passes, CSM, PCSS, probes, mirror). Status: Not yet implemented.
10. **DOCTOR-webgpu-readiness-actionable** — extend the doctor section so when a project declares `render.mode: "webgpu"` AND uses an unsupported feature, it's an error not just a warning. Status: Not yet implemented.
11. **WEBGPU-e2e-smoke** — Playwright smoke test that loads `?project=webgpu-spike`, asserts the canvas renders, asserts `__agf.rendererInfo().renderer === "webgpu"`, asserts zero console errors. Tagged `[smoke]`. Status: Not yet implemented.

### Out of scope (Sprint 61)

- **Post-processing chain on WebGPU** (Bloom / SSAO / LUT / FXAA) — S62. The composer rewrite onto `three/addons/postprocessing/PostProcessing.js` is its own sprint.
- **CSM, PCSS, reflection probes, planar mirror on WebGPU** — S63. Each has feature gaps in three.js's WebGPU backend.
- **`GpuTimer` on WebGPU** — needs a `WebGpuTimer` wrapping `GPUQuerySet` timestamp queries. Lands when the post-processing port stabilises (S62 or S63).
- **Migrating existing projects** to WebGPU — S64. Until the feature gap closes, only `webgpu-spike` opts in.
- **Default flip** — S65. After re-bench + every example migrated.

## Next Sprint (placeholder)

To be detailed at S61 close. Likely S62 = WebGPU post-processing chain port (Bloom / SSAO / LUT / FXAA onto `three/addons/postprocessing/PostProcessing.js`). If S61 reveals blocking three.js WebGPU regressions, S62 might pivot to upstream PRs / version pinning + the parked `M17-batched-glb` / `M16-cache-e` cleanup stories.
