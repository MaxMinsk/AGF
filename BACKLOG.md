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

## Current Sprint: Sprint 27 - TBD

Sprint 27 focus is picked at sprint start. Agent-first priority from `CLAUDE.md` applies. Default sprint size is 8–12 stories per `feedback-sprint-size`.

### Candidates

Anchor candidates: **E.52** (project summary), **E.56** (engine doctor scorecard), **E.54** (asset import), plus **M1** (project versioning) and **M7** (perf budgets / renderer metrics) per the M-list and AI-native sequencing in `HIGH_LEVEL_BACKLOG.md`.

#### AI-native one-liners (Notes/ai-game-engine-ideas.md)

- `E.52` `engine summarize <projectDir>` — compact project context summary (metadata, profiles, component vocabulary, system list, entity/component counts, asset summary, playtest list). `--json` + human output.
- `E.56` `engine doctor <projectDir>` — scorecard consolidating `engine check` + inspect summary + playtest list + recent runtime diagnostics + renderer info. Does NOT run expensive e2e.
- `E.54` `engine asset import <projectDir> <file>` — copy under `assets/runtime/`, append `asset-sources.json` entry, optionally emit a material manifest, run validation.
- `E.53` `template.json` + `template_context.md` — template context contract; add to `hello-3d` and Beacon World as the reference templates.

#### M1 — Project versioning

- `E.57` Add `agfFormatVersion` to `project.json`, scene extensions and material manifests.
- `E.58` `engine check` reports `AGF_FORMAT_VERSION_UNSUPPORTED` when the field is missing / older than supported.
- `E.59` `engine migrate <projectDir> [--dry-run]` v0 — emits planned JSON patches; non-dry-run writes them.

#### M7 — Perf budgets

- `E.60` Per-project `performance-budget.json` with soft/hard thresholds for renderer counters and bundle size.
- `E.61` `engine doctor` (or a dedicated `engine perf`) compares live `rendererInfo` against the project budget and fails on hard violations.

#### Backend follow-ups

- `10.5+` C# skeleton WebSocket transport — first transport on top of the smoke-only skeleton shipped in Sprint 25.
- `10.14` Server-authoritative carry — `intent.pickup` / `intent.drop` protocol extension.
- `10.16` Snapshot delta encoding — server sends only changed components per entity.
- `10.18` Server-side hazard / pickup state — move pulse timing + core respawns onto the server so two tabs see the same pattern.

#### Beacon World gameplay

- `13.12` Sound pings — first audio cue on pickup / deposit / damage so the loop has feedback beyond visuals.

#### Engine polish

- `E.62` Diagnostics overlay "copy as JSON" — add a single button (or `__agf.copyDiagnostics()`) so an agent / human can paste the full structured bus state in one move.
- `E.63` Lazy renderer import — convert `engine/runtime/start.ts` to dynamically import `engine/render/three-renderer.ts`; pairs with the already-locked import boundary.
