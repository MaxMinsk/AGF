# Backlog

Date: 2026-05-13

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

## Current Sprint: Sprint 35 — TBD

Sprint 35 focus is picked at sprint start. Default sprint size is 8–12 stories per `feedback-sprint-size`.

### Candidates

Pick from this list at sprint start; carry the rest forward. Sprint 34 closed with the M24 physics analysis absorbed, so M24-investigate is the most natural opener if the user wants to push physics. Otherwise M21-mat-* / M17-bucketer / M16-cache-c are the highest-impact alternatives.

#### M24 — Rapier physics & colliders (just absorbed; ready to start)

- `M24-investigate` ✅ Implemented. `spikes/physics-rapier-v0/spike.ts` + `README.md`. Confirms `@dimforge/rapier3d-compat` works: init=42ms, 60 fixed steps=8.2ms (well under 16.67ms frame budget), cube falls from 2.5→0.25 in 1 sim-second. Bundle delta ~1.6–1.8 MB gzipped → lazy `await import('@dimforge/rapier3d-compat')` is mandatory.
- `M24-schema` ✅ Implemented. `RigidBody3D` (type: fixed/dynamic/kinematicPosition + mass/gravityScale/damping/lockRotations/ccd/canSleep) + `Collider3D` (kind: box/sphere/capsule/cylinder with per-kind if/then constraints + offset/rotation/sensor/friction/restitution/layer/mask) in `schemas/scene.schema.json`. 13 unit tests cover all kinds + negative cases (bad mass, unknown kind, missing halfHeight, restitution > 1, duplicate mask, etc.).
- `M24-adapter` Rapier adapter under `engine/physics/rapier/` with primitive bodies + lifecycle. Lazy import to keep static-build slim.

#### M21 Phase 2 — finish material + light family

- `M21-mat-physical` `MeshPhysicalMaterial` (clearcoat / sheen / transmission / iridescence) with manifest schema.
- `M21-mat-unlit` `MeshBasicMaterial` / `MeshLambertMaterial` / `MeshPhongMaterial` kinds.
- `M21-light-spot-hemisphere-rect` Remaining Light kinds.
- `M21-shadow-csm` CSM addon for outdoor scenes.

#### M22 perf follow-ups

- `M16-cache-c` ✅ Implemented. `cache.resolveWithDirty(world, inputs, dirtyIds)` accepts the caller-supplied dirty set directly, skipping the per-entity `world.componentRevision('Transform')` Map read that dominated cache-b. `TransformResolveSystem` now passes its consumed dirty set straight through. **Bench at 10k chain-of-8 @ 1%-dirty: 5.99 ms** (vs cache-b 8.04 ms ≈ 25% faster, vs no-cache 12.4 ms ≈ 2.1× faster).
- `M16-cache-d` Next: persistent parent→children index so the topo walk skips entire non-dirty subtrees. Today the walk still touches every input. Target: drop 10k chain-of-8 toward < 1 ms.

#### M17 batching

- `M17-bucketer` Now that `M17-doctor` reports candidates, start the actual `Batchable` component + `BatchingSystem` that emits `InstancedMesh` buckets.

#### Carry-overs

- `M3-c-load` + `M3-c-beacon` — wire `expandScenePrefabs` into scene-load + Beacon adopts prefab instances.
- `M20-a..l` netcode rework (carried from Sprint 32).
- `M2b-seed`, `13.13` audio, `10.5+` C# WS transport.

### Old Sprint 34 details (kept until archive merges)

## Sprint 34 — Phase 2 visible delta: lights + shadows + IBL + cache polish (DONE — archive merging)

Sprint 34 picks up the M21 Phase 2 sequencing from `docs/research/renderer-ecs-split-investigation.md` §8.9: highest visible delta first. After 12 stories of plumbing in Sprint 33, this sprint is **what the picture looks like** — lights as ECS components, basic shadow maps, a fallback IBL environment so PBR materials don't render flat. Plus M16-cache-b to finish the perf path the bench number called out, and three small Codex-review follow-ups.

### Stories

#### M21 — Phase 2 lighting and environment

