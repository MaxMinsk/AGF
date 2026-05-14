# Backlog

Date: 2026-05-14

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

## Current Sprint: Sprint 37 — TBD

Sprint 37 focus is picked at sprint start. Natural openers (in priority order based on Sprint 36 close):

1. **M21-shadow-csm** — outdoor Cascade Shadow Maps via `three/addons/csm/CSM.js`. High-touch: adapter-side CSM instance bound to the active camera, per-frame `csm.update()`, and `csm.setupMaterial(material)` on every material the renderer manages (acquire / patch / manifest paths). Schema on `project.json#renderer.shadows.csm`. Conflict with the ECS-owned sun's shadow needs an opt-out path.
2. **M17-batched-mesh-system** — wire the BatchedMesh adapter primitives behind a `Batchable.path?: "instanced" | "batched"` selector in `BatchingSystem`. Bucketing for "batched" keys by `material + shadow + group` (mesh varies); useful when many distinct geometries share one material. Add a `batch-bench` scenario pushing 4 different primitive meshes through one batched bucket and confirms drawCalls stay flat.
3. **beacon-physics-character** — switch `player.drone` from `PlayerControlled` Transform writes to a `CharacterController3D` + a new `CharacterMovementSystem` that consumes input and queries the controller for collision-resolved motion. Requires a project flag so static scenes (Hello-3D) keep the old path.
4. **beacon-physics-sensor-wiring** — replace `pickup-system` / `hazard-system` proximity loops with `OverlappingTriggers3D` reads. Gameplay events stay identical; the radius checks become sensor-collider acquisitions.
5. **M24-raycast** — `runtime.physics.raycast({ origin, direction, maxDistance, mask })` returning `EntityId` + hit point/normal/distance. `runtime.physics.overlap({ shape, position, mask })` for area queries.
6. **M24-debug** — Rapier `world.debugRender()` overlay (line segments) toggleable in dev. `engine doctor` reports body/collider counts + dynamic vs static breakdown. HMR leak test ensures body count stays bounded.
7. **M24-static-mesh** — Fixed-body `trimesh` + `heightfield` colliders from GLB assets. `engine check` warns on huge trimesh, rejects dynamic trimesh, validates heightfield dimensions.
8. **M21-frame-timing** — Per-phase frame timing in dev snapshot (`inputMs` / `fixedUpdateMs` / `physicsMs` / `transformResolveMs` / `renderSyncMs` / `renderMs` / `postMs`). Plumbing on `DiagnosticsBus` + exposed via `__agf.snapshot().frameTiming`.
9. **`examples/physics-bench/`** — stand-alone perf project, sibling of `batch-bench`. Camera + ambient + sun + fixed ground collider; bootstrap seeds N dynamic boxes high above the ground that fall, collide, and settle. `?count=N&shape=box|sphere|capsule` URL params; `?count=0` keeps an empty baseline. Regression target for physics scaling (rigid-body count vs fixed-step ms, settle time, sleep activation) once `M21-frame-timing` exposes `physicsMs`.

Default sprint size is 8–12 stories per `feedback-sprint-size`.

### Parking lot (utsubo follow-ups + other carry-overs)

These remain in scope but did not make the Sprint 37 opener list.

#### Utsubo-driven follow-ups (`Notes/utsubo_threejs_best_practices_100_tips.md`)

- `M21-tsl-investigate` Spike: evaluate Three.js TSL / NodeMaterial for AGF custom-material manifest path. Output: research doc + a recommendation on whether to defer until WebGPU renderer or adopt early as a v1 material kind.
- `M21-webgpu-spike` Async WebGPU renderer adapter behind a profile flag (`project.json#renderer.backend: "auto" | "webgl" | "webgpu"`).
- `M21-context-loss` Listen for WebGL `webglcontextlost` / `webglcontextrestored`; emit `AGF_RENDER_CONTEXT_LOST` / `AGF_RENDER_CONTEXT_RESTORED` diagnostics; rebuild renderer resources on restore.
- `M21-light-budgets` `performance-budget.json#renderer.maxActiveLights` / `maxShadowCastingLights` / `maxShadowMapSize` + `engine doctor` warnings.
- `M21-shadow-static` `renderer.shadowMap.autoUpdate = false` for declared-static shadow casters with explicit invalidation API.
- `M21-post-pipeline` Schema-driven post-processing chain (`project.json#renderer.post: [...]`) with selective bloom + FXAA + tonemap at end.
- `M17-material-sharing-doctor` Doctor check: detect duplicate material signatures + report which manifests could be merged.
- `M17-static-merge-spike` Static geometry merge with reverse `EntityId` lookup for picking. Strictly opt-in per-entity (`StaticMerge` tag).
- `M17-lod` `LOD { levels: [{ maxDistance, mesh }] }` component + integration with batching's per-instance LOD path.
- `ASSET-decoder-paths` Single shared `DRACOLoader` + `KTX2Loader` constructed at adapter init; `KTX2Loader.detectSupport(renderer)` once.
- `ASSET-compression` Runtime support for KTX2 (UASTC normal + ETC1S diffuse) + Draco / Meshopt geometry.
- `ASSET-gltf-transform-investigate` Decide tooling: dev dep vs external CLI vs optional agent skill.
- `ASSET-optimize-command` `engine asset optimize <project> <asset>` CLI invoking gltf-transform with project presets.
- `ASSET-lod-metadata` LOD schema + `engine check` validation (distances strictly increasing, fallback declared).
- `ASSET-texture-doctor` Doctor warnings: huge uncompressed PNG/JPEG in production profile, NPOT mismatches, missing KTX2 transcoder path.
- `RUNTIME-progressive-loading` Asset manifest `priority: "critical" | "deferred"` + placeholder primitive + scene phases.
- `RUNTIME-renderer-ready` Async "renderer-ready" signal on `runtime.start()` for tests + dev bridge.
- `RUNTIME-resource-leak-tests` HMR + adapter lifecycle leak tests across 30 cycles; assert renderer.info counters stay bounded.
- `RUNTIME-idle-rendering` Render-on-demand mode for static menus / inspector tools. Optional `renderer.demand: true`.
- `RUNTIME-gpu-timing` Feature-detected GPU timing queries (`EXT_disjoint_timer_query_webgl2`) in dev builds.

#### Pre-utsubo carry-overs

- `M21-shadow-soft` Re-evaluate `PCFSoftShadowMap` vs `PCFShadowMap` vs `VSMShadowMap` when three.js stabilises soft shadows.
- `M21-shadow-glb-acne` Self-shadow polish on low-poly GLB meshes; investigate per-material `shadowSide = THREE.BackSide`, scale-aware bias, or polygonOffset overrides.
- `M21-shadow-algorithm` PCSS / VSM exploration once CSM lands.
- `M21-mat-custom` Custom shader / `onBeforeCompile` material kind.
- `M21-mat-textures` Manifest texture maps + KTX2 path.
- `M21-color` Output color space + tonemap pipeline review.
- `M21-env-hdr`, `M21-env-cube` HDR / cubemap environment sources beyond the generated room.
- `M21-cam-*` Camera helpers (orbit / follow / cinematic) as ECS components.
- `M20-a..l` Netcode rework (carried from Sprint 32).
- `M3-c-load` + `M3-c-beacon` Wire `expandScenePrefabs` into scene-load + Beacon adopts prefab instances.
- `M16-cache-e` Reusable matrices / pooled scratch buffers inside the cache layer.
- `M2b-seed`, `13.13` audio, `10.5+` C# WS transport.
