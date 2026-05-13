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

## Current Sprint: Sprint 10 - TBD

Sprint 10 focus is picked at sprint start. Candidate pool below. Agent-first priority from `CLAUDE.md` applies.

### Candidates

#### Beacon World gameplay (Epic 13 continuation)

- `13.7` Hazards v0 — a moving hazard zone with pulse cycle; touching it costs the carried core.

#### Backend follow-ups

- `10.4` WebSocket transport for `node-world-server` — first real round-trip of protocol messages.
- `10.5` C#/.NET reference skeleton — `examples/backends/dotnet-world-server/` mirror.

#### Agent loop polish

- `9.6` `engine inspect --save <path>` shortcut so diff workflow doesn't require shell redirection.
- `9.7` Playtest scenario hot reload — edits to `.playtest.json` rerun the affected test on save.
- `9.8` Deep-equal `match` in `expectComponent` for nested keys.
- `9.9` Structured HMR signal on `window.__agf` (e.g. `lastReloadedAsset`) so tests don't depend on a console-string contract.

## Next Sprint: TBD

Will be detailed when Sprint 10 reaches close.
