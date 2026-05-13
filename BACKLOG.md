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

## Current Sprint: Sprint 23 - TBD

Sprint 23 focus is picked at sprint start. Agent-first priority from `CLAUDE.md` applies. Default sprint size is 4–6 stories per `feedback-sprint-size`.

### Candidates

#### Backend follow-ups

- `10.5` C#/.NET reference skeleton — `examples/backends/dotnet-world-server/` mirror of the Node skeleton.
- `10.14` Server-authoritative carry — extend the protocol with `intent.pickup` / `intent.drop` so a future story can sync pickups across clients.
- `10.16` Snapshot delta encoding — server sends only changed components per entity instead of the full state every tick; client merges deltas onto its last known full snapshot.
- `10.17` Server-broadcast player speed — server emits its effective `PLAYER_SPEED` in `world.snapshot.payload` (or in `player.join` ack) so the client's rollback-replay does not have to hard-code it.

#### Beacon World gameplay

- `13.12` Sound pings — first audio cue on pickup / deposit / damage so the loop has feedback beyond visuals.
- `13.19` Persistent scoreboard — `RoundState.scores: Record<playerId, number>` accumulates across rounds, with the per-beacon `lastRepairedBy` still owning the current round.

#### Engine polish

- `E.13` `engine inspect --watch --on-change <cmd>` — extend watch mode to run an external command after each re-run, so agents can chain `engine inspect --watch` with a custom validator / formatter.
- `E.14` Dynamic bootstrap imports — make `src/main.ts` lazy-import each example's `bootstrap.ts` so the production bundle only ships the active project's systems. Pairs with the chunk-size warning flagged by `codex_review_1.md` P3.

#### Asset polish

- `14.9` Beacon material variant family — palette of beacon materials so a future story can colour beacons per repair state / per owning player; pairs naturally with the scoreboard.
- `14.11` Hazard material variants — paired with `14.9` so the existing `hazard.center` / `hazard.east` differ visually beyond the inline `MeshRenderer.color`.
