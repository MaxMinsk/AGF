# Backlog

Date: 2026-05-16 (Sprint 59 archived)

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

## Current Sprint: Sprint 60 — WebGPU spike + measurement

Spike to answer: should AGF's renderer plan to migrate from `WebGLRenderer` to `WebGPURenderer`? Three.js's WebGPU path is no longer experimental on paper (every major browser shipped it stable by 2025) but is still tied to the node-material / TSL system, which is structurally different from AGF's current GLSL + `onBeforeCompile` patches. The point of this sprint is to get **real FPS / draw-call / gpuMs numbers** before committing the engine to the migration, not to ship a fully-integrated WebGPU adapter.

Sprint deliverable: a `docs/research/m21-webgpu-spike.md` write-up with measured numbers + a recommendation on whether (and how) the WebGPU adapter should land in a follow-up sprint.

### Stories

1. **WEBGPU-comparison-page** — standalone three.js comparison harness at `tests/manual/webgpu-vs-webgl/`. Same scene (N boxes, M spheres, a directional light, a ground plane, optional shadow-casting toggle), one HTML page that switches renderer via `?renderer=webgl|webgpu`. Per-frame on-screen FPS counter + `__webgpuSpike` global with running averages. Status: Implemented.
2. **WEBGPU-measure-script** — `scripts/perf-probe-webgpu.mjs` drives the comparison page at light/medium/heavy/extreme complexity under both renderers, dumps to `docs/research/perf/webgpu-spike-*.json`. `--headed` + `--no-vsync` flags for real-hardware uncapped runs. Status: Implemented.
3. **WEBGPU-feature-audit** — table of every AGF render feature vs WebGPU support, included as a section in `docs/research/m21-webgpu-spike.md`. Three states (✅ works / ⚠️ needs rewrite / ❌ no equivalent). 14 features as-is, 11 cleanup, 4 full rewrites (post-passes, PCSS, GPU timer, CSM). Status: Implemented.
4. **WEBGPU-adapter-sketch** — `docs/research/m21-webgpu-adapter-sketch.md`. Lays out the `RenderAdapter` interface extraction, `WebGpuRenderAdapter` sibling class, capability flags, adapter selection from `project.json#render.mode`, and the backwards-compat strategy. Not an implementation. Status: Implemented.
5. **WEBGPU-research-writeup** — `docs/research/m21-webgpu-spike.md` with measurement numbers + realistic-workload calibration + feature audit + recommendation (opt-in S61, default-flip S65). Status: Implemented.
6. **PERF-renderer-info-renderer-kind** — `AdapterInfo.renderer: "webgl" | "webgpu"` + `__agf.rendererInfo().renderer` + propagated through `three-renderer.ts.info()` + `src/app.ts` typed surface + `src/main.ts` `__agf` typing. Today always `"webgl"`; flips when `WebGpuRenderAdapter` ships. Status: Implemented.
7. **DOCTOR-webgpu-readiness** — `engine doctor` `WebGPU readiness:` section lists declared `render.mode` + features that block migration (post-passes, CSM, reflection probes, planar mirrors). Walks `project.json` + every `scenes/**/*.scene.json`. Status: Implemented.
8. **DOCS-webgpu-skill** — `docs/agent/skills/webgpu-rendering.md` with current status, wins/blockers summary, roadmap, doctor surface, pitfalls. Status: Implemented.
9. **BASELINE-rebench-pre-webgpu** — re-run `perf-probe-shadows` + `perf-probe-batching` on current main, snapshot baseline numbers. Status: Deferred to Sprint 61 — the WebGPU adapter doesn't land until S61, so the comparison anchor isn't needed before then.
10. **HIGH_LEVEL-update-webgpu** — `HIGH_LEVEL_BACKLOG.md` M21 row records the S60 spike results and promotes `M21-webgpu-adapter` from parked to the active phase-2 remaining work (S61 → S65 sequencing). Status: Implemented.
11. **WEBGL-stutter-investigation** — user reports micro-stutters on hello-3d at 60 Hz. Profiled with playwright harness: JS frame work = 0.47 ms, render = 0.29 ms, dt = 16.7 ms — engine takes 3 % of vsync budget, stutters are vsync-boundary scheduling jitter not engine work. Concrete fix: `applyCanvasSize()` was running `renderer.resize()` + `composer.setSize()` + `camera.updateProjectionMatrix()` every frame regardless of whether the canvas actually changed; now short-circuits on (width, height) match. After fix: stutter rate 4.67 % → 3.78 %, p99 19.4 ms → 18.7 ms. Remaining ~3.8 % is V8 GC + browser compositor jitter, structurally addressed by the WebGPU migration (S60 spike confirms WebGPU's p99/p50 ratio is half of WebGL's at light/medium load). Status: Implemented.

### Out of scope (Sprint 60)

- Actual `WebGpuRenderAdapter` implementation — that's a follow-up sprint *if* this spike's recommendation is "go". Sketch only here.
- Migrating any existing project (hello-3d / material-bench / shadows-bench) to WebGPU. The spike is a standalone harness.
- Compute-shader work (particle physics on GPU, terrain GPGPU, skinning) — those become interesting *after* the WebGPU adapter lands and is the place where WebGPU's real win shows up.
- SSR / BPCEM / LightProbeGrid — same as S58/S59 out-of-scope.

## Next Sprint (placeholder)

To be detailed at S60 close. If the spike recommends "go": Sprint 61 will be the WebGPU adapter implementation. If "defer": pick up the parked S60-perf-cleanup-followups plan (`M17-batched-glb`, `BATCH-BENCH-bvh-stress`, `M16-cache-e`, `render-pool-caller-migration`, `DOCTOR-reflection-runtime`, `M21-shadow-soft` re-eval).