- `M21-light-schema` ✅ Implemented. `schemas/scene.schema.json` gains a polymorphic `Light` component (kind discriminator: `directional` / `point` / `spot` / `ambient` / `hemisphere` / `rect-area`) + a sibling `ShadowFlags` ({cast, receive}) component for M21-shadow-basic. `allOf + if/then` per-kind constraints layer point/spot/directional/hemisphere/rect-area fields without losing strict validation. 11 schema unit tests in `tests/unit/scene-light-schema.test.ts` cover happy paths + unknown kind / bad color / out-of-range intensity / unsupported mapSize / spot angle > π/2 / ShadowFlags shape.
- `M21-light-directional-point` Implement `LightLifecycleSystem` + `LightSyncSystem` covering `directional` / `point` / `ambient`. Adapter grows `acquireLight` / `releaseLight` / `setLightParams` / `setLightTransform`. Replace the hard-coded `AmbientLight + DirectionalLight` fallback with a `AGF_NO_LIGHTS` diagnostic when a scene declares zero lights (then keeps the fallback). Hello-3D and Beacon scenes adopt explicit `Light` entities.
- `M21-light-directional-point` ✅ Implemented. `engine/render/light-handle-registry.ts` + `engine/render/systems/light-lifecycle-system.ts`. Adapter grows `acquireLight` / `releaseLight` / `setLightParams` / `setLightTransform` / `setLightCastShadow` for `directional` / `point` / `ambient` kinds. Fallback ambient + directional auto-disabled when first ECS light appears; re-enabled + `AGF_NO_LIGHTS` diagnostic emitted when scene loses every Light. Kind-change triggers release + re-acquire (Three.js can't hot-swap light class). Unsupported kinds (spot / hemisphere / rect-area) emit `AGF_LIGHT_KIND_UNSUPPORTED` until M21-light-spot-hemisphere-rect lands. 8 unit tests.
- `M21-shadow-basic` ✅ Implemented. Per-light `castShadow` + per-mesh `ShadowFlags { cast, receive }` (default both true). `MeshTransformSyncSystem` reads ShadowFlags + calls `adapter.setMeshShadowFlags` per frame; `LightLifecycleSystem` calls `adapter.setLightCastShadow` with full shadow camera params from `Light.shadow`. Adapter enables `device.shadowMap` globally with `PCFShadowMap` (PCFSoftShadowMap was deprecated in r184). `rendererInfo()` exposes `shadowCasters`. Beacon-World adopts a high-noon sun (`light.sun` at `(4, 14, 5)` castShadow=true) + ambient + cool fill; Hello-3D adopts a sun + ambient. Per-mesh ShadowFlags on `ground` / `floor` set cast=false to avoid ground shadowing itself.
- **Beacon point-light halos over beacons** ✅ Implemented. `examples/beacon-world/src/systems/beacon-light-system.ts` — frame-update System reads `BeaconLight { beaconId, repairedIntensity, brokenIntensity }` + paired `Light`; writes `Light.intensity` based on the linked beacon's `Repairable.repaired` flag. Beacon scene gets `light.beacon.west` and `light.beacon.east` point lights (green `#4af0a8`) that gate by repair state. 5 unit tests. **Catch from debug session: BeaconLightSystem registration was missing from `bootstrap.ts` initially — restored.**
- `M21-env-generated` ✅ Implemented. `ThreeRenderAdapter.setEnvironment(kind)` builds `RoomEnvironment` via `PMREMGenerator` and assigns to `scene.environment`; idempotent + disposes texture on swap/dispose. Scene schema gains `environment: { kind: "generated" | "none" }` top-level (Ajv: 5 unit tests). `startRuntime` applies `options.scene.environment?.kind ?? "generated"` after renderer construction. Default ON for every project; opt out via `"environment": { "kind": "none" }`. Beacon-World + Hello-3D inherit the default and gain natural PBR reflections out of the box.

#### M22 — ECS perf follow-ups

- `M16-cache-b` ✅ Implemented. `World.consumeDirty(name)` reads + clears an incremental dirty set populated by `setComponent` / `removeComponent` / `removeEntity`. `TransformResolveSystem` maintains its own `inputCache: Map<EntityId, TransformInput>`, seeds once when a new world arrives, then per frame rebuilds inputs ONLY for `world.consumeDirty("Transform")` entries. Drops the per-frame `world.entityIds()` scan + the deg→rad conversion for clean entities. 2 new unit tests confirm dirty-set is consumed + world-swap re-seeds. **Bench: 10k chain-of-8 @ 1%-dirty ≈ 8.1 ms** (~13% narrow win vs M16-cache-a alone). Larger payoff comes from `M16-cache-c` (push the dirty-aware path into the cache layer itself); current bottleneck is the O(N) revision read inside `createHierarchyCache.resolveWorld`.
- `M22-allocations` ✅ Implemented. `benchmarks/ecs/alloc.ts` — standalone bench launched via `node --expose-gc` (script `npm run bench:ecs:alloc`). Forces GC, measures `process.memoryUsage().heapUsed` delta over N iterations, reports `bytes/op` + `heap delta KB`. Four cases × three sizes (100 / 1k / 10k): no-cache resolver / cached steady-state / cached 1%-dirty / snapshotWorld. **Findings at 10k**: hierarchy resolve allocates ~2.1 MB / op, cached steady-state ~890 KB / op, 1%-dirty + snapshot ~1.2 MB / op. Baseline JSON at `docs/research/ecs-allocations-baseline.json`. Big numbers point at `M16-cache-c` (Map reuse + matrix scratch pooling) as the next perf lever.

#### Codex-review follow-ups

- `M17-doctor` ✅ Implemented. `engine/tools/doctor/batch-candidates.ts` walks every `.scene.json` under `<projectDir>/scenes/`, groups `MeshRenderer` entities by `mesh|material|cast:receive` (the exact key M17 bucketer will use), and surfaces top buckets + singleton isolation reasons through `engine doctor`. Beacon-World today: 8 renderable → 6 buckets, 2 draw calls saved (beacon.west+east, core.north+south). Hazards isolate because their materials differ; ground/drone isolate as unique meshes. 4 unit tests (happy path / shadow-flag split / unique-mesh note / empty scene).
- `SYS-rule-createquery` ✅ Implemented. `scripts/check-system-queries.mjs` scans `engine/render/systems/`, `engine/core/systems/`, and every `examples/*/src/systems/` for `world.query(` calls; fails with line numbers + remediation hint. Cold-path opt-out via `// agf-allow: world.query` comment on the line or directly above. Wired into preflight as `npm run systems:check`. AGENTS.md gets a new Hard Rule pointing at the 18,000× cached-vs-uncached benchmark. Fixed `CameraSyncSystem` (was calling `world.query()` twice per frame) to use cached `QueryHandle`s; annotated cold paths in `MaterialBindingSystem.forgetAssetBinding` and Beacon's `round-reset.ts`.

#### Renderer follow-ups surfaced this sprint

- `M21-shadow-soft` Re-evaluate `PCFSoftShadowMap` vs `PCFShadowMap` vs `VSMShadowMap` when three.js stabilises soft shadows. r184 deprecated `PCFSoftShadowMap` (it aliases to `PCFShadowMap` with a runtime warning); document the chosen path + add a `renderer.shadowMap.type` field to `project.json#renderer.shadows` once VSM is on the M21-shadow-algorithm story.
- `M21-shadow-glb-acne` Self-shadow polish on low-poly GLB meshes (drones / beacons / cores / hazards). Beacon's hazards animate scale (0.35 → 1.6) which interacts badly with world-space `normalBias`; current tuning `bias=-0.008, normalBias=0.22` works across the range but is empirically chosen, not derived. Investigate per-material `shadowSide = THREE.BackSide`, scale-aware bias, or polygonOffset overrides authored in the material manifest.

#### M23 — Agent-driven dev-tuner UI (new)

- `M23-tuner` ✅ Implemented. `engine/runtime/dev-tuner.ts` — agent-spawnable floating slider panel bound to component-field paths. Surface: `window.__agf.dev.tuner.{add,remove,removeAll,list}` with `{ name, target: { entityId, component, path }, min, max, step?, value?, label? }`. Each drag fires `applyCommands([{ kind: "component.set", ... }])` so the change flows through the existing pipeline (snapshot / HMR / network / replay / persistence). Panel is DOM, NOT in ECS — `__agf.snapshot()` never sees it. Per-frame poll keeps the displayed value in sync when other systems write the same field. Path helpers `getByPath` / `setByPath` exported + 6 unit tests; e2e spec asserts add→drag→snapshot-reflects→remove→panel-gone. Agent docs: `docs/agent/dev-tuner.md` (when to spawn, common patterns: shadow bias, FOV, material roughness; explicit non-goals).

### Carried to Sprint 35+

#### Utsubo-driven follow-ups (`Notes/utsubo_threejs_best_practices_100_tips.md`)

- `M21-frame-timing` Per-phase frame timing in dev snapshot (`inputMs` / `fixedUpdateMs` / `physicsMs` / `transformResolveMs` / `renderSyncMs` / `renderMs` / `postMs`). Plumbing on the `DiagnosticsBus` + exposed via `__agf.snapshot().frameTiming`. Useful agent signal for "which phase to optimise next".
- `M21-tsl-investigate` Spike: evaluate Three.js TSL / NodeMaterial for AGF custom-material manifest path. Target: portable WebGL+WebGPU shader authoring without forcing agents to write WGSL + GLSL variants. Output: research doc + a recommendation on whether to defer until WebGPU renderer or adopt early as a v1 material kind.
- `M21-webgpu-spike` Async WebGPU renderer adapter behind a profile flag (`project.json#renderer.backend: "auto" | "webgl" | "webgpu"`). `runtime.start()` becomes await-friendly. Keeps WebGL as default until tests cover both paths.
- `M21-context-loss` Listen for WebGL `webglcontextlost` / `webglcontextrestored`; emit `AGF_RENDER_CONTEXT_LOST` / `AGF_RENDER_CONTEXT_RESTORED` diagnostics; rebuild renderer resources on restore.
- `M21-light-budgets` `performance-budget.json#renderer.maxActiveLights` / `maxShadowCastingLights` / `maxShadowMapSize` + `engine doctor` warnings.
- `M21-shadow-static` `renderer.shadowMap.autoUpdate = false` for declared-static shadow casters with explicit invalidation API. Big win for "huge level + a few moving things" scenes.
- `M21-post-pipeline` Schema-driven post-processing chain (`project.json#renderer.post: [...]`) with selective bloom + FXAA + bloom intensity + per-pass budgets + tonemap at end. (Note: this is the M21 Phase-2 `M21-post-*` thread, sharpened.)
- `M17-batched-mesh` Multi-geometry / shared-material `BatchedMesh` buckets, sibling to M17-bucketer's InstancedMesh path.
- `M17-material-sharing-doctor` Doctor check: detect duplicate material signatures + report which manifests could be merged.
- `M17-static-merge-spike` Static geometry merge with reverse `EntityId` lookup for picking. Strictly opt-in per-entity (`StaticMerge` tag); not on by default.
- `M17-lod` `LOD { levels: [{ maxDistance, mesh }] }` component + integration with batching's per-instance LOD path.
- `ASSET-decoder-paths` Single shared `DRACOLoader` + `KTX2Loader` constructed at adapter init; `KTX2Loader.detectSupport(renderer)` once. AGENTS rule already calls this out.
- `ASSET-compression` Runtime support for KTX2 (UASTC normal + ETC1S diffuse) + Draco / Meshopt geometry. `GLTFLoader.setKTX2Loader` + `setMeshoptDecoder` wired in.
- `ASSET-gltf-transform-investigate` Decide tooling: dev dep vs external CLI vs optional agent skill.
- `ASSET-optimize-command` `engine asset optimize <project> <asset>` CLI invoking gltf-transform with project presets; writes `assets/runtime/...` from `assets/_sources/...`.
- `ASSET-lod-metadata` LOD schema + `engine check` validation (distances strictly increasing, fallback declared).
- `ASSET-texture-doctor` Doctor warnings: huge uncompressed PNG/JPEG in production profile, NPOT mismatches for compression formats, multiple active KTX2 loader instances, GLB references KTX2 but transcoder path missing.
- `RUNTIME-progressive-loading` Asset manifest `priority: "critical" | "deferred"` + placeholder primitive + scene phases. Playtests wait for `priority: critical` instead of arbitrary timeouts.
- `RUNTIME-renderer-ready` Async "renderer-ready" signal on `runtime.start()` for tests + dev bridge to await before screenshots / commands.
- `RUNTIME-resource-leak-tests` HMR + adapter lifecycle leak tests across 30 cycles; assert `renderer.info.memory` / `info.programs` / `info.textures` stay bounded.
- `RUNTIME-idle-rendering` Render-on-demand mode for static menus / inspector tools. Optional `renderer.demand: true` project flag.
- `RUNTIME-gpu-timing` Feature-detected GPU timing queries (`EXT_disjoint_timer_query_webgl2`) in dev builds, surfaced through frame-phase snapshot.

#### Sprint 34 carry-overs (pre-utsubo)

- `M24-investigate` Rapier WASM bundling + fixed-step spike. Anchor: `Notes/colliders_physics_implementation_analysis.md`. Goal: prove `@dimforge/rapier3d-compat` can be bundled via Vite, stepped via a fixed-dt loop, and disposed cleanly across HMR; measure bundle delta vs `bundle:check` budget. No engine integration yet — `spikes/physics-rapier-v0/`.
- `M24-schema` `RigidBody3D` / `Collider3D` / `PhysicsMaterial3D` JSON schemas + diagnostics (`AGF_COLLIDER3D_KIND_INVALID`, `AGF_RIGIDBODY3D_DYNAMIC_TRIMESH`, `AGF_RIGIDBODY3D_PARENTED_DYNAMIC`, layer name validation, etc.).
- `M24-adapter` `engine/physics/rapier/` adapter. Internal handle maps (`entityToBody`, `entityToColliders`, `bodyToEntity`, `colliderToEntity`, `lastBodySignature`). Lifecycle: `init` / `sync` / `step` / `dispose`. Primitive box/sphere/capsule/cylinder colliders. Fixed-step loop runs after gameplay fixed systems, writes dynamic body transforms back to `Transform`. M22 derived-cache rules apply: rebuildable, parity-tested, no authoring API exposed.
- `M24-sync` Transform ↔ Rapier sync rules per body kind (fixed = ECS → body; kinematic = ECS target → body, post-step read; dynamic = body → ECS `Transform`). Teleport via explicit `physics.teleportBody` command.
- `M24-sensors` Trigger volumes via `Collider3D.sensor = true`. Runtime-only derived components: `OverlappingTriggers3D`, `CurrentContacts3D`, `Grounded3D`. Collision events buffered per fixed step, drained by `CollisionStateSystem` before gameplay reads.
- `M24-raycast` `runtime.physics.raycast({ origin, direction, maxDistance, mask })` returning `EntityId` + hit point/normal/distance. `runtime.physics.overlap({ shape, position, mask })` for area queries.
- `M24-character` `CharacterController3D` schema + kinematic capsule wrapper around Rapier's controller. Exposes derived `grounded` / `groundNormal` / `collisions` state via runtime-only components.
- `M24-debug` Rapier `world.debugRender()` overlay (line segments) toggleable in dev. `engine doctor` reports body/collider counts + dynamic vs static breakdown. HMR leak test ensures body count stays bounded.
- `M24-static-mesh` Fixed-body `trimesh` + `heightfield` colliders from GLB assets. `engine check` warns on huge trimesh, rejects dynamic trimesh, validates heightfield dimensions.
- `M21-light-spot-hemisphere-rect`, `M21-light-fallback` diagnostic finish.
- `M21-shadow-csm` (CSM addon), `M21-shadow-algorithm` (PCSS / VSM).
- `M17-bucketer` / `M17-batched-mesh` / `M17-lod` / `M17-bvh-culling`.
- `M21-mat-*` (Physical / Unlit / Lambert / Phong / custom shader / `onBeforeCompile` / textures + KTX2).
- `M21-post-*` (Composer + Bloom / FXAA / SMAA / SSAO / Outline).
- `M21-color`, `M21-env-hdr`, `M21-env-cube`, `M21-cam-*`.
- `M20-a..l` netcode rework implementation (carried from Sprint 32).
- `M3-c-load` + `M3-c-beacon`.
- `M16-cache-c` (reused matrices), `M16-cache-d/e`.
- `M2b-seed`, `13.13` audio, `10.5+` C# WS transport.
