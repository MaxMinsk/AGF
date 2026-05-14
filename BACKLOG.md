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

## Current Sprint: Sprint 34 — Phase 2 visible delta: lights + shadows + IBL + cache polish

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

- `M16-cache-b` Replace the per-frame entity scan in `TransformResolveSystem` with an incremental dirty queue maintained by `World.setComponent` hooks. Target: steady-state path becomes O(dirty) not O(N). Push 10k chain-of-8 toward < 1 ms.
- `M22-allocations` Allocation-focused bench for hierarchy resolve + renderer sync (Codex callout). `--expose-gc` + `process.memoryUsage().heapUsed` deltas per case. Adds `npm run bench:ecs:alloc`.

#### Codex-review follow-ups

- `M17-doctor` `engine doctor` reports batch candidates (entities that share mesh + material + shadow flags) and explains why others wouldn't batch. Sizes the bucketer story before writing it.
- `SYS-rule-createquery` Add to AGENTS.md: "Systems must cache `createQuery` handles, never call `world.query()` per frame in a hot path." Lightweight `engine check` warning when a file under `engine/**/systems/` calls `world.query(` directly.

#### Renderer follow-ups surfaced this sprint

- `M21-shadow-soft` Re-evaluate `PCFSoftShadowMap` vs `PCFShadowMap` vs `VSMShadowMap` when three.js stabilises soft shadows. r184 deprecated `PCFSoftShadowMap` (it aliases to `PCFShadowMap` with a runtime warning); document the chosen path + add a `renderer.shadowMap.type` field to `project.json#renderer.shadows` once VSM is on the M21-shadow-algorithm story.
- `M21-shadow-glb-acne` Self-shadow polish on low-poly GLB meshes (drones / beacons / cores / hazards). Beacon's hazards animate scale (0.35 → 1.6) which interacts badly with world-space `normalBias`; current tuning `bias=-0.008, normalBias=0.22` works across the range but is empirically chosen, not derived. Investigate per-material `shadowSide = THREE.BackSide`, scale-aware bias, or polygonOffset overrides authored in the material manifest.

#### M23 — Agent-driven dev-tuner UI (new)

- `M23-tuner` ✅ Implemented. `engine/runtime/dev-tuner.ts` — agent-spawnable floating slider panel bound to component-field paths. Surface: `window.__agf.dev.tuner.{add,remove,removeAll,list}` with `{ name, target: { entityId, component, path }, min, max, step?, value?, label? }`. Each drag fires `applyCommands([{ kind: "component.set", ... }])` so the change flows through the existing pipeline (snapshot / HMR / network / replay / persistence). Panel is DOM, NOT in ECS — `__agf.snapshot()` never sees it. Per-frame poll keeps the displayed value in sync when other systems write the same field. Path helpers `getByPath` / `setByPath` exported + 6 unit tests; e2e spec asserts add→drag→snapshot-reflects→remove→panel-gone. Agent docs: `docs/agent/dev-tuner.md` (when to spawn, common patterns: shadow bias, FOV, material roughness; explicit non-goals).

### Carried to Sprint 35+

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
