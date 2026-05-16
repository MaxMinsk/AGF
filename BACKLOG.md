# Backlog

Date: 2026-05-16 (Sprint 63 archived)

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

## Current Sprint: Sprint 64 — WebGPU feature parity (re-attempted) + lazy import

S63 closed on a single critical-bug story (HemisphereLight position fix); the original feature-parity scope rolls forward here. **Pick the highest-value subset** — each story is realistically a half-sprint of focused effort and three.js's WebGPU surface still has shifting APIs (`PostProcessing` → `RenderPipeline` rename in r0.183, TSL node graph different per minor). Suggested order: reflection probe (smallest, biggest user-visible win for material-bench), then GPU timer (small, well-understood), then ONE post-pass (bloom) end-to-end, then defer the rest to S65-pre-default-flip work.

### Stories (priority-ordered)

1. **WEBGPU-reflection-probe** — port `acquireReflectionProbe` etc. to `three/webgpu`'s `CubeRenderTarget` (rename of `WebGLCubeRenderTarget`) + `CubeCamera`. PMREM prefilter already works (S62). Flip `WEBGPU_CAPABILITIES.supportsReflectionProbe` to `true`. Verify on material-bench style scene (centre chrome). Status: Not yet implemented.
2. **WEBGPU-gpu-timer** — wrap `GPUQuerySet { type: "timestamp" }` in a `WebGpuTimer` parallel to `engine/render/gpu-timer.ts`. `__agf.rendererInfo().gpuMs` populates on WebGPU. Status: Not yet implemented.
3. **WEBGPU-post-pipeline** — wrap `three/webgpu` `RenderPipeline` orchestration in `engine/render/webgpu/post.ts`. Adapter's `setPostPipeline()` branches on `capabilities.kind`. Status: Not yet implemented.
4. **WEBGPU-post-bloom** — `three/addons/tsl/display/BloomNode.js` attached to the pipeline. First worked example. Other post-passes follow same pattern. Status: Not yet implemented.
5. **WEBGPU-lazy-import** — move `import { WebGPURenderer } from "three/webgpu"` out of the synchronous top-level import in `three-render-adapter.ts` and into an `await import()` inside `adapter.init()` when `mode === "webgpu"`. Saves ~145 KB gzipped from the WebGL-only bundle; budgets in `scripts/check-bundle-size.mjs` drop back to 320 KB. Status: Not yet implemented.
6. **WEBGPU-renderer-import-boundary** — once `engine/render/webgpu/` directory exists with the post-pipeline + gpu-timer files, extend `tests/unit/renderer-import-boundary.test.ts` to allow `three/webgpu` from `engine/render/webgpu/**` only. Status: Not yet implemented.
7. **WEBGPU-spike-features** — extend `examples/webgpu-spike/` to exercise whatever lands (probe + bloom + GPU timer). Update README + e2e smoke. Status: Not yet implemented.
8. **DOCS-webgpu-skill-update** — flip every story that lands from "deferred" to "supported" in `docs/agent/skills/webgpu-rendering.md`. Status: Not yet implemented.
9. **DOCTOR-webgpu-flags-up-to-date** — `engine doctor` capability-driven flagging stays in sync automatically. Status: Not yet implemented.

### Deferred to S65

- **WEBGPU-post-ssao / WEBGPU-post-lut / WEBGPU-post-fxaa** — the remaining three post-passes. Bloom alone proves the pattern; the rest are mechanical follow-ons. Lands during the re-bench / default-flip sprint.
- **WEBGPU-csm**, **WEBGPU-planar-mirror**, **WEBGPU-pcss** — heavier feature ports. CSM needs research on `CSMNode` maturity; PCSS needs a TSL rewrite of GLSL shader chunks; ReflectorNode for planar mirror is mid-weight. None are blockers for `webgpu-spike`-class projects.

### Out of scope (Sprint 64)

- **Migrating existing projects** (material-bench, shadows-bench, beacon-world) to WebGPU — S65 (depends on feature parity + re-bench).
- **Default flip** — S65 (after migrations + re-bench).

## Next Sprint (placeholder)

S65 — re-bench + remaining feature ports + migrate examples + default-flip prep. After S64 lands the highest-value features, S65 (a) ports the remaining post-passes (SSAO / LUT / FXAA) + planar mirror + CSM + PCSS as the gating work for migrating existing projects, (b) re-runs `perf-probe-webgpu.mjs` + perf-probe-shadows / batching for an updated WebGL-vs-WebGPU anchor, (c) migrates `examples/{hello-3d, material-bench, shadows-bench, water-bench, beacon-world}` to `render.mode: "webgpu"`, (d) flips the engine default to `webgpu`. Hardest sprint of the WebGPU push.
