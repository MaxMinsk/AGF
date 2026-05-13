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

## Current Sprint: Sprint 16 - TBD

Sprint 16 focus is picked at sprint start. Agent-first priority from `CLAUDE.md` applies. Default sprint size is 4–6 stories per `feedback-sprint-size`.

### Candidates

#### Backend follow-ups

- `10.5` C#/.NET reference skeleton — `examples/backends/dotnet-world-server/` mirror of the Node skeleton.
- `10.7` Networked Beacon drone — opt-in profile where the local drone's input is translated into outbound `intent.move` and the server's `player.<id>` entity replaces the locally-owned drone. Needs auth/handoff logic and a Playwright e2e that proves keyboard input crosses the wire.
- `10.8` Connection lifecycle hardening — reconnect / backoff in the client adapter, server-side player timeout when a snapshot tick has not seen activity in N seconds.

#### Beacon World gameplay

- `13.12` Sound pings — first audio cue on pickup / deposit / damage so the loop has feedback beyond visuals.
- `13.14` Win condition / round summary — when `WorldSignal.health` stays above a threshold for N seconds, emit a `round.complete` snapshot field and let the HUD show a one-shot summary panel.

#### Engine polish

- `E.3` Adopt cached query handles in built-in systems — convert `spin`, `pickup`, `hazard`, `world-signal` from `world.query(...)` to per-system `world.createQuery(...).run()` and prove the snapshot output is unchanged.
- `E.4` Schema-driven diagnostics — surface a friendly error when a scene references a component absent from both the base schema and the project's scene-extensions.

#### Asset polish

- `14.7` Drone material variant family — small palette of drone materials so a future networked profile can colour different players differently.
