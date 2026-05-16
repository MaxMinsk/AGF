# Backlog

Date: 2026-05-16 (Sprint 64 archived)

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

## Current Sprint: Sprint 65 — WebGPU feature parity (heavy) + lazy import + migrate + default-flip

The biggest remaining WebGPU sprint. This is realistically a multi-sprint epic — listed here as one umbrella because each story leans on the others for the default-flip endgame.

### Stories

1. **WEBGPU-gpu-timer** — wrap `GPUQuerySet { type: "timestamp" }` in a `WebGpuTimer` parallel to `engine/render/gpu-timer.ts`. `__agf.rendererInfo().gpuMs` populates on WebGPU. Status: Not yet implemented.
2. **WEBGPU-post-pipeline** — wrap `three/webgpu` `RenderPipeline` (renamed from `PostProcessing` in r0.183) in `engine/render/webgpu/post.ts`. Adapter's `setPostPipeline()` branches on `capabilities.kind` and routes to a TSL node graph instead of `EffectComposer`. Status: Not yet implemented.
3. **WEBGPU-post-bloom** — `three/addons/tsl/display/BloomNode.js` attached to the pipeline. First worked example for the WebGPU post-pass path. Status: Not yet implemented.
4. **WEBGPU-post-ssao** — `three/addons/tsl/display/GTAONode.js`. Status: Not yet implemented.
5. **WEBGPU-post-lut** — TSL ColorLUT node. Status: Not yet implemented.
6. **WEBGPU-post-fxaa** — `three/addons/tsl/display/FXAANode.js`. Status: Not yet implemented.
7. **WEBGPU-csm** — three.js's WebGL `CSM.js` doesn't work on WebGPURenderer. Port to `three/addons/tsl/CSMNode.js` if mature; otherwise fall back to single-cascade DirectionalLight shadow on WebGPU. Status: Not yet implemented.
8. **WEBGPU-planar-mirror** — port `acquirePlanarMirror` etc. to `three/webgpu` `ReflectorNode`. Flip `WEBGPU_CAPABILITIES.supportsPlanarMirror` to `true`. Status: Not yet implemented.
9. **WEBGPU-pcss** — rewrite the WebGL `onBeforeCompile` PCSS shader patches as a TSL node so it works on both renderers. Hardest port. Status: Not yet implemented.
10. **WEBGPU-lazy-import** — move `import { WebGPURenderer, PMREMGenerator, CubeRenderTarget } from "three/webgpu"` out of the synchronous top-level import in `three-render-adapter.ts` and into an `await import()` inside `adapter.init()` when `mode === "webgpu"`. Saves ~145 KB gzipped from the WebGL bundle; budgets in `scripts/check-bundle-size.mjs` drop back to 320 KB. Constructor refactor required (defer device creation to init; affects info.autoReset / GPU timer probe / shadow algorithm / color / fallback lighting paths). Status: Not yet implemented.
11. **WEBGPU-renderer-import-boundary** (carried) — once `engine/render/webgpu/` directory exists, extend `tests/unit/renderer-import-boundary.test.ts` to allow `three/webgpu` from there only. Status: Not yet implemented.
12. **WEBGPU-spike-features** — extend `examples/webgpu-spike/` to exercise everything that lands. Update e2e smoke. Status: Not yet implemented.
13. **BASELINE-rebench-pre-webgpu** (carried from S60) — re-run `perf-probe-webgpu.mjs` + `perf-probe-shadows.mjs` + `perf-probe-batching.mjs` on the now-feature-complete WebGPU adapter. Compare against S60 baseline. Status: Not yet implemented.
14. **MIGRATE-examples-to-webgpu** — flip `examples/{hello-3d, material-bench, shadows-bench, water-bench, beacon-world}` to `render.mode: "webgpu"`. Capability flags gate per-feature regressions. Status: Not yet implemented.
15. **WEBGPU-default-flip** — `project.render.mode` defaults to `"webgpu"`; `webgl` becomes the explicit legacy opt-in. Status: Not yet implemented.
16. **DOCS-webgpu-skill-update** — flip every story that lands from "deferred" to "supported". Status: Not yet implemented.
17. **DOCTOR-webgpu-flags-up-to-date** — capability-driven, should stay in sync automatically with the flag flips. Status: Not yet implemented.

### Honest scope note

S63 and S64 each shipped a single high-value story instead of trying to bundle the full plan; S65's "everything" list will likely fragment the same way. Expected reality: pick the highest-value subset that closes a clear user-visible gap, ship it, document the rest. The default-flip (Story 15) is the gating endpoint — once feature parity is "good enough" we can flip.

## Next Sprint (placeholder)

To be detailed once the WebGPU push concludes — likely returns to the parked perf-cleanup epics (`M17-batched-glb`, `BATCH-BENCH-bvh-stress`, `M16-cache-e`, `render-pool-caller-migration`) plus beacon-world gameplay primitives.
