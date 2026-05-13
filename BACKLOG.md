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

## Current Sprint: Sprint 6 - TBD

Sprint 6 focus is picked at sprint start. The candidate list below is the natural pool to draw from. Stories must be expanded with tasks, acceptance criteria and verification before implementation starts.

### Candidates

#### Beacon World gameplay (Epic 13 continuation)

- `13.4` Pickup component + spawner — energy core entity, lifetime, world-spawn system.
- `13.5` Carry / deposit interaction — drone picks up a core on proximity, drops it on a beacon, beacon switches to a "repaired" material.

#### Asset polish

- `14.3` Real authored `.glb` for the Beacon World drone and beacons — replace primitives once an art pipeline appears.
- `16.1` Material file hot reload — `*.material.json` edits flow through the asset registry without a page reload.

#### Inspector and authoring tools

- `15.1` In-page inspector overlay — read-only entity/component tree, toggle hotkey TBD (not F12, not F2).
- `17.1` Scene editor command palette — DOM panel that runs `applyCommands` with autocomplete on entity ids and component names.

#### Backend follow-ups (when ready)

- `10.4` WebSocket transport for `node-world-server` — first real round-trip of protocol messages.
- `10.5` C#/.NET reference skeleton — `examples/backends/dotnet-world-server/` mirror of the Node skeleton, validating the same schema.

## Next Sprint: TBD

Will be detailed when Sprint 6 reaches close.
