# Claude Code Project Memory

This repo is AgentsGameFramework (AGF), an agent-first web game framework. Claude Code is expected to be the primary implementation agent, so optimize for clear files, explicit contracts and verifiable steps.

This folder is the public repository root for the engine. Example games are nested projects under `examples/`, not separate repository roots.

## Non-Negotiable Rules

- Use English for all repository documentation, code comments, identifiers, diagnostics, commit messages and user-facing in-app text unless localization is the task.
- Keep gameplay state in ECS data and commands, not in renderer objects or hidden globals.
- Do not import Three.js, DOM APIs, Vite or Playwright from `engine/core`.
- Do not edit generated files by hand.
- Treat JSON Schema project data as runtime input: validate before trusting it.
- Prefer small patches with verification over broad refactors.

## Current Project Phase

Sprint 0 is archived. Sprint 1 is active: project/scene validation, the first renderer vertical slice, ECS storage and agent-facing CLI.

## Read First

- `README.md` for project overview.
- `BACKLOG.md` for the active detailed sprint and next detailed sprint.
- `HIGH_LEVEL_BACKLOG.md` for roadmap epics.
- `BACKLOG_ARCHIVE.md` for completed sprint details.
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
npm run engine:inspect examples/hello-3d -- --json
npm run playtest examples/hello-3d
dotnet build examples/backends/dotnet-world-server/GameServer.csproj
```

If a planned command does not exist yet, do not invent results. Note the gap and use the nearest available verification.
