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

## Current Sprint: Sprint 30 — Transform hierarchy, persistence v0, dev-server investigation

Sprint 30 focus: open the composition path (**M16** transform hierarchy — hardest to retrofit, lands first), ship persistence v0 (**M4-a/b/c** with Beacon proof), produce the dev-server design doc (**M15/E.80**), and small follow-ups (`M3-b` scene-instance expander, `M13-c` patch post-apply validation).

### Stories

#### M15 — Engine dev server

- `E.80` Investigation only — write `docs/research/engine-dev-server-investigation.md` covering use cases, architecture options, endpoint surface, security stance, and a sequenced implementation plan. No code.

#### M16 — Transform hierarchy

- `M16-a` Add optional `Transform.parent` to `schemas/scene.schema.json` (`type: string`) and per-project scene extensions. Diagnostics `AGF_TRANSFORM_PARENT_MISSING`, `AGF_TRANSFORM_PARENT_CYCLE`, `AGF_TRANSFORM_PARENT_SELF`. Bump `agfFormatVersion` if the migration tool needs it.
- `M16-b` Pure resolver `engine/core/transform/resolve.ts` returning `{ local, world }` per entity, using a topological walk. Unit tests: flat, single parent, deep chain, sibling order, cycle detection.
- `M16-c` Renderer consumes derived world transforms via the resolver. Preserve the renderer-import-boundary (renderer reads only the resolver result, never the raw ECS hierarchy).
- `M16-d` `engine inspect` prints `parent` + derived `worldPosition` per entity. Helps agents reason about composite scenes.

#### M4 — Persistence v0

- `M4-a` `engine/runtime/persistence/local-store.ts` with a small interface (`get` / `set` / `delete`) and an IndexedDB adapter; per-project + per-profile + per-slot save key shape; format version stored alongside each save.
- `M4-b` `runtime.save()` / `runtime.load()` / `runtime.clearSave()` API + a `project.json#persistence.components` allowlist (engine refuses to persist anything outside it).
- `M4-c` Beacon World local-save proof — repaired beacons + scoreboard survive a page reload in the static profile. Playwright e2e locks it.

#### M3 — Prefab follow-ups

- `M3-b` Scene `instances: [{ id, prefab, overrides? }]` + pure `expandScenePrefabs(scene, prefabRegistry)` function — schema-validated, no engine wire-up yet. Unit tests cover the expansion contract.

#### Engine polish

- `M13-c` `engine patch` post-apply validation — re-run relevant `engine check` validators against the in-memory result so the agent knows whether the patch would leave the project well-formed before committing it to disk.

### Carried to Sprint 31

- `M3-c` Beacon World adopts prefabs once `M3-b` is wired into scene load.
- `M16` polish — cascade-delete commands; prefab expansion preserves parent links.
- **M18** picking / raycast; **M19** tween + particles; **M17** renderer instancing.
- `10.5+` C# WS transport; remaining 10.x server-authoritative work.
- `13.13` audio asset path.
