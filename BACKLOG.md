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

## Current Sprint: Sprint 14 - TBD

Sprint 14 focus is picked at sprint start. Agent-first priority from `CLAUDE.md` applies. Default sprint size is 4–6 stories per `feedback-sprint-size`.

### Candidates

#### Backend follow-ups

- `10.4` WebSocket transport for `node-world-server` — first real round-trip of protocol messages.
- `10.5` C#/.NET reference skeleton — `examples/backends/dotnet-world-server/` mirror.
- `10.6` Client network adapter — connect the browser runtime to the Node skeleton over WebSocket, applying inbound `world.snapshot` through `applyCommands`.

#### Beacon World gameplay

- `13.11` World signal / score state — repaired beacons contribute to a running `WorldSignal` value; HUD displays it next to Health.
- `13.12` Sound pings — first audio cue on pickup / deposit / damage so the loop has feedback beyond visuals.

#### Asset polish

- `14.5` Authored `.glb` for energy cores — replace the primitive sphere with a faceted procedural shape; same script pattern.
- `14.6` Procedural material variants — generate a small family of material manifests with shared schema (e.g. `beacon-repaired.material.json`) so beacon repair can swap materials cleanly instead of dropping the ref.

#### Engine polish

- `E.1` Tighter component query helpers — replace ad-hoc `world.query(["A", "B"])` patterns with a tiny cached query so scenes with more entities don't pay a full scan per system per frame.
