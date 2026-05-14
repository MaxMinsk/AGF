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

## Current Sprint: Sprint 38 — character controller + physics raycast + bench polish (DONE — archive merging)

Sprint 38 wrapped the M24 physics integration around Beacon (drone driven by `CharacterController3D` + collision-resolved motion), added the public physics-query API, and ran a small doctor / decoder / static-shadow polish pass. 7 stories landed; `M24-static-mesh` carries to Sprint 39.

### Stories

- `beacon-physics-character` ✅ New `CharacterMovementSystem` (engine/physics/rapier/) runs in fixedUpdate BEFORE `PhysicsSyncSystem` for entities carrying `CharacterController3D` + kinematic `RigidBody3D`. Reads `Transform.position - body.position` as desired delta, optionally adds `gravity * gravityScale * fixedDt` (default scale 0), feeds `computeCharacterMovement(controller, collider, desired)` for collide-and-slide / autostep / snap-to-ground, applies via `setBodyNextKinematicTranslation`, mirrors resolved position back into Transform. Large jumps (>1m) bypass and hard-set. `PhysicsSyncSystem.phase3` skips CC entities; `phase5b` writes the post-step body position back into Transform. `PhysicsBodyRegistry` grows `colliderFor(entityId)`. Beacon's `player.drone` adopts the component (maxSlopeDegrees 45, snapToGroundDistance 0.25, mass 3); `beacon-world-gameplay` + `project-switcher` (`KeyD moves drone along +X`) + `score-pulse` all green.
- `M24-raycast` ✅ `RapierAdapter.castRay(origin, direction, maxDistance)` wraps Rapier's `castRayAndGetNormal` with `solid: true` and reverse-maps the hit collider through the internal handle table. `AppHandle.physics.raycast(...)` / `window.__agf.physics.raycast(...)` return `{ entityId, distance, point, normal }`. Spike `spikes/physics-rapier-v0/raycast-spike.ts` confirms vertical + horizontal hits + miss semantics.
- `M21-shadow-static` ✅ `project.json#render.shadows.autoUpdate` (default true). When false, `renderer.shadowMap.autoUpdate` is disabled at startup; `__agf.renderer.invalidateShadowMap()` schedules one re-render. `examples/shadows-bench` opts in — buildings + trees + rocks never move, so the cascade bake stops re-rendering each frame. CSM continues to drive lighting.
- `M17-material-sharing-doctor` ✅ New `engine/tools/doctor/material-sharing.ts` scans `<projectDir>/assets/{runtime,_sources}/materials/*.material.json`, hashes the salient fields (shader kind + colour + opacity + full PBR / clearcoat / sheen / iridescence / phong) into stable signatures, reports duplicate groups. Hooked into `engine doctor` with a top-level recommendation line. 3 unit tests cover happy path + distinct PBR params + empty projects.
- `M21-light-budgets` ✅ `RendererMetric` union gains `lights` + `shadowCasters`; `compareRendererInfo` walks them inline with the existing metrics. `schemas/performance-budget.schema.json` adds matching fields so projects can cap active lights + shadow casters and `engine doctor` reports soft/hard violations.
- `ASSET-decoder-paths` ✅ New `engine/render/asset-decoders/decoders.ts` exposes process-wide singletons for the GLTF compression helpers — `DRACOLoader`, `KTX2Loader` (with `detectSupport(renderer)` re-issued when the renderer instance changes), `MeshoptDecoder`. `createGlbLoader({ renderer?, draco?, ktx2?, meshopt? })` reuses them so multiple asset registries share one Web Worker pool. No project opts in yet — scaffolding lands before M25 ASSET-compression.
- `M17-batched-mesh-system` ✅ `Batchable.path?: "instanced" | "batched"` (default "instanced") on the scene schema. `BatchingSystem` grows a discriminated `BucketRecord`; the new `BatchedRecord` keys by `(colour + shadow + group)` — mesh-ref intentionally omitted — and uses `acquireBatchedBucket` / `addBatchedGeometry` / `addBatchedInstance` / `setBatchedInstanceTransform` / `setBatchedInstanceGeometry`. Overflow on the 512-instance / 16k-vertex / 32k-index caps emits a one-shot `AGF_BATCH_OVERFLOW` per bucket. E2E probe: 4 mixed-mesh entities → 1 batched bucket, `batchedBucketInstances: 4`, drawCalls 2.

### Carried to Sprint 39

- **M24-static-mesh** — fixed-body `trimesh` + `heightfield` colliders from GLB assets. `engine check` warns on huge trimesh, rejects dynamic trimesh, validates heightfield dimensions.

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
