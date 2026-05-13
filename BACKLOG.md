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

## Current Sprint: Sprint 26 - TBD

Sprint 26 focus is picked at sprint start. Agent-first priority from `CLAUDE.md` applies. Default sprint size is 8–12 stories per `feedback-sprint-size`.

### Candidates

Anchor candidates per the M-list sequencing in `HIGH_LEVEL_BACKLOG.md`: **M5** + **M11** are the next two engine-priority epics — break them up into the stories below.

#### M5 — Runtime diagnostics bus

- `E.22` `RuntimeDiagnosticsBus` core — typed event with `severity`, `code`, `source`, `message`, optional `entityId`/`component`/`assetRef`. Exposed via `window.__agf.diagnostics()`.
- `E.23` Asset-load failure emits a diagnostic — `AssetRegistry` push when a fetch / parse fails.
- `E.24` Network adapter emits diagnostics — invalid frame, id collision, gap resync, ack regression each map to a `code` value.
- `E.25` HUD diagnostics overlay v0 — DEV-only compact panel for last N warnings/errors.

#### M11 — Resource lifecycle / leak tests

- `E.26` Renderer info exposure — `window.__agf.rendererInfo()` returns `{ geometries, materials, textures, programs, drawCalls, triangles }`.
- `E.27` HMR reload stress test — Playwright e2e touches the same material 50× and asserts renderer info stays bounded.
- `E.28` Network adapter create/dispose stress test — Vitest spins up/down the adapter N times and asserts no lingering reconnect timers / server-owned entities.

#### Backend follow-ups (lighter side dishes)

- `10.14` Server-authoritative carry — extend the protocol with `intent.pickup` / `intent.drop` so a future story can sync pickups across clients.
- `10.16` Snapshot delta encoding — server sends only changed components per entity instead of the full state every tick.
- `10.18` Server-side hazard / pickup state — move hazard pulses and core respawns onto the server-side world.

#### Engine polish

- `E.21` Lazy renderer module split — make `engine/render/three-renderer.ts` import its Three.js dependency on first use rather than at module load, so future headless tooling can import `startRuntime` without the renderer.

#### Beacon World gameplay

- `13.12` Sound pings — first audio cue on pickup / deposit / damage so the loop has feedback beyond visuals.
- `13.24` Score-pulse e2e — assert `data-pulse="true"` appears on the scoreboard row whose `lastRepairedBy` ticked this refresh.

#### Asset polish

- `14.16` Hazard material HMR audit lock — explicit e2e that asserts both new `hazard-warning` / `hazard-amber` materials fire `agf:asset-changed`.
