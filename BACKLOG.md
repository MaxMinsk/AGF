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

## Current Sprint: Sprint 30 — TBD

Sprint 30 focus is picked at sprint start. Agent-first priority from `CLAUDE.md` applies. Default sprint size is 8–12 stories per `feedback-sprint-size`.

### Candidates

Two parallel anchor candidates this sprint:

1. **`E.80` engine dev server investigation** (M15) — write the design doc that sequences the live-process bridge.
2. **`M16-a / M16-b` transform hierarchy schema + resolver** — open the composition path. New per `Notes/linkedin_web_engine_part3_analysis.md`.

#### M15 — Engine dev server

- `E.80` Engine dev server investigation — design doc (use cases, architecture options, endpoint surface, security stance, sequenced implementation plan).

#### M16 — Transform hierarchy

- `M16-a` Add optional `Transform.parent` to `scenes/*.scene.json` schema + `agfFormatVersion` bump in `engine/tools/check/format-version.ts`. Diagnostics: `AGF_TRANSFORM_PARENT_MISSING`, `AGF_TRANSFORM_PARENT_CYCLE`, `AGF_TRANSFORM_PARENT_SELF`.
- `M16-b` Pure transform-hierarchy resolver — `engine/core/transform/resolve.ts` returns `{ local, world }` per entity given the world's `Transform` components. Unit tests on flat, single-parent, deep chain, and cycle-detection paths.
- `M16-c` (stretch) Renderer consumes derived world transforms via the resolver, preserving the renderer-import-boundary (renderer never reads ECS components directly past the resolver).
- `M16-d` (stretch) `engine inspect` prints `parent` + derived `worldPosition` per entity.

#### M3 — Prefab follow-ups

- `M3-b` Scene `instances: [{ prefab, overrides }]` + `expandScenePrefabs` pure function. Schema landed in Sprint 29; engine integration follows.
- `M3-c` Beacon World adopts prefabs for repeated cores / hazards.

#### M4 — Persistence v0 (sharpened in Sprint 29)

- `M4-a` IndexedDB adapter behind a single `engine/runtime/persistence/local-store.ts` interface; per-project + per-profile save namespace; format version.
- `M4-b` `runtime.save()` / `runtime.load()` / `runtime.clearSave()` API + an explicit component allowlist via `project.json#persistence.components` OR a `Persisted` marker component.
- `M4-c` Beacon World local-save proof: repaired beacons + scoreboard survive reload.

#### Engine polish

- `M13-c` `engine patch` post-apply schema validation — re-run relevant `engine check` validators against the in-memory result so the agent knows whether the patch would leave the project well-formed.

#### CI / dev-loop

- `CI fix` — get PRs #31 and #32 green; npm 11.11 on the runner crashes during `npm ci` even with `--no-audit --no-fund`. Need a deeper look: try `npm install --omit=optional`, or pin npm via `setup-node`'s `package-manager` cache, or fall back to `pnpm`/`yarn` for CI.
