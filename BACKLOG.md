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

## Current Sprint: Sprint 21 - TBD

Sprint 21 focus is picked at sprint start. Agent-first priority from `CLAUDE.md` applies. Default sprint size is 4–6 stories per `feedback-sprint-size`.

### Candidates

#### Backend follow-ups

- `10.5` C#/.NET reference skeleton — `examples/backends/dotnet-world-server/` mirror of the Node skeleton.
- `10.14` Server-authoritative carry — extend the protocol with `intent.pickup` / `intent.drop` so a future story can sync pickups across clients.
- `10.15` Server-acked input sequences — client tags each `intent.move` with a per-connection sequence number; server echoes the last applied sequence in its snapshot; the sync system uses this to do precise reconciliation (replay un-acked inputs) instead of the current threshold/lerp blend.
- `10.16` Snapshot delta encoding — server sends only changed components per entity instead of the full state every tick; client merges deltas onto its last known full snapshot.

#### Beacon World gameplay

- `13.12` Sound pings — first audio cue on pickup / deposit / damage so the loop has feedback beyond visuals.
- `13.18` Scoreboard — show repaired-beacon counts per player on the HUD so multi-client play has a small competitive signal.

#### Engine polish

- `E.10` Smaller `applyCommand` boundary — split the implementation so it never imports from a system file, only from `ecs/`. Add a Vitest case that imports `applyCommand` in isolation and proves the worst-case command set runs on a fresh `World` in under N microseconds.
- `E.12` `engine inspect --watch` — long-running mode that re-runs inspect when the project's scene / schema / materials change and writes a fresh `--save` snapshot. Pairs with `--diff` for a continuous edit-loop.

#### Asset polish

- `14.8` Material HMR audit — confirm that editing every material under `examples/beacon-world/assets/runtime/materials/` lives-reloads via the existing `agf:asset-changed` path, including the four new drone palette variants.
- `14.9` Beacon material variant family — palette of beacon materials so a future story can colour beacons per repair state / per owning player.
