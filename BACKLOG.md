# Backlog

Date: 2026-05-16 (Sprint 61 archived)

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

## Current Sprint: Sprint 62 — WebGPU feature parity I (post-processing + HDR IBL)

S61 shipped the WebGPU adapter core path; now we close two of the biggest feature gaps so real projects can opt in without losing rendering quality. Bloom + SSAO + LUT + FXAA on the WebGPU `PostProcessing` pipeline + HDR environment IBL on WebGPU's `WebGPUCubeRenderTarget`. CSM / PCSS / reflection probes / planar mirror are still parked for S63.

### Stories

1. **WEBGPU-post-bloom** — `WebGPUPostProcessing` (`three/addons/tsl/effects/Bloom.js` + the WebGPU `PostProcessing` orchestrator) wired into the adapter's existing `setPostPipeline()` for `mode: "webgpu"`. Match the `project.render.post[]` schema. Skip for WebGL path. Status: Not yet implemented.
2. **WEBGPU-post-ssao** — TSL SSAO node, same pattern. Status: Not yet implemented.
3. **WEBGPU-post-lut** — TSL ColorLUT node. Status: Not yet implemented.
4. **WEBGPU-post-fxaa** — TSL FXAA node. Status: Not yet implemented.
5. **WEBGPU-hdr-ibl** — port the `setEnvironment({ kind: "hdr" })` path to use WebGPU's PMREM equivalent. Today the WebGL `PMREMGenerator` crashes on `WebGPURenderer` so the adapter skips IBL entirely. Three.js r0.184+ ships a `PMREMGenerator` that works on `WebGPURenderer` via the node-material runtime; route the WebGPU path through it. Status: Not yet implemented.
6. **WEBGPU-generated-env** — `setEnvironment({ kind: "generated" })` (RoomEnvironment + PMREM) on WebGPU. Same PMREM port from Story 5 reused. Status: Not yet implemented.
7. **WEBGPU-renderer-import-boundary** (carried from S61) — extend `tests/unit/renderer-import-boundary.test.ts` so `three/webgpu` is only allowed under `engine/render/webgpu/**` once the post-processing files relocate. Today the import lives in `three-render-adapter.ts`; this sprint adds `engine/render/webgpu/post.ts` + `engine/render/webgpu/env.ts` and the boundary test grows to match. Status: Not yet implemented.
8. **WEBGPU-spike-post** — extend `examples/webgpu-spike/` with a modest bloom + ssao + HDR sky so the smoke trail covers the new code paths. Update its README + the smoke spec to assert `__agf.rendererInfo().postPassesActive > 0` and visible HDR background pixels. Status: Not yet implemented.
9. **DOCS-webgpu-skill-update** — `docs/agent/skills/webgpu-rendering.md` removes post-passes / HDR IBL from the "deferred" list; documents the WebGPU PostProcessing pipeline difference vs the WebGL EffectComposer (TSL nodes vs Pass classes, async render). Status: Not yet implemented.
10. **DOCTOR-webgpu-post-aware** — `engine doctor` no longer flags `project.render.post[]` as a WebGPU blocker once the post-processing port lands. CSM / probes / mirrors stay flagged. Status: Not yet implemented.
11. **WEBGPU-info-bloomMs** — `__agf.rendererInfo()` picks up `postProcessingMs` from the WebGPU PostProcessing pipeline so agents can budget against it. WebGL still reports 0 (composer cost rolls into renderMs). Status: Not yet implemented.

### Out of scope (Sprint 62)

- **CSM, PCSS, reflection probes, planar mirror, GPU timer** — S63 covers the remaining feature gap.
- **Migrating existing projects** (material-bench, shadows-bench, beacon-world) to WebGPU — S64.
- **Default flip** — S65.
- **Lazy `three/webgpu` import** — S64 pre-default-flip housekeeping.

## Next Sprint (placeholder)

S63 — feature parity II. CSM via `CSMNode`, PCSS as a TSL node, reflection probes + WebGPU PMREM via `WebGPUCubeRenderTarget`, planar mirror via `ReflectorNode`, GPU timer via `GPUQuerySet { type: "timestamp" }`. Each of those is its own gap that three.js's WebGPU backend handles differently than the WebGL one.
