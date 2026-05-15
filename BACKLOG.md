# Backlog

Date: 2026-05-15

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

- **M21-shadow-map-size-real-hw** — `m21-shadows-bench-perf.md` measured shadowMapSize 1024 → 512 at only −3.8 % renderMs in headless software-WebGL. Real GPUs care a lot more about shadow-map fill rate + VRAM bandwidth. Re-run `scripts/perf-probe-shadows.mjs --only baseline,512map,2048map` on the user's machine, write the numbers into the same research note. If real-hw savings are large, may justify dropping shadows-bench default to 512 or auto-scaling based on device perf hint. **User-driven** — agent doesn't run this.
- **M17-batch-default-on** — flip `autoBatchPrimitives` (renamed `autoBatch`) on by default once we're confident no project relies on single-Mesh semantics. All 5 example projects already opt in via `project.json#render.batching.auto: true`; this just makes new projects get it for free.
- **RENDER-bucket-key-architecture** — current bucket key is a hand-rolled string `instanced|<mesh>|<shadow>|<group>`. With GLB + manifests + the new BatchedMesh path the routing logic between paths gets messier. Investigate moving to a typed BucketSpec + Map<hash, BucketRecord>, and revisit the dispatch between bucketer and batched-mesh-system under a single abstraction. Pairs with `render-pool-abstraction` (S52 story).
- **M17-bvh-extension** — add `@three.ez/batched-mesh-extensions` (BVH-augmented BatchedMesh) and re-run `perf-probe-batching.mjs` on shadows-bench. The S51 deepdive showed BatchedMesh loses to InstancedMesh on small scenes because of multi-draw command overhead; BVH culling could collapse the per-instance loop and flip the crossover toward smaller scenes. Own sprint when prioritised.
- **M17-lod-batched** Wire LodSelectionSystem to BatchedMesh's per-instance geometry id so LOD swap doesn't drop the entity out of the bucket.
- **M17-static-merge-spike** Static geometry merge with reverse `EntityId` lookup for picking. Strictly opt-in per-entity (`StaticMerge` tag). Deferred until a 10k+ static-prop project asks (see `docs/research/m17-static-merge-investigation.md`).
- **M21-shadow-soft** Re-evaluate `PCFSoftShadowMap` vs `PCFShadowMap` vs `VSMShadowMap` once three.js stabilises soft shadows.
- **M21-shadow-glb-acne** Self-shadow polish on low-poly GLB meshes; investigate per-material `shadowSide = THREE.BackSide`, scale-aware bias, or polygonOffset overrides.
- **M21-webgpu-spike** Async WebGPU renderer adapter behind a profile flag (`project.json#renderer.backend: "auto" | "webgl" | "webgpu"`).
- **ASSET-optimize-command** `engine asset optimize <project> <asset>` CLI invoking gltf-transform with project presets.
- **ASSET-lod-metadata** LOD schema + `engine check` validation (distances strictly increasing, fallback declared).
- **ASSET-texture-doctor** Doctor warnings: huge uncompressed PNG/JPEG, NPOT mismatches, missing KTX2 transcoder path.
- **M3-c-load** + **M3-c-beacon** Wire `expandScenePrefabs` into scene-load + Beacon adopts prefab instances.
- **M16-cache-e** Reusable matrices / pooled scratch buffers inside the cache layer.
- **RUNTIME-progressive-loading** Asset manifest `priority: "critical" | "deferred"` + placeholder primitive + scene phases.
- **RUNTIME-idle-rendering** Render-on-demand mode for static menus / inspector tools.
- **RUNTIME-gpu-timing** Feature-detected GPU timing queries in dev builds.
- **M20-a..l** Netcode rework (carried from Sprint 32).
- **M2b-seed**, **13.13** audio, **10.5+** C# WS transport.

## Current Sprint: Sprint 52 — shadow perf + shadows-bench polish

Twin focus: restore the visual quality of shadows-bench (the scene got visibly dimmer after S51's normalBias / autoUpdate / per-frame-shadow trade-offs) **and** close the perf regression via static-caster tagging (the main prize from the S51 deep-dive). Plus a few small S51 follow-ups so they don't dangle.

### Stories

1. **POLISH-shadows-bench-lighting** — ambient / directional / CSM intensity were tuned for the static-shadow baseline through S47/S51. With `autoUpdate=true` and a wider scene the picture went flat. Re-tune `lightIntensity`, ambient, `shadowNormalBias` (current 0.12 was sized for `shadowMapSize: 2048`; after the drop to 1024 it can overshoot). Optionally enable `render.color.toneMapping: "aces-filmic"` or `agx` (currently `"none"` → linear clamp, crushed highlights). Acceptance: visually brighter without losing shadow contact detail; before / after screenshots in the commit.
2. **POLISH-shadows-bench-materials** — trees / buildings / roads look flat; refactor material manifests with warmer building tones, brighter canopy, distinct asphalt for roads. Stay in the bucket-batchable zone (Standard without textures) where possible so auto-batch keeps working.
3. **POLISH-shadows-bench-composition** — add variety: tree-size variance (±20% scale jitter), 4-6 lampposts along the roads, a couple of fences / decorative boxes around the central plaza. Goal: remove the "lego with identical parts" feel.
4. **POLISH-shadows-bench-sky** — the solid `background: #3a5066` looks cheap. Try an HDR sky (if the environment loader is wired) or a procedural sky gradient. Environment is currently empty; the first option is adapter-level skybox + reflection envmap. If that slot is still half-built under M21-environment, ship the gradient instead.
5. **M21-shadow-static-caster-tag** — the headline perf prize from the S51 deep-dive. `ShadowCaster { dynamic: boolean }` component (default false). Renderer flips `shadowMap.autoUpdate = false`; a new `DynamicShadowSystem` listens for LTW changes on dynamic-tagged casters and sets `renderer.shadowMap.needsUpdate = true` when they move. Acceptance: `perf-probe-shadows.mjs --only baseline,static-caster-tag` shows ≥ 25 % drop in renderMs; cars + swaying trees still cast tracking shadows correctly.
6. **DOCTOR-shadow-section** — mirror the S51 Batching: section in `engine doctor` — surface `shadows.algorithm + csm.cascades + csm.shadowMapSize + autoUpdate` plus a recommendation along the lines of "3 cascades cost ~17 % renderMs vs 2; consider downgrading for outdoor scenes". Lets the next agent see what we already know about the trade-off.
7. **M21-fxaa-cost-isolation** — extend `scripts/perf-probe-shadows.mjs` with a `noFXAA` scenario (`render.post = []`). Measure, append the numbers to `docs/research/m21-shadows-bench-perf.md`. Hypothesis: < 0.05 ms, but worth confirming so we know FXAA isn't quietly dragging the perf budget.
8. **shadow-tuner-persistence** — the S48 UI shadow tuner doesn't persist anything, so tune → reload → lost. Add a save-to-project.json button (`POST /__agf/project-patch` or a direct fs API in DEV) + load on boot. Makes the tuner workflow actually iterative.
9. **render-pool-abstraction** (carried from S48) — unify InstancedMesh / BatchedMesh / Particle pools under one BucketSpec + dispatcher. Prepares the ground for `RENDER-bucket-key-architecture` (typed key) and `M17-bvh-extension` (BVH-augmented bucket variant), both in the backlog.

### Out of scope

- `M21-shadow-map-size-real-hw` — needs to run the probe **on the user's machine**, not an agent. Moved into Next Sprint candidates flagged as user-driven measurement.
- `M17-bvh-extension` — big feature, deserves its own sprint.
