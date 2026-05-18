# Claude Code Project Memory

This repo is AgentsGameFramework (AGF), an agent-first web game framework. Claude Code is expected to be the primary implementation agent, so optimize for clear files, explicit contracts and verifiable steps.

This folder is the public repository root for the engine. Example games are nested projects under `examples/`, not separate repository roots.

## Non-Negotiable Rules

- AGF is agent-first. Prefer features that improve the agent's edit → validate → run → inspect cycle. Human-developer GUI tooling (visual inspectors, in-browser command palettes, scene editors) is explicitly low priority.
- Project-specific gameplay code, components and schema fragments live under `examples/<project>/`, never in `engine/` or root `schemas/`. Engine ships only generic primitives + reusable systems.
- Use English for all repository content: code, comments, identifiers, docs, commit messages, PR text, diagnostics, fixtures. Conversational replies follow the user's language; only what lands in the repo is locked to English.
- Keep gameplay state in ECS data and commands, not in renderer objects or hidden globals.
- **Prefer ECS systems by default.** When adding new runtime behaviour (rendering passes, asset bindings, audio, input adapters, network adapters, etc.) the default shape is a scheduler-registered `System` reading/writing typed components. Deviate only when there is a concrete blocker — measurable perf cost, significant architectural complexity, or a third-party API that demands an opaque internal cache. Document the deviation inline when it happens.
- Do not import Three.js, DOM APIs, Vite or Playwright from `engine/core`.
- Do not edit generated files by hand.
- Treat JSON Schema project data as runtime input: validate before trusting it.
- Prefer small patches with verification over broad refactors.

## Working Mode

- A sprint runs on a single long-lived branch named `sprint/<N>-<slug>` cut from `main`. Stories are atomic commits inside that branch — no nested PRs, no waiting for review during the sprint.
- The **single source of truth** for the active sprint, its stories, follow-ups, and archive entries is `backlog/sprints/S<NN>.sprint.json`. `BACKLOG.md` and the trailing section of `BACKLOG_ARCHIVE.md` (everything below the `<!-- backlog:render:start -->` marker) are **generated** views — never hand-edit them. The hand-written prelude of `BACKLOG_ARCHIVE.md` (S0–S77) is frozen legacy and will be migrated by `BACKLOG-MIGRATE-HISTORY` later.
- Story lifecycle: `pending` → `in_progress` → `implemented` (with `verification[]`) or `deferred` (with `deferredReason`). Sprint lifecycle: `pending` → `active` → `archived` (at most one `active` across all sprint files).
- When a story is marked `implemented` in its sprint JSON, run `npm run backlog:check && npm run backlog:render`, then commit (sprint JSON + the regenerated `BACKLOG.md` / `BACKLOG_ARCHIVE.md`). No need to wait for an explicit "commit it" instruction. Use the smallest relevant verification (typecheck / unit / `engine check`) before committing.
- One PR `sprint/<N>-... → main` is opened (or updated) at sprint close. At sprint close, flip the sprint JSON's `status` to `archived` + fill `archivedAt` + `prUrl`, then `backlog:render` produces the archive entry. `/archive-sprint` is no longer needed — the rendering covers it.
- Exception: if a single change needs to merge before the sprint closes (hotfix, urgent doc), cherry-pick it onto a focused `feature/<slug>` branch and open a small PR.
- Run `npm run preflight` only at sprint close, not on every story. Preflight includes `npm run backlog:check` and `npm run backlog:render -- --check` (CI fails if the rendered Markdown is stale vs the JSON).
- Default to making the reasonable call and continuing; flag the decisions in the end-of-turn summary so they can be redirected.

## Current Project Phase

Sprint 0 is archived. Sprint 1 is active: project/scene validation, the first renderer vertical slice, ECS storage and agent-facing CLI.

## Read First

- `README.md` for project overview.
- `BACKLOG.md` for the active detailed sprint and next detailed sprint **(generated — edit `backlog/sprints/*.sprint.json` instead)**.
- `HIGH_LEVEL_BACKLOG.md` for roadmap epics.
- `BACKLOG_ARCHIVE.md` for completed sprint details (legacy prelude hand-written, post-S77 entries generated).
- `backlog/sprints/S<NN>.sprint.json` — the actual source of truth for the active + archived sprints.
- `notes/backlog_engine_analysis.md` for the full design of the JSON-first backlog workflow.
- `AGENTS.md` for repo-wide agent rules.
- `docs/ARCHITECTURE.md` for runtime boundaries.
- `docs/STRUCTURE.md` for target repository layout.
- `docs/research/README.md` for implementation research notes.
- `docs/QUALITY_AXES.md` for how AGF defines "works" beyond build success.
- `docs/agent/debug-protocol.md` for debugging workflow.
- `SAMPLE_GAME_IDEAS.md` for the dogfood game direction.

## Architecture Summary

- Browser runtime: TypeScript, Vite, Three.js.
- Core architecture: pragmatic ECS, schema-backed components, command pipeline.
- Project data: JSON/JSON Schema scenes, prefabs, materials, shaders and protocol contracts.
- Tests: Vitest for pure logic, Playwright for browser smoke/playtests.
- Backend: backend-agnostic protocol/world contracts. C#/.NET is only a reference implementation path, not an engine dependency.
- Sample game direction: `Beacon World`, a solo-first persistent shared world.
- Assets: Meshy + Blender + CC0 libraries + procedural materials first; source metadata and runtime assets must be tracked separately.
- Preflight validates `examples/hello-3d` before typecheck, unit tests, production build and browser smoke tests.

## Expected Workflow

1. Inspect relevant files before editing.
2. Check ADRs before changing architecture.
3. Make the smallest coherent change.
4. Add/update tests or docs for the changed behavior.
5. Run the smallest relevant verification available.
6. Summarize changed files, verification and remaining risks.

## Commands

Use the smallest relevant command first:

```bash
npm run dev
npm run build
npm run typecheck
npm run test
npm run test:e2e
npm run preflight
npm run engine:check -- examples/hello-3d
npm run engine:inspect -- examples/hello-3d
npm run engine:inspect -- examples/hello-3d --json
npm run playtest examples/hello-3d
dotnet build examples/backends/dotnet-world-server/GameServer.csproj
```

If a planned command does not exist yet, do not invent results. Note the gap and use the nearest available verification.
