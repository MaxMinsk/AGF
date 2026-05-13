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

## Current Sprint: Sprint 29 — Determinism, project-file patches, prefab schema, doctor build flag

Sprint 29 focus: close the record/replay determinism gap (**M2b-seed**), open the agent-authored edit channel via a patch contract (**M13**), seed the prefab path (**M3** schema-only), and let `engine doctor` self-build when `dist/` is missing.

### Stories

#### M2b-seed — Deterministic RNG

- `E.70` Seeded RNG helper — `engine/core/util/seeded-rng.ts` exposes `createSeededRng(seed)` (mulberry32) with `next()` / `nextRange()` / `nextInt()` and unit tests for determinism + uniformity.
- `E.71` Wire seeded RNG into Beacon hazard pulse — replace `Math.random()` in `hazard-system.ts` with an injected RNG; profile-gated so production stays non-deterministic.
- `E.72` Wire seeded RNG into Beacon pickup respawn — same approach in `pickup-system.ts`; one playtest captures a recording and `engine replay` confirms zero drift.

#### M13 — Project-file patch contract

- `E.73` Patch contract types + `applyPatch` library — `engine/tools/patch/project-patch.ts` defines `EnginePatch` (an ordered list of `set` / `delete` / `insert` operations addressed by JSON pointer + target file) and `applyPatch(projectDir, patch, opts)`. Pure; `--check` is a dry-run; `--write` mutates files.
- `E.74` `engine patch <projectDir> <patch.json> [--check|--write]` CLI dispatcher + `npm run engine:patch` script.
- `E.75` Patch unit tests — round-trip a `set` on `project.json`, an `insert` into a scene's `entities` array, an `insert` into `asset-sources.json`; reject malformed paths and unknown ops.

#### M3 — Prefab schema scaffold

- `E.76` `schemas/prefab.schema.json` + `AGF_PREFAB_INVALID` diagnostic; `engine check` validates `*.prefab.json` files under each project's `prefabs/` directory. Schema-only, no scene expansion yet — locked for a future Sprint 30 story.

#### Engine polish

- `E.77` `engine doctor --build` — when `dist/` is missing, optionally invoke `npm run build` (or detect failure and surface a clear recommendation). Defaults to "no, ask the agent to run build first".
- `RH.3` Extend repo-hygiene CI — add `vite build` + `bundle:check` to the existing `typecheck-and-unit` job so a PR can't merge with a broken build or oversized bundle. (E2E stays local for now.)

### Carried to Sprint 30

- `M3-b` Scene `instances` + `expandScenePrefabs` — the actual prefab expansion path. Schema lands now; engine integration follows.
- `10.5+` C# skeleton WebSocket transport.
- `10.14` Server-authoritative carry; `10.16` snapshot delta; `10.18` server hazard state.
- `13.13` Audio asset loader + first licensed `.ogg`.
