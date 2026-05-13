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

## Current Sprint: Sprint 28 - TBD

Sprint 28 focus is picked at sprint start. Agent-first priority from `CLAUDE.md` applies. Default sprint size is 8–12 stories per `feedback-sprint-size`.

### Candidates

Anchor candidates: continue the M-list — **M2** (deterministic-replay tooling) and **M4** (schema-driven docs generation) per `HIGH_LEVEL_BACKLOG.md` — plus the deferred polish item and a first real C# transport.

#### M-list follow-ups

- `M2-a` Record-and-replay v0 — capture every applied `EngineCommand` plus the initial scene to a `.replay.json` artifact, then a CLI `engine replay <file>` that drives the runtime headlessly and diffs the resulting snapshot against an expected one.
- `M2-b` Deterministic seed for `Math.random` consumers inside ECS systems (Beacon World pickup spawn, hazard pulse) — gated by a profile flag so production stays non-deterministic.
- `M4` `engine docs` — generate human-readable docs from `schemas/*.schema.json` + per-project `template_context.md`. One JSON-Schema-to-Markdown pass per file plus an index.

#### Engine polish

- `E.63` Lazy renderer import — convert `engine/runtime/start.ts` to dynamically `import("../render/three-renderer")`; pair with the renderer-import-boundary lock so headless tooling can drop three from the chunk. (Carried over from Sprint 27.)
- `E.64` `engine doctor` runs the bundle pass — invoke the existing `bundle:check` (or its underlying logic) and fold the result into the doctor report alongside the renderer budget.

#### Backend follow-ups

- `10.5+` C# skeleton WebSocket transport — first transport on top of the smoke-only skeleton shipped in Sprint 25.
- `10.14` Server-authoritative carry — `intent.pickup` / `intent.drop` protocol extension.
- `10.16` Snapshot delta encoding — server sends only changed components per entity.
- `10.18` Server-side hazard / pickup state — move pulse timing + core respawns onto the server so two tabs see the same pattern.

#### Beacon World gameplay

- `13.12` Sound pings — first audio cue on pickup / deposit / damage so the loop has feedback beyond visuals.

#### Repo hygiene

- `RH.1` Cyrillic-in-repo GitHub Action — already on the pending list per memory `project-pending-cyrillic-check`.
