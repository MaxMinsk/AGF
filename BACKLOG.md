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

## Current Sprint: Sprint 7 - TBD

Sprint 7 focus is picked at sprint start. Candidate pool below. Stories must be expanded with tasks, acceptance criteria and verification before implementation starts.

### Candidates

#### Authoring tools

- `15.1` In-page inspector overlay — toggle hotkey TBD (not F12, not F2), entity/component tree, read-only first.
- `16.1` Material file hot reload — `*.material.json` edits flow through the asset registry without a page reload.
- `17.1` Scene editor command palette — DOM panel that runs `applyCommands` with autocomplete on entity ids and component names.

#### Beacon World gameplay (Epic 13 continuation)

- `13.6` Beacon decay + core respawn — repaired beacons drift back to unrepaired after a timeout; deposited cores respawn on a cycle.
- `13.7` Hazards v0 — a moving hazard zone with pulse cycle; touching it costs the carried core.

#### Asset polish

- `14.3` Real authored `.glb` for the Beacon World drone and beacons.

#### Backend follow-ups

- `10.4` WebSocket transport for `node-world-server`.
- `10.5` C#/.NET reference skeleton.

## Next Sprint: TBD

Will be detailed when Sprint 7 reaches close.
