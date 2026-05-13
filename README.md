# AgentsGameFramework

AgentsGameFramework (AGF) is a lightweight web framework for 2D/3D games, designed for AI-agent development through text files, strict schemas, fast checks and headless playtests.

This folder is the public repository root for the engine. Example games are nested projects under `examples/`, starting later with `examples/beacon-world/`.

## Direction

- Browser runtime: TypeScript, Vite, Three.js.
- Game data: JSON/JSON Schema scenes, prefabs, materials and protocol contracts.
- Runtime architecture: pragmatic ECS + command pipeline.
- Tests: Vitest for core logic, Playwright for browser smoke/playtests.
- Backend: backend-agnostic protocol/world contracts. A C#/.NET backend can exist as a reference integration, but Node.js or any other server implementation should be possible.

## Start Here

Read these in order:

1. [Backlog](BACKLOG.md)
2. [High-Level Backlog](HIGH_LEVEL_BACKLOG.md)
3. [Backlog Archive](BACKLOG_ARCHIVE.md)
4. [Architecture](docs/ARCHITECTURE.md)
5. [Development](docs/DEVELOPMENT.md)
6. [Claude Code Memory](CLAUDE.md)
7. [Agent Rules](AGENTS.md)
8. [Glossary](docs/GLOSSARY.md)

## Current Phase

Sprint 1: TypeScript/Vite workspace, test baseline, first scene validation path and renderer vertical slice.

Completed sprint details move to `BACKLOG_ARCHIVE.md`. Broad roadmap epics live in `HIGH_LEVEL_BACKLOG.md`.

## Useful Commands

```bash
npm run engine:check -- examples/hello-3d
npm run engine:inspect -- examples/hello-3d
npm run typecheck
npm run test
npm run preflight
```
