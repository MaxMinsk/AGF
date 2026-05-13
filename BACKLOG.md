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

## Current Sprint: Sprint 25 - TBD

Sprint 25 focus is picked at sprint start. Agent-first priority from `CLAUDE.md` applies. Default sprint size is 4–6 stories per `feedback-sprint-size`.

### Candidates

#### Backend follow-ups

- `10.5` C#/.NET reference skeleton — `examples/backends/dotnet-world-server/` mirror of the Node skeleton.
- `10.14` Server-authoritative carry — extend the protocol with `intent.pickup` / `intent.drop` so a future story can sync pickups across clients.
- `10.16` Snapshot delta encoding — server sends only changed components per entity instead of the full state every tick; client merges deltas onto its last known full snapshot.
- `10.18` Server-side hazard / pickup state — move hazard pulses and core respawns onto the server-side world so two browser tabs see the same hazard pattern and pickups disappear consistently across clients.

#### Beacon World gameplay

- `13.12` Sound pings — first audio cue on pickup / deposit / damage so the loop has feedback beyond visuals.
- `13.21` Core palette by carry owner — apply the drone palette to a held `core.glb` while it is being carried so two tabs see "alpha is holding it".

#### Engine polish

- `E.16` Dynamic renderer import — split `engine/render/` (and Three.js) into a lazy chunk so a non-renderer entrypoint (CLI, future server-side simulator) does not have to ship it.
- `E.17` `engine inspect --json --watch` schema doc — short `docs/agent/inspect-stream.md` describing the NDJSON line shape (one `InspectResult` per line) so external tools have a contract.

#### Asset polish

- `14.13` Asset diagnostic on `engine check --json` schema — extend the existing JSON output type with the new `AGF_ASSET_RUNTIME_UNDECLARED` code in a typed enum so CI tooling can pattern-match without string parsing.
- `14.14` HMR for hazard materials — confirm the new `hazard-warning.material.json` / `hazard-amber.material.json` live-reload via `agf:asset-changed`; pairs with the existing audit.
