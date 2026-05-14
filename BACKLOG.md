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

## Current Sprint: Sprint 31 — TBD

Sprint 31 focus is picked at sprint start. Agent-first priority from `CLAUDE.md` applies. Default sprint size is 8–12 stories per `feedback-sprint-size`.

### Candidates

Two anchor threads:

1. **M15 implementation** — start the engine dev-server vertical that the Sprint 30 investigation sequenced. The first slice (M15-a → M15-c → M15-d) gets an agent reaching `/__agf/snapshot`, `/__agf/diagnostics`, `/__agf/renderer-info`, and `/__agf/bug-report` over HTTP without touching DevTools.
2. **M16 + M4 follow-ups** — `M16-cascade` delete handling, `M4-reload-e2e` Playwright spec, `M3-c` Beacon adopts prefabs.

#### M15 — Engine dev server (first vertical)

- `M15-a` `engine/dev/agf-dev-bridge.ts` Vite plugin scaffold (`apply: "serve"`) + `GET /__agf/health` returning `{ ok: true, version }`. Production-build exclusion test.
- `M15-b` Page-side bridge (`engine/dev/page-bridge.ts`) opens WS to `/__agf/ws` under `import.meta.env.DEV`; handshake message logs "page connected".
- `M15-c` Pull endpoints — `GET /__agf/{snapshot,diagnostics,renderer-info,reload-events}` proxy the corresponding `app.*` methods with a 3-second RPC timeout.
- `M15-d` `GET /__agf/bug-report` + `schemas/bug-report.schema.json`.

#### Composition + persistence follow-ups

- `M3-c` Beacon World adopts prefabs for repeated cores / hazards, wiring `expandScenePrefabs` into the scene-load path.
- `M4-reload-e2e` Playwright spec: navigate to Beacon, repair a beacon, reload, assert the repaired state survives via IndexedDB.
- `M16-cascade` Cascade-delete: removing an entity that has children also removes (or warns about) its children.

#### Backend follow-ups

- `10.5+` C# skeleton WebSocket transport.
- `10.14` Server-authoritative carry; `10.16` snapshot delta; `10.18` server hazard state.

#### Engine polish

- `M2b-seed` Wire deterministic RNG into the first system that actually rolls dice (still waiting).
- `13.13` Audio asset path — replace procedural Web Audio beeps once an audio loader exists.
