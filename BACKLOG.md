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

## Current Sprint: Sprint 24 - TBD

Sprint 24 focus is picked at sprint start. Agent-first priority from `CLAUDE.md` applies. Default sprint size is 4–6 stories per `feedback-sprint-size`.

### Candidates

#### Backend follow-ups

- `10.5` C#/.NET reference skeleton — `examples/backends/dotnet-world-server/` mirror of the Node skeleton.
- `10.14` Server-authoritative carry — extend the protocol with `intent.pickup` / `intent.drop` so a future story can sync pickups across clients.
- `10.16` Snapshot delta encoding — server sends only changed components per entity instead of the full state every tick; client merges deltas onto its last known full snapshot.
- `10.18` Server-side hazard / pickup state — move hazard pulses and core respawns onto the server-side world so two browser tabs see the same hazard pattern and pickups disappear consistently across clients.

#### Beacon World gameplay

- `13.12` Sound pings — first audio cue on pickup / deposit / damage so the loop has feedback beyond visuals.
- `13.20` Player-colour drone variants — apply the per-player palette to the local `player.drone` too, not just the remote ones, so an `?playerId=alpha` tab visually agrees with how `?playerId=bravo` sees it.

#### Engine polish

- `E.15` `engine inspect --json --watch` machine-readable stream — make watch mode emit one JSON object per refresh on stdout (line-delimited) so agents can `tail -f` and parse without re-running.
- `E.16` Dynamic renderer import — split `engine/render/` into a lazy chunk; only the active project loads Three.js. Pairs with the bundle-size follow-up from `codex_review_1.md` P3.

#### Asset polish

- `14.11` Hazard material variants — paired with `14.9` so the existing `hazard.center` / `hazard.east` differ visually beyond the inline `MeshRenderer.color`.
- `14.12` Asset diagnostics on `engine inspect` — propagate the `AGF_ASSET_RUNTIME_UNDECLARED` warning into the inspect output too so an agent watching `--watch` notices the moment they drop a new file under `runtime/`.
