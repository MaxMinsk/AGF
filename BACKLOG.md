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

1. **WEBGPU-comparison-page** — standalone three.js comparison harness at `tests/manual/webgpu-vs-webgl/`. Same scene (N boxes, M spheres, a directional light, a ground plane, optional shadow-casting toggle), one HTML page that switches renderer via `?renderer=webgl|webgpu`. Per-frame on-screen FPS counter + `__webgpuSpike` global with running averages. Status: Not yet implemented.
2. **WEBGPU-measure-script** — playwright-based measurement: load the comparison page under each renderer at three scene complexities (light / medium / heavy), sample ~5 seconds of stable FPS, dump JSON to `docs/research/perf/webgpu-spike-{date}.json`. Status: Not yet implemented.
3. **WEBGPU-feature-audit** — markdown table of every AGF render feature (CSM, PCSS, EffectComposer + SSAO/LUT/Bloom/FXAA, GroundedSkybox, Reflector, CubeCamera + ReflectionProbe + PMREM, EXT_disjoint_timer_query, BatchedMesh + BVH, MeshStandardMaterial `onBeforeCompile` patches, etc) vs WebGPU support in three.js r184. Three states: works as-is / works with rewrite / no equivalent. Status: Not yet implemented.
4. **WEBGPU-adapter-sketch** — design-doc draft of how a `WebGpuRenderAdapter` would slot in alongside the existing `ThreeRenderAdapter`. Goes under `docs/research/m21-webgpu-adapter-sketch.md`. NOT an implementation — just the integration plan + ADR-draft pointer (eventually ADR-0014 if the spike says go). Status: Not yet implemented.
5. **WEBGPU-research-writeup** — `docs/research/m21-webgpu-spike.md`. Bundles the measurement numbers from Story 2 + the feature audit from Story 3 + the adapter sketch from Story 4 + a recommendation: ship now / spike-only / defer to vN. Status: Not yet implemented.
6. **PERF-renderer-info-renderer-kind** — `__agf.rendererInfo().renderer` reports `"webgl" | "webgpu"` so future probes can branch on which renderer is active. Today's adapter is always webgl; the field is a small forward-compat hook. Status: Not yet implemented.
7. **DOCTOR-webgpu-readiness** — `engine doctor` scans a project's features (post-passes, reflection probes, planar mirrors, PCSS, etc.) and prints a `WebGPU readiness:` section listing what would need to be re-authored. No hard error; informational only. Status: Not yet implemented.
8. **DOCS-webgpu-skill** — new `docs/agent/skills/webgpu-rendering.md` covering: current status (today: WebGL-only); recommended path for compute-heavy gameplay (defer until adapter ships); how to read `__agf.rendererInfo().renderer`. Status: Not yet implemented.
9. **BASELINE-rebench-pre-webgpu** — re-run perf-probe-shadows + perf-probe-batching on current main, save numbers under `docs/research/perf/baseline-{date}.json` so any future WebGPU adapter has a comparison anchor. Status: Not yet implemented.
10. **HIGH_LEVEL-update-webgpu** — depending on the spike outcome, update `HIGH_LEVEL_BACKLOG.md` to either keep `M21-webgpu-spike` parked or promote a `M21-webgpu-adapter` epic with story-level subtasks. Status: Not yet implemented.

### Out of scope (Sprint 60)

- Actual `WebGpuRenderAdapter` implementation — that's a follow-up sprint *if* this spike's recommendation is "go". Sketch only here.
- Migrating any existing project (hello-3d / material-bench / shadows-bench) to WebGPU. The spike is a standalone harness.
- Compute-shader work (particle physics on GPU, terrain GPGPU, skinning) — those become interesting *after* the WebGPU adapter lands and is the place where WebGPU's real win shows up.
- SSR / BPCEM / LightProbeGrid — same as S58/S59 out-of-scope.

## Next Sprint (placeholder)

To be detailed at S60 close. If the spike recommends "go": Sprint 61 will be the WebGPU adapter implementation. If "defer": pick up the parked S60-perf-cleanup-followups plan (`M17-batched-glb`, `BATCH-BENCH-bvh-stress`, `M16-cache-e`, `render-pool-caller-migration`, `DOCTOR-reflection-runtime`, `M21-shadow-soft` re-eval).
