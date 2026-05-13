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

## Current Sprint: Sprint 29 — TBD

Sprint 29 focus is picked at sprint start. Agent-first priority from `CLAUDE.md` applies. Default sprint size is 8–12 stories per `feedback-sprint-size`.

### Candidates

Anchor candidates: continue the M-list — **M2-b** (deterministic seed) closes the record/replay determinism gap, **M3** (prefabs) reduces Beacon's duplicate cores / hazards, and the backend epic **10.5+** has been pending since Sprint 25.

#### M-list follow-ups

- `M2-b` Deterministic RNG — profile-flag-gated seeded RNG helper consumed by Beacon hazard pulse + pickup respawn so `engine replay` survives RNG drift.
- `M3-a` Prefab schema v0 — `prefabs/*.prefab.json` + `prefab.schema.json` + `prefab.instantiate` command. Beacon's repeated cores / hazards motivate it.
- `M3-b` Scene `instances: [{ prefab, overrides }]` syntax with schema validation + expansion in `scene.load`.
- `E.69` `engine doctor` follow-up — if `dist/` is missing, optionally invoke `vite build` (gated by `--build` flag) so a fresh checkout can be scored end-to-end.

#### Backend follow-ups

- `10.5+` C# skeleton WebSocket transport — real transport on top of the smoke skeleton shipped in Sprint 25.
- `10.14` Server-authoritative carry — `intent.pickup` / `intent.drop` protocol extension.
- `10.16` Snapshot delta encoding — server sends only changed components per entity.
- `10.18` Server-side hazard / pickup state — move pulse timing + core respawns onto the server.

#### Parking-lot promotions

- `M13` Project-file patch contract — design a JSON / AGF-command patch format + `engine patch --check`/`--write` flow. Pairs with `E.55`.

#### Beacon World polish

- `13.13` Audio asset path — replace the procedural Web Audio beeps with short licensed `.ogg` clips once the audio loader exists.
