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

## Current Sprint: Sprint 2 - Agent Loop And Asset Runtime

Goal: make the scene editable by agents, add the first gameplay systems, prototype JSON hot reload, add material/shader manifests, add runtime asset loading, and scaffold backend-agnostic persistent-world contracts.

Stories below are listed at the epic level. Each story must be expanded with tasks, acceptance criteria and verification at the moment it is picked up.

### Epic 6: Gameplay Systems v0

**Story 6.1: System Scheduler**

Status: Implemented.

Tasks:

- Define a `System` shape with a unique `name` and an optional `fixedUpdate(context)` hook.
- Define a `SystemContext` exposing the active `World` and current `TimeContext`.
- Implement `SystemScheduler` with `register`, `unregister`, `has`, `systemNames`, `size` and `runFixedStep`.
- Wire the scheduler into `startRuntime` so registered systems run on every fixed step.
- Keep `engine/core/systems/` independent from Three.js, DOM and Vite.

Acceptance criteria:

- Multiple systems can be registered and run in registration order on every fixed step.
- Registering a system with a duplicate name throws an actionable error.
- A system without `fixedUpdate` is skipped without affecting the rest.
- A runtime with no scheduler behaves exactly as before (no regressions).

Verification:

- Vitest suite for the scheduler (registration, run order, missing hook, duplicate guard, unregister re-index).

**Story 6.2: Sample Movement System** (planned)

Tasks/acceptance/verification will be expanded when picked up.

### Epic 7: Scene Patches And Hot Reload

Stories:

- `7.1`: Scene diff to commands.
- `7.2`: JSON scene hot reload in dev.

### Epic 8: Material And Shader v0

Stories:

- `8.1`: Material manifest.
- `8.2`: Shader manifest spike.

### Epic 8.5: Runtime Asset Loading v0

Stories:

- `8.3`: Asset registry and loader contracts.
- `8.4`: First GLB import path.
- `8.5`: Asset authoring checklist for Beacon World.

### Epic 9: Agent Playtest Loop

Stories:

- `9.1`: Runtime inspect API.
- `9.2`: Robot smoke playtest.

### Epic 10: Backend-Agnostic Persistent World Seam

Stories:

- `10.1`: Protocol schema v0.
- `10.2`: Reference backend skeleton boundary.
- `10.3`: Network/world components in schema.

### Epic 12: Repo Hygiene

Stories:

- `12.1`: GitHub Action that fails CI on Cyrillic characters in tracked repo files; excludes `Notes/`, `References/`, `node_modules/`, binary assets.

## Sprint 2 Demo

Sprint 2 is done when:

- An agent can edit scene JSON and dev runtime applies a patch.
- There is a movable entity with system logic and unit tests.
- `engine inspect` and runtime inspect API expose world snapshots.
- Material and shader manifests exist.
- Asset registry can load at least one runtime asset path.
- Robot playtest can drive the scene and save screenshot/metrics.
- Backend contracts exist, and any reference server code is isolated under `examples/backends/`.
- CI fails on Cyrillic characters in tracked repo files.

## Next Sprint: TBD

The next sprint will be detailed when Sprint 2 reaches close. Candidates come from `HIGH_LEVEL_BACKLOG.md` (material/shader v1, asset pipeline polish, Beacon World scaffold, inspector overlay, physics v0).
