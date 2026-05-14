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
- **Systems must cache `world.createQuery(...)` handles**, never call `world.query(...)` directly inside `frameUpdate` / `fixedUpdate`. Cached query handles are ~18,000× faster than raw `world.query()` on a steady-state scene (`docs/research/ecs-benchmarks-baseline.json`). Cold paths (HMR invalidate, round reset, one-off CLI tools) may use raw `query()`; mark the line with `// agf-allow: world.query` so the `systems:check` script doesn't flag it. The script runs in `npm run preflight`.
- **No per-frame Three.js resource allocation.** Renderer systems must reuse `Vector3` / `Quaternion` / `Matrix4` / scratch arrays across frames; never construct a `MeshStandardMaterial`, `BufferGeometry`, `Texture`, render target or other GPU resource inside a `frameUpdate` / `fixedUpdate` callback. New GPU resources land on lifecycle paths (acquire / release) or HMR; everything else writes into pre-allocated scratch. Source: `Notes/utsubo_threejs_best_practices_100_tips.md` §16. Verified by allocation bench `npm run bench:ecs:alloc` (`docs/research/ecs-allocations-baseline.json`) — a regression here surfaces as a heap-delta-per-op spike.
- **Material variants must be manifest refs**, not one-off `new MeshStandardMaterial({...})` inside gameplay code. Each unique material signature pays a shader-compile cost + breaks batching. If you need a per-entity colour override, use `MeshRenderer.color` (inline) or extend a shared manifest; don't fork the material.
- **Loaders / decoders are constructed once** at adapter init. Never call `new DRACOLoader()` / `new KTX2Loader()` per asset — both have shared setup state (transcoder paths, renderer feature detection). The renderer / asset adapter owns one of each and threads them into `GLTFLoader.setKTX2Loader` / `.setDRACOLoader`.

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

## CI Hygiene

- `.github/workflows/repo-hygiene.yml` fails the build when any tracked file contains Cyrillic characters. Personal notes live in the gitignored `Notes/` folder and may use any language.
