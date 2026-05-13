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

## Current Sprint: Sprint 19 - TBD

Sprint 19 focus is picked at sprint start. Agent-first priority from `CLAUDE.md` applies. Default sprint size is 4–6 stories per `feedback-sprint-size`.

### Candidates

#### Backend follow-ups

- `10.5` C#/.NET reference skeleton — `examples/backends/dotnet-world-server/` mirror of the Node skeleton.
- `10.10` Authority hand-off for the Beacon drone — when `?networked=1`, hide/remove the local `player.drone` and route the local pickup/hazard systems through the server-owned `player.<playerId>` entity. Needs a small protocol extension for outbound `intent.pickup` / `intent.drop`.
- `10.12` Resync on snapshot gap — when the client adapter observes a missing sequence between two `world.snapshot` messages, drop all server-owned entities and let the next snapshot rebuild them so a missed delete cannot ghost forever.

#### Beacon World gameplay

- `13.12` Sound pings — first audio cue on pickup / deposit / damage so the loop has feedback beyond visuals.
- `13.16` HUD restart affordance — when `RoundState.phase === "complete"`, the HUD shows "Press R to restart" under `ROUND COMPLETE`.

#### Engine polish

- `E.9` `engine inspect --tail N` for component-data subset — current `--tail` only applies to `--diff`. Add it to plain inspect so an agent can ask for "the last N entities by id" without filters.
- `E.10` Smaller `applyCommand` boundary — split the implementation so it never imports from a system file, only from `ecs/`. Then add a Vitest case that imports `applyCommand` in isolation and proves the worst-case command set runs on a fresh `World` in under N microseconds.

#### Asset polish

- `14.7` Drone material variant family — small palette of drone materials so a future networked profile can colour different players differently.
- `14.8` Material HMR audit — confirm that editing every material under `examples/beacon-world/assets/runtime/materials/` lives-reloads via the existing `agf:asset-changed` path, including the new `beacon-repaired.material.json`.
