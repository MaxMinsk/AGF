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

## Current Sprint: Sprint 37 — CSM + physics polish + benches (DONE — archive merging)

Sprint 37 shipped Cascade Shadow Maps, finished the physics-runtime ergonomics started in Sprint 36 (interpolation, debug overlay, sensor-wired gameplay), and added two new perf-only projects (`physics-bench`, `shadows-bench`). 8 stories landed; `beacon-physics-character` and `M24-static-mesh` carry to Sprint 38.

### Stories

- `examples/physics-bench/` ✅ Implemented. Sibling of `batch-bench`. Camera + ambient + sun + fixed-collider ground + 4 walls; bootstrap seeds N dynamic primitive bodies (box/sphere, default 200) high above the floor that fall, collide, and settle. `?count=N&shape=box|sphere` URL params (count clamped 0..2048). Bodies use CCD to avoid tunnelling at speed. Collider sizes match visual meshes 1:1 (box `size: [1,1,1]` ↔ `BoxGeometry(1,1,1)`, sphere `radius: 0.5` ↔ `SphereGeometry(0.5, …)`). Default seed: drawCalls 17, buckets 12, bucketInstances 200, handleLeak 0, settles to avgY ≈ 0.05.
- `M21-frame-timing` ✅ Implemented. `start.ts` samples `performance.now()` around each tick phase; once per metrics window (~500 ms) the accumulators flatten into a `FrameTiming` record `{ fixedUpdateMs, frameUpdateMs, renderMs, totalFrameMs, samples }`. Exposed via `RuntimeHandle.frameTiming()` → `AppHandle.frameTiming()` → `__agf.frameTiming()`. Dev overlay renders `fix / frm / rnd / ms` cells next to fps.
- `M24-debug` ✅ Implemented. `RapierAdapter.getDebugLines()` exposes `world.debugRender()` (Float32Array vertices + RGBA colors). `ThreeRenderAdapter.setDebugOverlayEnabled(boolean)` / `setDebugOverlayData(...)` manage a single transparent `LineSegments` node in the scene (`renderOrder: 999`, `depthTest: false`). `PhysicsDebugSystem` (frame update, registered when `project.physics.enabled`) drives the overlay from a shared `enabled` flag. Surface: `__agf.physics.setDebugOverlay(boolean)` + `?physicsDebug=1` URL param.
- `M21-shadow-csm` ✅ Implemented. `ThreeRenderAdapter.setCsm(config)` constructs `three/addons/csm/CSM.js` lazily — `rebuildCsm` runs the moment an active camera exists, registering every renderer-managed material through `setupMaterial`. Hooked at acquireMesh / acquireBucket / acquireBatchedBucket / setMeshMaterialPatch. `draw()` calls `csm.update()` before render. Camera-swap triggers full reconstruction. Schema lands on `project.json#render.shadows.csm` with cascades / maxFar / mode / shadowMapSize / shadowBias / lightDirection / lightIntensity.
- `examples/shadows-bench/` ✅ Implemented. RTS-style showcase for CSM — 80×80 field + procedural "village" (28 buildings, 80 trees, 50 rocks). Deterministic LCG seed so screenshots reproduce. `RtsCameraSystem` (project-local under `src/systems/`) — WASD/arrows pan, mouse wheel + Q/E zoom, tilt authored once in the scene. `?buildings=N&trees=N&rocks=N` URL params. drawCalls 36 at default seed, soft cascade shadows visible under every prop.
- `M24-interpolation` ✅ Implemented. `TimeContext` gains optional `physicsAlpha` in [0, 1]; runtime tick computes it from the leftover accumulator. `PhysicsSyncSystem` buffers `prev`/`curr` (position + rotation per dynamic body) in fixedUpdate and lerps in a new frameUpdate phase. Linear-degree blend on rotation is correct enough at 60 Hz steps. 120 Hz displays no longer show 60 Hz pulses for dynamic bodies. 7 unit tests cover alpha=0/0.5/1 + state churn.
- `beacon-physics-sensor-wiring` ✅ Implemented. Pickups (cores) sensor radius 0.5 → 1.2, beacons 0.6 → 1.6, so sensor zones match the gameplay radii. `pickup-system.tryPickup` + `handleCarry` read `OverlappingTriggers3D` on the carrier when present, otherwise fall back to the full query + distance gate. `hazard-system` reads it on the hazard so the inner pulse-radius check walks only entities inside the outer sensor sphere. Both systems handle the physics-disabled case (no overlap data → same behavior as before). `beacon-world-gameplay.spec` green end-to-end.
- `bundle-check-vendor-budgets` (Sprint 36 carry-over, finalised) ✅ Implemented. `scripts/check-bundle-size.mjs` tracks `rapier-*` / `three-*` chunks under separate vendor budgets so the main-bundle check isn't dominated by lazy-loaded WASM. (Shipped in Sprint 36; bookkeeping note here.)

### Carried to Sprint 38

- **beacon-physics-character** — switch `player.drone` from `PlayerControlled` Transform writes to `CharacterController3D` + a new `CharacterMovementSystem` that consumes input and queries the controller for collision-resolved motion. Requires a project flag so Hello-3D keeps the old path.
- **M24-static-mesh** — fixed-body `trimesh` + `heightfield` colliders from GLB assets. `engine check` warns on huge trimesh, rejects dynamic trimesh, validates heightfield dimensions.
- **M17-batched-mesh-system** — wire the BatchedMesh adapter primitives behind `Batchable.path?: "instanced" | "batched"` in `BatchingSystem`. Bucketing for "batched" keys by `material + shadow + group` (mesh varies).
- **M24-raycast** — `runtime.physics.raycast({...})` returning `EntityId` + hit point/normal/distance; `runtime.physics.overlap({...})` for area queries.

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
