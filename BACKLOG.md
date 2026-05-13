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

## Current Sprint: Sprint 8 - TBD

Sprint 8 focus is picked at sprint start. Candidate pool below. Stories must be expanded with tasks, acceptance criteria and verification before implementation starts. Agent-first priority from `CLAUDE.md` applies — prefer schema/diagnostics/inspect/HMR work over visual GUI tooling.

### Candidates

#### Agent loop enrichment

- `9.3` Scripted playtest scenarios — JSON/TS format for multi-step robot runs (e.g. "pick up, deposit, wait for respawn, repeat") so the agent can describe scenarios without hand-rolling a Playwright spec each time.
- `9.4` Engine inspect filters — sub-commands or flags on `engine inspect` so an agent can ask narrow questions (e.g. `--component Pickup`, `--query 'Carrier,Transform'`).
- `9.5` Snapshot diff / replay — `engine inspect --diff <before> <after>` and a command-log → world replay path for postmortem.

#### Asset polish

- `14.3` Real authored `.glb` for the Beacon World drone and beacons.
- `16.2` Asset HMR for GLB files — same plumbing as `16.1`, exercised end-to-end against a real model edit.

#### Beacon World gameplay (Epic 13 continuation)

- `13.7` Hazards v0 — a moving hazard zone with pulse cycle; touching it costs the carried core.

#### Backend follow-ups

- `10.4` WebSocket transport for `node-world-server` — first real round-trip of protocol messages.
- `10.5` C#/.NET reference skeleton — `examples/backends/dotnet-world-server/` mirror.

## Next Sprint: TBD

Will be detailed when Sprint 8 reaches close.
