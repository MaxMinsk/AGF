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

## Current Sprint: Sprint 3 - Sample Game Kickoff And GLB Smoke

Goal: bring up the Beacon World sample as a nested project, populate its first scene with a readable solo-first composition, and close the Sprint 2 follow-up by routing a real `.glb` through the asset registry into the renderer.

### Epic 13: Beacon World Sample Game

**Story 13.1: Beacon World Project Scaffold**

Status: Implemented.

Tasks:

- Create `examples/beacon-world/project.json` with `id`, `name`, `startScene`, `assetRoot`, `render` and `profiles`.
- Create `examples/beacon-world/scenes/start.scene.json` with a camera + ground plate so the scene is valid.
- Create `examples/beacon-world/assets/{source,runtime,_sources}/` with an `asset-sources.json` and `.gitkeep` files for empty folders.
- No new engine code — scaffold only.

Acceptance criteria:

- `npm run engine:check -- examples/beacon-world` returns OK.
- `npm run engine:inspect -- examples/beacon-world` prints the camera and ground entities.
- The project follows the layout in `docs/agent/asset-authoring-checklist.md`.

Verification:

- `npm run engine:check -- examples/beacon-world`
- `npm run engine:inspect -- examples/beacon-world`

**Story 13.2: Beacon World First Scene** (next)

Tasks/acceptance/verification expanded when picked up.

### Epic 14: Asset Pipeline Polish

**Story 14.1: Minimal GLB For hello-3d** (next)

Tasks/acceptance/verification expanded when picked up.

### Deferred

- Epic 10 (Backend contracts) — deferred to ~Sprint 5 by stakeholder decision.

### Sprint 3 Candidates Not Picked Yet

- `14.2` Production asset serving — fix `dist/` build so material/glb references resolve in `npm run build`.
- `15.1` In-page inspector overlay — toggle hotkey TBD (not F12, not F2), entity/component tree, read-only first.
- `16.1` Material file hot reload — `*.material.json` edits flow through the asset registry without a page reload.
- `17.1` Scene editor command palette — DOM panel that runs `applyCommands` with autocomplete on entity/component names.

## Next Sprint: TBD

Will be detailed when Sprint 3 reaches close.
