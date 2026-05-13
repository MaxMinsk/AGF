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

## Current Sprint: Sprint 17 - TBD

Sprint 17 focus is picked at sprint start. Agent-first priority from `CLAUDE.md` applies. Default sprint size is 4–6 stories per `feedback-sprint-size`.

### Candidates

#### Backend follow-ups

- `10.5` C#/.NET reference skeleton — `examples/backends/dotnet-world-server/` mirror of the Node skeleton.
- `10.9` Server-side player timeout — drop a player whose intent / heartbeat has not arrived in N seconds. Currently only the WS-close path triggers `leave`.
- `10.10` Authority hand-off for the Beacon drone — when `?networked=1`, hide/remove the local `player.drone` and route the local pickup/hazard systems through the server-owned `player.<playerId>` entity. Needs a small protocol extension for outbound `intent.pickup` / `intent.drop`.

#### Beacon World gameplay

- `13.12` Sound pings — first audio cue on pickup / deposit / damage so the loop has feedback beyond visuals.
- `13.14` Win condition / round summary — when `WorldSignal.health` stays above a threshold for N seconds, emit a `round.complete` snapshot field and let the HUD show a one-shot summary panel.

#### Engine polish

- `E.5` Profile gating — make `project.json.profiles` actually filter system registration so a future "networked" profile can opt entities out of local movement without app-level branching.
- `E.6` `engine inspect` for snapshot tail — add an `--tail N` flag that prints the last N component diffs by entity / component, so an agent can verify network HMR without scraping the raw snapshot.

#### Asset polish

- `14.7` Drone material variant family — small palette of drone materials so a future networked profile can colour different players differently.
