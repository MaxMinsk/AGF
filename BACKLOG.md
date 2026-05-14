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

- `ECS-B1` Add benchmark harness (`benchmarks/ecs/*.bench.ts`, lightweight runner — `tinybench` or zero-dep loop).
- `ECS-B2` Benchmark current Map query patterns at 100 / 1k / 10k entities (snapshot, hierarchy resolve, single-component query, multi-component query, cached `createQuery`).
- `ECS-B3` Benchmark batch-bucket collection (anticipating M17). Baseline numbers gate every future ECS storage change.

#### M21 — Renderer → ECS systems

- `M21-investigate` Write `docs/research/renderer-ecs-split-investigation.md`. Audit `ThreeRenderer` responsibilities; propose `CameraSyncSystem` / `MeshLifecycleSystem` / `MeshTransformSyncSystem` / `MaterialBindingSystem` / future `BatchingSystem`; preserve renderer-import-boundary; benchmark cost vs current monolithic class.

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
