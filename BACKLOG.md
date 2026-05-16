# Backlog

Date: 2026-05-16 (Sprint 68 archived)

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

## Current Sprint: Sprint 69 — WebGPU GPU timer + lazy import + remaining migrations

S68 closed cleanly with hello-3d + physics-bench migrated. WebGPU adapter + WebGL2-fallback through three.js cover the basic case. S69 picks up the next contained pieces: GPU timer via `GPUQuerySet`, lazy import of `three/webgpu` (saves 145 KB on WebGL bundle), and migrating beacon-world (gameplay-heavy project; needs verification of physics + persistence + dev-bridge on WebGPU).

### Stories

1. **WEBGPU-gpu-timer** — wrap `GPUQuerySet { type: "timestamp" }` in a `WebGpuTimer` parallel to `engine/render/gpu-timer.ts`. `__agf.rendererInfo().gpuMs` populates on WebGPU. Status: Not yet implemented.
2. **WEBGPU-lazy-import** — move `import { WebGPURenderer, PMREMGenerator, CubeRenderTarget } from "three/webgpu"` out of the synchronous top-level import in `three-render-adapter.ts` and into an `await import()` inside `adapter.init()` when `mode === "webgpu"`. Saves ~145 KB gzipped from the WebGL-only bundle; budgets in `scripts/check-bundle-size.mjs` drop back to 320 KB. Constructor refactor required (defer device creation to init; affects info.autoReset / GPU timer probe / shadow algorithm / color / fallback lighting paths). Status: Not yet implemented.
3. **MIGRATE-beacon-world-webgpu** — flip `examples/beacon-world/project.json#render.mode` to `"webgpu"`. Verify gameplay loop + physics + persistence + dev-bridge all work. Probably also needs `batching: { auto: false }`. Status: Not yet implemented.
4. **WEBGPU-renderer-import-boundary** (carried) — once `engine/render/webgpu/` directory exists (will happen with the gpu-timer port), extend `tests/unit/renderer-import-boundary.test.ts` to allow `three/webgpu` from there only. Status: Not yet implemented.
5. **DOCS-webgpu-skill-update** — flip migrated projects from "blocked" to "on webgpu" in the skill memo + add the fallback policy + auto-WebGL2-fallback note. Status: Not yet implemented.

### Blocked, not in S69 scope

- `material-bench`, `shadows-bench`, `water-bench` migrations — wait for upstream three.js post-processing / CSM / Reflector fixes.
- `batch-bench` migration — wait for WebGPU bucket / instanced / batched port.
- **WEBGPU-default-flip** — gated on enough examples on WebGPU AND post-processing unblocked.

## Next Sprint (placeholder)

S70 — likely the WebGPU bucket / instanced / batched port (unblocks batch-bench, material-bench's outer ring, shadows-bench's village). Sets up shadows-bench / material-bench migrations once the post-processing upstream block lifts.

S67 confirmed WebGPU post-processing is **blocked upstream** in three.js r0.184. Pivot: migrate the example projects that DON'T need post-passes / CSM / planar mirror to WebGPU now, proving the WebGPU core path is mature enough for real-world projects. Track three.js minors for an upstream post-processing fix; flip the remaining projects when it lands.

Eligible projects (no blocking features):
- `hello-3d` — primitives + shadows + Spin → WebGPU core path covers this.
- `physics-bench` — Rapier + primitives → should work; verify physics-runtime interaction.
- `batch-bench` — InstancedMesh + BatchedMesh; the adapter stubs these return -1 on WebGPU, so the bench would fall back to per-mesh. Skip for now.
- `webgpu-light-test` — already on WebGPU; no migration needed.

Blocked (need post-passes / CSM / planar mirror):
- `material-bench` (bloom + transmission pre-pass + multi-probe + PMREM-prefilter)
- `shadows-bench` (CSM)
- `water-bench` (PlanarMirror)

### Stories

1. **MIGRATE-hello-3d-webgpu** — flip `examples/hello-3d/project.json#render.mode` to `"webgpu"`. Verify scene + shadows render correctly. Smoke test passes. Status: Not yet implemented.
2. **MIGRATE-physics-bench-webgpu** — same. Confirms physics + WebGPU coexist. Status: Not yet implemented.
3. **WEBGPU-fallback-policy** — when `mode = "webgpu"` is requested but `navigator.gpu` is missing, currently the page errors out. Add a `render.fallback: "webgl"` option that auto-falls back. Saves users from "page is black" if they open a webgpu project in an unsupported browser. Status: Not yet implemented.
4. **DOCS-webgpu-state-doc** — single page summarising which AGF features work on WebGPU today (S62-67 results), which are blocked, which are upstream blockers. Lives at `docs/research/m21-webgpu-state.md`. Replaces a chunk of the scattered skill memo content. Status: Not yet implemented.
5. **THREE-version-tracker** — note in the skill memo to re-test bloom on each three.js minor; auto-flip `supportsPostProcessing` once upstream fixes the ShaderMaterial issue in `BloomNode` pingpong materials. Status: Not yet implemented.

### Blocked, not in S68 scope

- **WEBGPU-post-bloom / ssao / lut / fxaa** — blocked upstream in three.js. Track for r0.185+.
- **WEBGPU-csm** — needs `CSMNode` port or upstream fix.
- **WEBGPU-planar-mirror** — needs `ReflectorNode` integration (different API).
- **WEBGPU-pcss** — needs TSL rewrite.
- **WEBGPU-gpu-timer** — `GPUQuerySet` work, sprint-sized on its own.
- **WEBGPU-lazy-import** — 145 KB bundle win, sprint-sized constructor refactor.
- **MIGRATE-material-bench / shadows-bench / water-bench** — gated on the upstream / port stories above.
- **WEBGPU-default-flip** — gated on at least 50 % of the examples migrating cleanly.

## Next Sprint (placeholder)

S69 — likely picks up `WEBGPU-gpu-timer` (small, well-understood, non-post-processing) and/or `WEBGPU-lazy-import` (bundle win). Tracks upstream three.js minor releases for the post-processing fix.
