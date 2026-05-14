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

## Current Sprint: Sprint 32 — Finish M15 dev-server + close composition loops (M3-c / M4-reload-e2e / M16-cascade)

Sprint 32 focus: close the remaining M15 surface (SSE events, multi-page, optional CLI), wire `expandScenePrefabs` into the runtime so Beacon can actually adopt prefabs, lock Beacon persistence with a Playwright reload spec, and ship the M16 cascade-delete polish.

### Stories

#### M20 — Netcode rework (new)

- `M20-investigate` Write `docs/research/netcode-rework-investigation.md`. Cover: (1) the three concrete bugs in the current implementation (2× own-drone, 30s idle disconnect, networked vs single-player feel), (2) survey of proven multiplayer netcode patterns (Quake 3 / Valve / GGPO / deterministic lockstep / snapshot interpolation only), (3) tradeoffs against AGF's constraints (browser, agent-readable, schema-driven protocol, supports the Beacon-World "small persistent world" shape), (4) recommendation + sequenced implementation plan with stories sized for one sprint each. Does NOT touch code.

#### M15 — Engine dev server (finishing slice)

- `M15-g` `GET /__agf/events` SSE stream — pushes runtime diagnostics + HMR `agf:asset-changed` + scheduler-tick markers to subscribed agents.
- `M15-multi-page` Drop the single-active-page invariant: bridge keeps a Map keyed by socketId, RPC routes target by `?page=` query or the most recent socket. Remove `playwright.dev-bridge.config.ts` workaround.
- `M15-i` `engine connect <url> <verb>` CLI — thin wrapper around the HTTP surface (`engine connect localhost:5173 bug-report`, `engine connect localhost:5173 commands < commands.json`).

#### M3 — Prefab runtime integration

- `M3-c-load` Wire `expandScenePrefabs` into the scene-load path so any project can declare `instances: [...]` alongside `entities` and have them materialise. Beacon-side adoption (`M3-c-beacon`) follows.
- `M3-c-beacon` Beacon World's repeated cores / hazards become prefab instances.

#### M4 — Persistence proof

- `M4-reload-e2e` New Playwright spec navigates Beacon, drives a repair via injected commands, reloads, asserts the repaired beacon's state survives via IndexedDB.

#### M16 — Hierarchy polish

- `M16-cascade` `entity.delete` removes the entity's children (transitively). New diagnostic `AGF_TRANSFORM_ORPHANED` emitted by `engine check` when a scene declares an entity with a parent that gets deleted.

### Carried to Sprint 33

- `M2b-seed` Wire deterministic RNG (still waiting for a system that actually rolls dice).
- `13.13` Audio asset path — needs an audio loader first.
- `10.5+` C# WS transport; `10.14` / `10.16` / `10.18` server-authoritative work.
