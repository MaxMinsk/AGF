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

## Current Sprint: Sprint 33 — TBD

Sprint 33 focus is picked at sprint start. Agent-first priority from `CLAUDE.md` applies. Default sprint size is 8–12 stories per `feedback-sprint-size`.

### Candidates

#### M22 — ECS performance & design discipline (start with benchmarks)

- `ECS-B1` ✅ Implemented. Zero-dep runner at `benchmarks/ecs/runner.ts` (warm-up + mean / p50 / p99 / ops-per-sec). `npm run bench:ecs` CLI with `--suite` filter + `--json` mode. README + baseline JSON in `docs/research/ecs-benchmarks-baseline.json`. Not in preflight (timing noise).
- `ECS-B2` ✅ Implemented. Three suites: `ecs-snapshot` (snapshotWorld), `ecs-query` (single / two-component / cached `createQuery` / rare-match), `ecs-hierarchy-resolve` (flat + chain-of-8) at 100 / 1k / 10k entities. **Findings:** `resolveHierarchy chain-of-8 @ 10k = ~12 ms` (73% of 60-FPS budget — `M16-cache` is mandatory before > 1k hierarchical entities); cached `createQuery` is ~18,000× faster than per-frame `world.query()` — every system must use it.
- `ECS-B3` Benchmark batch-bucket collection. Deferred until `M17-bucketer` starts (no system to bench yet).
- `M16-cache-a` ✅ Implemented. `World.componentRevision(id, name)` per-component data-revision counter (bumped on `setComponent`, zeroed on `removeComponent` / `removeEntity`). `createHierarchyCache()` in `engine/core/transform/resolve-cached.ts` with two fast paths: (1) zero-dirty steady-state returns cached `ResolvedTransform` refs (referential-equality-friendly); (2) mixed-dirty path does a topological partial walk, composing only dirty subtrees from cached parent worlds. 6 unit tests + 2 new bench cases (steady-state + 1%-dirty). **Results** at chain-of-8 @ 10k entities: no-cache 12.9 ms → steady-state 5.4 ms (~2.4× faster) → 1%-dirty 8.2 ms (~1.6× faster). Baseline refreshed.
- `M16-cache-b` Next: incremental dirty-set maintained by `setComponent` hook instead of per-frame entity scan. Target: steady-state path becomes O(dirty) not O(N). Push 10k chain-of-8 toward < 1 ms.

#### M21 — Renderer → ECS systems

- `M21-investigate` ✅ Implemented. `docs/research/renderer-ecs-split-investigation.md` — audit of `ThreeRenderer` (12 responsibilities), proposed 5-system split + `ThreeRenderAdapter`, 5 renderer-internal components, renderer-import-boundary preserved, perf gates (frame-time ≤ baseline × 1.05 at 1k entities), Phase-1 8-story implementation queue (`M21-a..g` + `M21-boundary-check`), Phase-2 Unity-class roadmap (materials, lights, shadows, batching/instancing, post-processing, color/tonemap, IBL, camera features) with cross-references to Three.js examples and a sprint-by-sprint sequencing.
- `M21-a` ✅ Implemented. `engine/render/three-render-adapter.ts` — narrow Three.js touchpoint with opaque `MeshHandle` / `CameraHandle` numeric IDs. API: `acquireMesh` / `releaseMesh` / `setMeshGeometry` / `setMeshMaterialPatch` / `setMeshTransform` / `acquireCamera` / `releaseCamera` / `setCameraParams` / `setCameraTransform` / `setActiveCamera` / `hasActiveCamera` / `resize` / `draw` / `dispose` / `info`. Three.js types no longer leak through the adapter boundary. `ThreeRenderer` refactored to hold `Map<EntityId, MeshHandle>` + `cameraHandle` internally and call only adapter methods. Behaviour identical: all 279 unit tests + 23 e2e tests green. Sets the seam for `M21-b..f` to peel each `refresh*` path out into its own scheduler-registered System.
- `M21-b` Introduce `LocalToWorld` component + `TransformResolveSystem`. Renderer reads `LocalToWorld` instead of recomputing inline. Gated on `M22 / ECS-B*` baseline.
- `M21-c..g` queued (see HIGH_LEVEL_BACKLOG M21 row).

#### M20 — Netcode rework (implementation)

- `M20-a` Protocol: add `player.state` to `schemas/protocol.schema.json` (sequence + position + optional rotation).
- `M20-b` Scene schema: `Networked.authority = "client-owned"` alongside the existing `"server"`. Beacon's `player.drone` becomes client-owned.
- `M20-c` Server: `ServerWorld.applyPlayerState` accepts client position, optional `speed * dt` clamp.

#### M3 — Prefab runtime integration

- `M3-c-load` Wire `expandScenePrefabs` into the scene-load path so any project can declare `instances: [...]` alongside `entities` and have them materialise.
- `M3-c-beacon` Beacon World's repeated cores / hazards become prefab instances.

#### Carry-overs / standing items

- `M15-i` `engine connect <url> <verb>` CLI — small convenience wrapper. Skip if not pulled into focus.
- `M2b-seed` Wire deterministic RNG (still waiting for a system that rolls dice).
- `13.13` Audio asset path — blocked on an audio loader.
- `10.5+` C# WS transport.
