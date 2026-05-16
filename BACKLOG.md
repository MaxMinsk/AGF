# Backlog

Date: 2026-05-16 (Sprint 62 archived)

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

## Current Sprint: Sprint 63 — WebGPU feature parity II (post-passes + probes + shadows)

S62 closed HDR / generated IBL on WebGPU via `three/webgpu`'s PMREMGenerator. S63 is the bigger feature-parity sprint: port the remaining WebGL-only render features so existing projects (material-bench, shadows-bench) can opt into WebGPU without losing visible features.

This is sized as a "pick the highest-value subset" sprint rather than "ship everything". Suggested priority order: post-passes (touches the most projects) → reflection probes → CSM → planar mirror → PCSS → GPU timer. If some features prove harder than expected, defer the tail to S64 alongside the lazy-import refactor.

### Stories

1. **WEBGPU-post-pipeline** — wrap `three/webgpu`'s `RenderPipeline` (rename of `PostProcessing` in r0.183) in a new `engine/render/webgpu/post.ts`. Adapter's existing `setPostPipeline()` branches on `capabilities.kind` and routes to the WebGPU node graph instead of `EffectComposer`. Each pass becomes a TSL node attached to the pipeline's `outputNode`. Status: Not yet implemented.
2. **WEBGPU-post-bloom** — `three/addons/tsl/display/BloomNode.js` wired into the WebGPU pipeline. Match the existing `project.render.post: [{ kind: "bloom", strength?, radius?, threshold? }]` schema. Status: Not yet implemented.
3. **WEBGPU-post-ssao** — `three/addons/tsl/display/GTAONode.js` (GTAO is the WebGPU SSAO equivalent in three.js's TSL set). Status: Not yet implemented.
4. **WEBGPU-post-lut** — TSL ColorLUT (`three/addons/tsl/display/`). Status: Not yet implemented.
5. **WEBGPU-post-fxaa** — `three/addons/tsl/display/FXAANode.js`. Status: Not yet implemented.
6. **WEBGPU-reflection-probe** — port `acquireReflectionProbe / setReflectionProbeTransform / updateReflectionProbe / reflectionProbeTexture / releaseReflectionProbe` to use `three/webgpu`'s `CubeRenderTarget` + `CubeCamera`. PMREM prefilter already works (S62). Flip `WEBGPU_CAPABILITIES.supportsReflectionProbe` to `true`. Status: Not yet implemented.
7. **WEBGPU-csm** — three.js's WebGL `CSM.js` doesn't work on WebGPURenderer. Two options: (a) port to `three/addons/tsl/CSMNode.js` (which exists for WebGPU); (b) fall back to single-cascade DirectionalLight shadow on WebGPU until CSMNode matures. Pick based on three.js r0.184 CSMNode status. Status: Not yet implemented.
8. **WEBGPU-planar-mirror** — port `acquirePlanarMirror / setPlanarMirrorTransform / releasePlanarMirror` to `three/webgpu`'s `ReflectorNode`. Flip `WEBGPU_CAPABILITIES.supportsPlanarMirror` to `true`. Status: Not yet implemented.
9. **WEBGPU-pcss** — rewrite the WebGL `onBeforeCompile` PCSS shader patches as a TSL node so it works on both renderers. Status: Not yet implemented.
10. **WEBGPU-gpu-timer** — wrap `GPUQuerySet { type: "timestamp" }` in a `WebGpuTimer` parallel to the existing `GpuTimer`. `__agf.rendererInfo().gpuMs` populates on WebGPU. Status: Not yet implemented.
11. **WEBGPU-spike-features** — extend `examples/webgpu-spike/` to exercise whatever lands (bloom + a probe + maybe a mirror). Update README + e2e smoke. Status: Not yet implemented.
12. **WEBGPU-renderer-import-boundary** (carried from S61 / S62) — once `engine/render/webgpu/` actually exists with the new files, extend `tests/unit/renderer-import-boundary.test.ts` to allow `three/webgpu` from there only; keep `engine/core` clean of node-material imports. Status: Not yet implemented.
13. **DOCS-webgpu-skill-update** — flip every story that lands from "deferred" to "supported" in `docs/agent/skills/webgpu-rendering.md`. Status: Not yet implemented.
14. **DOCTOR-webgpu-flags-up-to-date** — `engine doctor` doesn't flag features the WebGPU adapter now supports. Capability-driven so it stays in sync automatically. Status: Not yet implemented.

### Out of scope (Sprint 63)

- **Migrating existing projects** (hello-3d / material-bench / shadows-bench / beacon-world) to WebGPU — S64.
- **Default flip** — S65 (after re-bench + migrations).
- **Lazy `three/webgpu` import** — S64 pre-default-flip housekeeping. Today the WebGL bundle eats 145 KB extra.

## Next Sprint (placeholder)

S64 — re-bench + migrations + lazy import. (1) Run `perf-probe-webgpu.mjs` + `perf-probe-shadows.mjs` + `perf-probe-batching.mjs` against the WebGPU-enabled spike + each migrated example so we have same-machine WebGL vs WebGPU numbers for the S60 spike doc. (2) Flip `examples/{hello-3d, material-bench, shadows-bench, water-bench, beacon-world}` to `render.mode: "webgpu"`; gate per-feature regressions through the capability flags. (3) Move the `three/webgpu` import inside `await adapter.init()` so the WebGL-only bundle path doesn't pay the 145 KB node-material cost. Sets up S65 default-flip.
