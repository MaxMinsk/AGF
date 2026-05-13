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

## Current Sprint: Sprint 3 - TBD

Sprint 3 focus will be picked at the start of the sprint from the candidate list below. Stories must be expanded with tasks, acceptance criteria and verification before implementation starts.

### Candidates

- `13.1` Beacon World project scaffold — new nested project under `examples/beacon-world/`, minimal `project.json` + scene, sample-game direction in `SAMPLE_GAME_IDEAS.md` as reference.
- `13.2` Beacon World first scene — primitive avatar + two beacons, uses the existing renderer / scheduler / asset registry without engine changes.
- `14.1` Minimal `.glb` for `hello-3d` — closes the Story 8.4 follow-up so the GLB loader path has an end-to-end smoke test.
- `14.2` Production asset serving — fix the `dist/` build so material/glb references resolve in `npm run build`, not just `npm run dev`.
- `15.1` In-page inspector overlay — toggle hotkey (not F12, not F2 if that conflicts with the browser), tree of entities + components, read-only first.
- `16.1` Material file hot reload — make `*.material.json` edits flow through the asset registry and rebind on the renderer side without a page reload.
- `17.1` Scene editor command palette — drop-in DOM panel that runs the existing `applyCommands` API with autocomplete on entity ids and component names.

Epic 10 (Backend contracts) is deferred to ~Sprint 5 by stakeholder decision.

## Next Sprint: TBD

Will be detailed when Sprint 3 reaches close.
