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

## Current Sprint: Sprint 30 — TBD

Sprint 30 focus is picked at sprint start. Agent-first priority from `CLAUDE.md` applies. Default sprint size is 8–12 stories per `feedback-sprint-size`.

### Candidates

Anchor candidate: **`E.80` engine dev server investigation** (M15) — by far the highest-leverage agent-loop story open today. Write `docs/research/engine-dev-server-investigation.md` and sequence the implementation sprints that follow.

#### M15 — Engine dev server

- `E.80` Engine dev server investigation — design doc covering use cases, architecture options, endpoint surface, security stance, and a sequenced implementation plan. See `HIGH_LEVEL_BACKLOG.md` for the full brief.

#### M3 — Prefab follow-ups

- `M3-b` Scene `instances: [{ prefab, overrides }]` syntax + `expandScenePrefabs` pure function — the actual scene-level prefab expansion. Schema landed in Sprint 29; engine integration follows.
- `M3-c` Beacon World adopts prefabs for repeated cores / hazards — proves the path end-to-end.

#### Backend follow-ups

- `10.5+` C# skeleton WebSocket transport — first transport on top of the smoke skeleton from Sprint 25.
- `10.14` Server-authoritative carry; `10.16` snapshot delta; `10.18` server hazard state.

#### Beacon World polish

- `13.13` Audio asset path — replace the procedural Web Audio beeps with short licensed `.ogg` clips once the audio loader exists.

#### Engine polish

- `M13-c` `engine patch` schema validation — after applying a patch in `--check` mode, re-run the relevant `engine check` validators against the resulting in-memory files so the agent knows whether the patch would leave the project well-formed.
