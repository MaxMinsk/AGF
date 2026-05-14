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

## Current Sprint: Sprint 32 — TBD

Sprint 32 focus is picked at sprint start. Agent-first priority from `CLAUDE.md` applies. Default sprint size is 8–12 stories per `feedback-sprint-size`.

### Candidates

#### M15 — Engine dev server (remaining)

- `M15-g` SSE event stream — `GET /__agf/events` streams diagnostics + HMR + scheduler ticks to the agent as server-sent events.
- `M15-i` `engine connect <url>` CLI — optional thin wrapper around the HTTP endpoints. Agents can curl directly, so this is convenience.
- `M15-multi-page` Allow multiple concurrent connected pages (key by socketId in handshake); drops the single-page invariant + the playwright workaround.

#### Composition + persistence

- `M3-c` Beacon World adopts prefabs for repeated cores / hazards (wires `expandScenePrefabs` into scene-load).
- `M4-reload-e2e` Playwright spec: navigate to Beacon, repair a beacon, reload, assert the repaired state survives via IndexedDB.
- `M16-cascade` Cascade-delete: removing a parented entity removes (or warns) about its children.

#### Backend follow-ups

- `10.5+` C# skeleton WebSocket transport.
- `10.14` Server-authoritative carry; `10.16` snapshot delta; `10.18` server hazard state.

#### Engine polish

- `M2b-seed` Wire deterministic RNG into the first system that actually rolls dice (still waiting).
- `13.13` Audio asset path — replace procedural Web Audio beeps once an audio loader exists.
