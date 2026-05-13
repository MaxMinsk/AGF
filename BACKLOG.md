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

## Current Sprint: Sprint 18 - TBD

Sprint 18 focus is picked at sprint start. Agent-first priority from `CLAUDE.md` applies. Default sprint size is 4–6 stories per `feedback-sprint-size`.

### Candidates

#### Backend follow-ups

- `10.5` C#/.NET reference skeleton — `examples/backends/dotnet-world-server/` mirror of the Node skeleton.
- `10.10` Authority hand-off for the Beacon drone — when `?networked=1`, hide/remove the local `player.drone` and route the local pickup/hazard systems through the server-owned `player.<playerId>` entity. Needs a small protocol extension for outbound `intent.pickup` / `intent.drop`.
- `10.11` Multi-client e2e — Playwright test that starts the node-world-server, opens two browser pages with different `playerId`s, and proves each page sees the other player's entity through the snapshot.

#### Beacon World gameplay

- `13.12` Sound pings — first audio cue on pickup / deposit / damage so the loop has feedback beyond visuals.
- `13.15` Round reset — when `RoundState.phase === "complete"` and a player presses an action key (or after a delay), reset all `Repairable.repaired = false`, `Pickup.consumed = false` and `RoundState.phase = "active"` with `holdProgress = 0`.

#### Engine polish

- `E.7` Inspect snapshot to stable JSON — `engine inspect --save` currently includes `time` and `componentNames` ordering that depend on world insertion order. Normalise the output so the diff between two runs is byte-stable when the world is identical.
- `E.8` Agent test recipe doc — a one-page doc in `docs/agent/` showing the canonical "edit JSON → engine check → engine inspect --diff → playtest" recipe, with command snippets pinned to actual scripts in `package.json`.

#### Asset polish

- `14.7` Drone material variant family — small palette of drone materials so a future networked profile can colour different players differently.
