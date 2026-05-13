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

## Current Sprint: Sprint 4 - Browser Polish And Gameplay v0

Goal: unblock viewing Beacon World in the browser, make `npm run build` ship runtime assets correctly, and add the first gameplay loop to Beacon World.

### Epic 18: Project Switcher

**Story 18.1: URL-Driven Project Switcher**

Status: Implemented.

Tasks:

- Statically import `project.json` and `start.scene.json` for both `hello-3d` and `beacon-world` in `src/main.ts`.
- Read `?project=<id>` from the URL; default to `hello-3d`; fall back to the default on unknown ids.
- Thread `projectId` into `createApp` so the asset registry's `baseUrl` resolves to `examples/<projectId>/assets/`.
- Render the selected project name and a small `?project=<id>` switcher chip in the status panel; tag elements with `data-testid` for e2e.
- Keep scene HMR working for the active project (one `import.meta.hot.accept` per project, static paths so Vite tracks them).

Acceptance criteria:

- Visiting `/` loads `hello-3d`.
- Visiting `/?project=beacon-world` loads Beacon World — drone + two beacons appear in the snapshot.
- Editing the active project's `start.scene.json` still triggers the existing scene HMR diff.
- Existing e2e tests still pass; two new e2e tests confirm the switcher.

Verification:

- `npm run typecheck`
- `npm run test:e2e` — canvas smoke + agent loop + project-switcher pair (4 tests).

### Epic 14: Asset Pipeline Polish

**Story 14.2: Production Asset Serving**

Status: Implemented.

Tasks:

- Add a small `agf-copy-example-assets` Vite plugin in `vite.config.ts` that copies `examples/<projectId>/assets/` into `dist/examples/<projectId>/assets/` on `closeBundle`.
- Skip `.gitkeep` markers; otherwise copy the tree as-is so `*.material.json`, `*.glb` and any future runtime files ship with the build.
- Keep the plugin source-only (no new npm dep).
- Track the list of known example projects in one place inside `vite.config.ts`; keep in sync with the project switcher.

Acceptance criteria:

- After `npm run build`, `dist/examples/hello-3d/assets/runtime/materials/cube-hero.material.json` exists.
- After `npm run build`, `dist/examples/hello-3d/assets/runtime/models/cube.glb` is 1524 bytes (matches the source).
- After `npm run build`, `dist/examples/beacon-world/assets/runtime/materials/beacon.material.json` exists.
- `vite preview` serves all of the above with `200 OK`.

Verification:

- `npm run build` + `curl -sf http://127.0.0.1:4173/examples/<projectId>/assets/runtime/...` returns the expected JSON / GLB bytes.

### Epic 13: Beacon World Sample Game

**Story 13.3: Beacon World Gameplay v0** (next)

Tasks/acceptance/verification expanded when picked up.

### Sprint 4 Candidates Not Picked Yet

- `15.1` In-page inspector overlay — toggle hotkey TBD (not F12, not F2), entity/component tree, read-only first.
- `16.1` Material file hot reload — `*.material.json` edits flow through the asset registry without a page reload.
- `17.1` Scene editor command palette — DOM panel that runs `applyCommands` with autocomplete on entity ids and component names.
- `14.3` Real `.glb` for Beacon World drone/beacons — replace the primitive sphere/box with an authored model.

Epic 10 (Backend contracts) is deferred to ~Sprint 5 by stakeholder decision.

## Next Sprint: TBD

Will be detailed when Sprint 4 reaches close.
