# Backlog

Date: 2026-05-18 (Sprint 69 archived)

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

## Current Sprint: Sprint 70 — WebGPU GPU timer + lazy import + bucket/batching port

S69 closed with beacon-world migrated. 5 of 9 example projects on WebGPU now. S70 picks up the remaining contained stories from the carry list + starts on the bucket port (the single largest blocker for the remaining 4 projects' migrations).

### Stories

1. **WEBGPU-gpu-timer** — wrap `GPUQuerySet { type: "timestamp" }` in a `WebGpuTimer` parallel to `engine/render/gpu-timer.ts`. `__agf.rendererInfo().gpuMs` populates on WebGPU. Status: Not yet implemented.
2. **WEBGPU-lazy-import** — move `import { WebGPURenderer, PMREMGenerator, CubeRenderTarget } from "three/webgpu"` out of the synchronous top-level import in `three-render-adapter.ts` and into an `await import()` inside `adapter.init()` when `mode === "webgpu"`. Saves ~145 KB gzipped from the WebGL-only bundle; budgets in `scripts/check-bundle-size.mjs` drop back to 320 KB. Constructor refactor required (defer device creation to init; affects info.autoReset / GPU timer probe / shadow algorithm / color / fallback lighting paths). Status: Not yet implemented.
3. **WEBGPU-instanced-bucket** — port `acquireBucket / addBucketInstance / setBucketInstanceTransform / setBucketInstanceColor / removeBucketInstance / resizeBucket / recomputeBucketBoundingSphere` to use WebGPU-compatible `InstancedMesh` instances. (`InstancedMesh` already exports from `three/webgpu`.) Unlocks batch-bench + material-bench's orbit ring. Status: Not yet implemented.
4. **WEBGPU-batched-bucket** — same for the BatchedMesh path. Status: Not yet implemented.
5. **MIGRATE-batch-bench-webgpu** — once Stories 3+4 land, flip `examples/batch-bench/project.json#render.mode` to `"webgpu"`. Status: Not yet implemented.
6. **WEBGPU-renderer-import-boundary** (carried) — once `engine/render/webgpu/` directory exists (will happen with the gpu-timer port), extend `tests/unit/renderer-import-boundary.test.ts`. Status: Not yet implemented.
7. **DOCS-webgpu-skill-update** — sync deferred/supported lists with current state. Status: Not yet implemented.

### Blocked, not in S70 scope

- `material-bench`, `shadows-bench`, `water-bench` migrations — still blocked on upstream three.js post-processing / CSM / Reflector fixes.
- **WEBGPU-default-flip** — gated on 6+ examples migrated AND a clean upstream story.

## Next Sprint (placeholder)

S71 — likely picks up the next available unblock once we know which of S70's stories shipped. If lazy import lands: the bundle hit drops back to 320 KB. If gpu-timer lands: WebGPU projects get full `__agf.rendererInfo().gpuMs` parity. If bucket port lands: batch-bench migrates + material-bench's outer ring could migrate (once post-processing is also unblocked).
