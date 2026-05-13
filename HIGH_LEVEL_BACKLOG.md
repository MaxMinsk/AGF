# High-Level Backlog

Date: 2026-05-13

This file tracks roadmap epics and broad priorities. Detailed story work belongs in `BACKLOG.md` only for the active sprint and the next sprint.

## Product North Star

Build AgentsGameFramework (AGF), a lightweight agent-first web game framework:

- TypeScript browser runtime.
- Three.js renderer.
- Pragmatic ECS and command pipeline.
- JSON/JSON Schema project files.
- Agent-visible diagnostics, tests, screenshots and playtests.
- Backend-agnostic protocol/world contracts for persistent shared-world multiplayer.
- Optional reference backends, starting with C#/.NET but not limited to it.
- Public engine repository root with example games nested under `examples/`.

## Current Focus

1. Scaffold the TypeScript/Vite workspace.
2. Create the first JSON scene path.
3. Render a primitive 3D scene.
4. Establish validation, typecheck, unit tests and Playwright smoke tests.
5. Keep asset organization and source metadata from drifting.

## Roadmap Epics

| Epic | Status | Notes |
| --- | --- | --- |
| Sprint 0 docs and rules | Archived | Baseline docs, ADRs, Claude setup and research notes exist. |
| Toolchain and tests | Archived | Vite, TypeScript, Vitest, Playwright — wired in Sprint 1. |
| Scene/project schemas | Archived | JSON source of truth and diagnostics — shipped in Sprint 1. |
| Asset organization | Archived | Source metadata, runtime folder layout, asset reference validation — Sprint 1. |
| ECS core | Archived | Pragmatic Map-backed world shipped in Sprint 1. |
| Command pipeline | Archived | v0 with `entity.create`/`entity.delete`/`component.set`/`scene.load` — Sprint 1. |
| Three.js renderer | Archived | v0 covers primitive meshes (`box`, `sphere`, `plane`) — Sprint 1. GLB still to come. |
| Agent CLI | Archived | `engine check` and `engine inspect` v0 shipped in Sprint 1. |
| Agent reliability infrastructure | Archived | Preflight script, debug protocol, template policy and quality axes docs exist. |
| Material and shader system | Archived | Material manifest v0 + shader spike shipped in Sprint 2; runtime shader compile is a later epic. |
| Runtime asset loading | Archived | Asset registry, loader contracts and material binding shipped in Sprint 2; first real `.glb` import (hand-rolled cube) landed in Sprint 3. |
| Hot reload | Archived | Scene diff and Vite HMR for scene JSON shipped in Sprint 2. Asset (material/shader) hot reload remains a Sprint 5+ candidate. |
| Playtest runner | Archived | Runtime inspect API + scripted robot playtest shipped in Sprint 2. |
| Persistent world backend contracts | Archived | Protocol schema v0, node-world-server skeleton and Networked/Presence components shipped in Sprint 5. First real transport (WebSocket / SignalR) is a follow-up. |
| Repo hygiene CI | Archived | Cyrillic-in-repo check shipped in Sprint 2. |
| Template policy | Active | Maintained examples as templates, not one-shot generated archives. |
| Reference backend implementations | Active | Node skeleton landed in Sprint 5 (no transport yet). C#/.NET mirror under `examples/backends/dotnet-world-server/` is still pending. |
| Beacon World sample | Active | Scaffold + scene + drone movement shipped through Sprint 4; pickups, carry/deposit and hazards remain. |
| Rapier physics | Later | 3D first, 2D later. |
| Inspector overlay | Active | Sprint 5+ candidate — in-page entity/component overlay, toggle hotkey TBD (not F12, not F2). |
| 2D renderer layer | Later | Orthographic/sprite path after 3D vertical slice. |
| Audio | Later | Positional audio and UI/music buses. |
| Production asset pipeline | Later | Texture compression, LODs, automated Blender/Meshy tooling. |
| Remote/CDN asset delivery | Later | AGF-flavoured "Addressables-lite": asset catalog manifest with hashed URLs, CORS-aware loaders, persistent browser cache (IndexedDB/Cache API), versioned cache busting, progress events and lazy bundles. Builds on top of the existing `AssetRegistry`. |
| Executable agent skills | Later | Turn repeated AGF workflows into runnable skill helpers after failures are known. |
| Benchmark-style reports | Later | Build/runtime/scene/playtest/visual/protocol health summary. |
| Workspace/package split | Later | Consider workspaces only after boundaries become painful. |
| Procedural Character Generator | Later | Standalone tool inside the engine. Node-graph UI; emits a rigged + Mixamo-animatable mesh (human, robot, dog, spider, …) for use as a runtime asset. Tracked in its own backlog: `docs/proposals/procedural-character-generator.md`. Take it on once Beacon World gameplay v0 is stable; staffing it earlier blocks game progress. |

## Parking Lot

- WebGPU backend exploration.
- PixiJS adapter for advanced 2D.
- MessagePack/protobuf network protocol.
- Raw WebSocket transport for action games.
- Shader hot reload.
- Navmesh/pathfinding.
- Particle system.
- In-browser inspector editing that writes JSON patches.
- Sandbox/container strategy for untrusted generated projects.
- Docs split into `docs/users` and `docs/developers` when documentation grows.
- Optional visual review using screenshots after deterministic checks pass.
- (Promoted to Sprint 2 Epic 12: Cyrillic-in-repo CI check.)

## Promotion Rule

Move an epic from this file into `BACKLOG.md` only when:

- it is part of the active sprint or next sprint;
- it has story-level acceptance criteria;
- it has a clear verification path;
- it does not depend on unresolved architecture decisions.
