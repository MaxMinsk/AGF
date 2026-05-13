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

## Current Sprint: Sprint 27 - AI-native CLI, versioning, perf budgets

Sprint 27 focus: ship the four AI-native CLI one-liners (`summarize`, `doctor`, `asset import`, template scaffolding) plus M1 (project versioning) and M7 (perf budgets / renderer metrics), with one polish ticket (`__agf.copyDiagnostics()`).

### Stories

#### AI-native one-liners (Notes/ai-game-engine-ideas.md)

- `E.52` `engine summarize <projectDir>` — compact project context summary (metadata, profiles, component vocabulary, system list, entity/component counts, asset summary, playtest list). `--json` + human output. **Implemented.**
- `E.56` `engine doctor <projectDir>` — scorecard consolidating `engine check` + inspect summary + playtest list + perf budget. Does NOT run expensive e2e. **Implemented.**
- `E.54` `engine asset import <projectDir> <file>` — copy under `assets/runtime/<subdir>/`, append `asset-sources.json` entry. **Implemented.**
- `E.53` `template.json` + `template_context.md` — template context contract; reference copies in `hello-3d` and `beacon-world`. **Implemented.**

#### M1 — Project versioning

- `E.57` Add `agfFormatVersion` to `project.json` schema + reference projects. **Implemented.**
- `E.58` `engine check` reports `AGF_FORMAT_VERSION_MISSING` / `_TOO_OLD` / `_UNSUPPORTED`. **Implemented.**
- `E.59` `engine migrate <projectDir> [--dry-run]` v0 — emits planned JSON patches; non-dry-run writes them. **Implemented.**

#### M7 — Perf budgets

- `E.60` Per-project `performance-budget.json` with soft/hard thresholds for renderer counters and bundle size; schema under `schemas/performance-budget.schema.json`. **Implemented.**
- `E.61` `engine doctor` reads the budget and `compareRendererInfo(info, budget)` returns soft/hard violations against live `rendererInfo`. **Implemented.**

#### Engine polish

- `E.62` `window.__agf.copyDiagnostics()` — serialises the diagnostics bus and best-effort copies it to the OS clipboard; returns the JSON either way. **Implemented.**

### Deferred to Sprint 28

- `E.63` Lazy renderer import — start.ts → dynamic `import("../render/three-renderer")`. Defer until bundle-size budget signals it's needed; Vite already chunk-splits `three`.
