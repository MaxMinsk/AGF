# Agent Rules

This repository is optimized for coding agents. Follow these rules unless a task explicitly says otherwise.

Claude Code should read `CLAUDE.md` first. Project slash commands live in `.claude/commands/`, and project subagents live in `.claude/agents/`.

This folder is the public engine repository root. Example games live under `examples/` as nested projects.

## Default Workflow

1. Inspect relevant files before editing.
2. Check ADRs before changing architecture.
3. Keep gameplay logic in ECS systems and data files.
4. Validate project files before running browser tests.
5. Prefer small, reviewable patches.
6. Summarize verification and remaining risks.

For recurring failures, update a validator, test, debug note or agent skill instead of relying on memory.

## Hard Rules

- Use English for all repository documentation, code comments, identifiers, diagnostics, commit messages and user-facing in-app text unless a task explicitly requires localization.
- Do not put Three.js objects in gameplay components.
- Do not import renderer code from `engine/core`.
- Do not edit generated files by hand.
- Do not add hidden global gameplay state.
- Do not bypass schemas for scene, prefab, material or protocol data.
- Do not use `any` for external data; parse `unknown` through validators.
- Do not make multiplayer mandatory for single-player projects.
- Do not put example-game root assumptions above the engine repository root.

## Diagnostics

Every validation error should include:

- `code`
- `file`
- `path`
- `severity`
- `message`
- `suggestion` when possible

## Expected Verification

Use the smallest relevant check:

- Documentation-only change: read through changed docs and check links.
- Core logic: typecheck and unit tests.
- Scene/schema change: `engine check`.
- Browser/runtime change: Playwright smoke test and screenshot.
- Backend change: `dotnet build` or server tests.
- Meaningful implementation task: `npm run preflight` once available.
