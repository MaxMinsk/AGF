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

## Current Sprint: Sprint 4 - TBD

Sprint 4 focus will be picked at the start of the sprint from the candidate list below. Stories must be expanded with tasks, acceptance criteria and verification before implementation starts.

### Candidates

- `14.2` Production asset serving — fix `dist/` build so material/glb references resolve in `npm run build`, not just `npm run dev`.
- `15.1` In-page inspector overlay — toggle hotkey TBD (not F12, not F2), entity/component tree, read-only first.
- `16.1` Material file hot reload — `*.material.json` edits flow through the asset registry and rebind on the renderer side without a page reload.
- `17.1` Scene editor command palette — DOM panel that runs the existing `applyCommands` API with autocomplete on entity ids and component names.
- `18.1` Project switcher — pick the loaded project via URL query (`?project=beacon-world`) so Beacon World can be previewed without swapping imports.
- `13.3` Beacon World gameplay v0 — pickup component + first interaction system, beacon repair toggle, a small handful of new commands.
- `14.3` Real `.glb` for Beacon World drone/beacon — replace the primitive sphere/box with an authored model once an art pipeline appears.

Epic 10 (Backend contracts) is deferred to ~Sprint 5 by stakeholder decision.

## Next Sprint: TBD

Will be detailed when Sprint 4 reaches close.
