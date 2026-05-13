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

## Current Sprint: Sprint 5 - TBD

Per the stakeholder note in Sprint 2's archive, Epic 10 (Backend persistent-world contracts) was deferred to "Sprint ~5". The actual focus is picked at sprint start; the candidate list below seeds the choice. Stories must be expanded with tasks, acceptance criteria and verification before implementation starts.

### Candidates

#### Backend (Epic 10, deferred since Sprint 2)

- `10.1` Protocol schema v0 — JSON Schema for client/server messages, lives in `schemas/net/`, validated by `engine check`.
- `10.2` Reference backend skeleton boundary — directory layout under `examples/backends/` plus an ADR that nails down what is "engine" vs "reference backend".
- `10.3` Network/world components in scene schema — `Networked`, `Presence`, `Authority`; renderer keeps no special-case behavior, but `engine inspect` shows them.

#### Beacon World gameplay (Epic 13 continuation)

- `13.4` Pickup component + spawner — energy core entity, lifetime, world-spawn system.
- `13.5` Carry / deposit interaction — drone picks a core up on proximity, drops it on a beacon, beacon switches to a "repaired" material.

#### Engine polish (Epic 14 / 15 / 16 / 17)

- `14.3` Real authored `.glb` for Beacon World drone/beacons — replace primitives once an art pipeline appears.
- `15.1` In-page inspector overlay — read-only entity/component tree, toggle hotkey TBD (not F12, not F2).
- `16.1` Material file hot reload — `*.material.json` edits flow through the asset registry without a page reload.
- `17.1` Scene editor command palette — DOM panel that runs `applyCommands` with autocomplete on entity ids and component names.

## Next Sprint: TBD

Will be detailed when Sprint 5 reaches close.
