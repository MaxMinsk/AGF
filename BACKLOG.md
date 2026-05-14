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

- `M21-light-schema` Add `Light` JSON Schema (kind discriminator: `directional` / `point` / `spot` / `ambient` / `hemisphere` / `rect-area`). Per-kind fields: `color`, `intensity`, plus kind-specific (`distance` / `decay` / `angle` / `penumbra` / etc.). Validation surface: `engine check` rejects malformed lights.
- `M21-light-directional-point` Implement `LightLifecycleSystem` + `LightSyncSystem` covering `directional` / `point` / `ambient`. Adapter grows `acquireLight` / `releaseLight` / `setLightParams` / `setLightTransform`. Replace the hard-coded `AmbientLight + DirectionalLight` fallback with a `AGF_NO_LIGHTS` diagnostic when a scene declares zero lights (then keeps the fallback). Hello-3D and Beacon scenes adopt explicit `Light` entities.
- `M21-shadow-basic` Per-light `castShadow` + per-mesh `ShadowFlags { cast, receive }` component (default both true if absent). `MeshLifecycleSystem` reads `ShadowFlags` and configures `mesh.castShadow` / `mesh.receiveShadow`. `LightLifecycleSystem` configures `light.shadow.*` from `Light.shadow`. Renderer enables `PCFSoftShadowMap`. Cost gate: ≤ baseline × 1.25 at 1k entities + 1 shadow-casting directional.
- `M21-env-generated` `EnvironmentSystem` builds `RoomEnvironment` via `PMREMGenerator` once per scene load and assigns to `scene.environment`. Default ON so PBR materials look correct out of the box. Scene-level off-switch via `scene.environment: { kind: "none" }`.

#### M22 — ECS perf follow-ups

- `M16-cache-b` Replace the per-frame entity scan in `TransformResolveSystem` with an incremental dirty queue maintained by `World.setComponent` hooks. Target: steady-state path becomes O(dirty) not O(N). Push 10k chain-of-8 toward < 1 ms.
- `M22-allocations` Allocation-focused bench for hierarchy resolve + renderer sync (Codex callout). `--expose-gc` + `process.memoryUsage().heapUsed` deltas per case. Adds `npm run bench:ecs:alloc`.

#### Codex-review follow-ups

- `M17-doctor` `engine doctor` reports batch candidates (entities that share mesh + material + shadow flags) and explains why others wouldn't batch. Sizes the bucketer story before writing it.
- `SYS-rule-createquery` Add to AGENTS.md: "Systems must cache `createQuery` handles, never call `world.query()` per frame in a hot path." Lightweight `engine check` warning when a file under `engine/**/systems/` calls `world.query(` directly.

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
