# Agent Rules

This repository is optimized for coding agents. Follow these rules unless a task explicitly says otherwise.

Claude Code should read `CLAUDE.md` first. Project slash commands live in `.claude/commands/`, and project subagents live in `.claude/agents/`.

This folder is the public engine repository root. Example games live under `examples/` as nested projects (`hello-3d`, `beacon-world`, `batch-bench`, `physics-bench`, `shadows-bench`, `material-bench`).

## Default Workflow

1. Inspect relevant files before editing.
2. Check ADRs before changing architecture.
3. Keep gameplay logic in ECS systems and data files.
4. **Reuse engine primitives before writing project-local clones.** Grep `engine/core/systems/`, `engine/core/ecs/component-defs/` and `schemas/components/` for the closest match. If `Spin` already rotates a parent around Y, do not author a keyboard-driven `GroupRotator` system to do the same thing.
5. Validate project files before running browser tests.
6. Prefer small, reviewable patches.
7. Summarize verification and remaining risks.

For recurring failures, update a validator, test, debug note or agent skill instead of relying on memory.

## Hard Rules

- Use English for all repository documentation, code comments, identifiers, diagnostics, commit messages and user-facing in-app text unless a task explicitly requires localization.
- Do not put Three.js objects in gameplay components.
- Do not import renderer code from `engine/core`.
- Do not edit generated files by hand.
- Do not add hidden global gameplay state.
- Do not bypass schemas for scene, prefab, material, LOD, asset-sources or protocol data.
- Do not use `any` for external data; parse `unknown` through validators.
- Do not make multiplayer mandatory for single-player projects.
- Do not put example-game root assumptions above the engine repository root.
- **ECS systems are the default container for new runtime behaviour.** Rendering passes, asset bindings, audio, input adapters, network adapters — all default to scheduler-registered `System`s reading typed components. Deviate only when there is a concrete blocker (measurable perf cost, third-party API that demands an opaque cache); document the deviation inline at the deviation site.
- **Systems must cache `world.createQuery(...)` handles**, never call `world.query(...)` directly inside `frameUpdate` / `fixedUpdate`. Cached query handles are ~18,000× faster than raw `world.query()` on a steady-state scene (`docs/research/ecs-benchmarks-baseline.json`). Cold paths (HMR invalidate, round reset, one-off CLI tools) may use raw `query()`; mark the line with `// agf-allow: world.query` so the `systems:check` script doesn't flag it. The script runs in `npm run preflight`.
- **No per-frame Three.js resource allocation.** Renderer systems must reuse `Vector3` / `Quaternion` / `Matrix4` / scratch arrays across frames; never construct a `MeshStandardMaterial`, `BufferGeometry`, `Texture`, render target or other GPU resource inside a `frameUpdate` / `fixedUpdate` callback. New GPU resources land on lifecycle paths (acquire / release) or HMR; everything else writes into pre-allocated scratch. Source: `Notes/utsubo_threejs_best_practices_100_tips.md` §16. Verified by allocation bench `npm run bench:ecs:alloc` (`docs/research/ecs-allocations-baseline.json`) — a regression here surfaces as a heap-delta-per-op spike.
- **Material variants must be manifest refs**, not one-off `new MeshStandardMaterial({...})` inside gameplay code. Each unique material signature pays a shader-compile cost + breaks batching. If you need a per-entity colour override, use `MeshRenderer.color` (inline) or extend a shared manifest; don't fork the material.
- **Texture refs inside material manifests are project-relative paths** (`runtime/textures/foo.jpg`). The runtime resolves them through `AssetRegistry.urlFor` so they hit the project's `assetRoot`. Do not write absolute URLs in manifest fields, and do not bypass the registry by hand-loading textures with `new TextureLoader().load(...)` in gameplay code.
- **`MeshRenderer.material` is a full manifest path** (`runtime/materials/<id>.material.json`), not the manifest's `id` field. The schema currently accepts any non-empty string; the runtime needs the full path to resolve through the asset registry.
- **Loaders / decoders are constructed once** at adapter init. Never call `new DRACOLoader()` / `new KTX2Loader()` per asset — both have shared setup state (transcoder paths, renderer feature detection). The renderer / asset adapter owns one of each and threads them into `GLTFLoader.setKTX2Loader` / `.setDRACOLoader`.
- **Built-in primitive set is `box / sphere / cylinder / plane`.** Adding a new primitive means touching five places (registry / batcher / project-check / project-doctor / scene-extensions enum) — do it deliberately, not as a side-effect of a project-local need.
- **`Transform.rotation` is degrees** in scene + prefab JSON. The runtime converts to radians once during resolve. Do not pre-convert in scene authoring; do not assume radians anywhere outside `engine/render/`.
- **Prefab instance overrides merge shallow** per top-level component. `overrides.Transform = { position: [3, 0, 0] }` replaces the prefab's `Transform.position` and inherits the prefab's other Transform fields; it does NOT deep-merge nested arrays.
- **Do not kill port 5173 between test runs.** `playwright.config.ts` declares `reuseExistingServer: true` and probes `127.0.0.1:5173` before spawning its own dev server. Running `npx playwright test ...` (or `npm run preflight`) while `npm run dev` is up is fully supported — the developer's live HMR loop stays intact. The only time to free 5173 is when an actual zombie process is holding it (no live `/__agf/health` response) AND a fresh dev server is needed.

## Diagnostics

Every validation error should include:

- `code`
- `file`
- `path`
- `severity`
- `message`
- `suggestion` when possible

See `docs/diagnostics.md` for the canonical code catalogue and
`docs/diagnostics-policy.md` for the logging policy (severity scale,
code naming, CI gates banning `console.log` in engine + project src).

## Expected Verification

Use the smallest relevant check:

- Documentation-only change: read through changed docs and check links.
- Core logic: typecheck and unit tests.
- Scene/schema change: `engine check` (and `engine doctor` when you touched materials, textures, prefabs, batching or shadow config).
- Browser/runtime change: Playwright smoke test and screenshot.
- Backend change: `dotnet build` or server tests.
- Meaningful implementation task at sprint close: `npm run preflight`.

Workflow is one long-lived `sprint/<N>-<slug>` branch with atomic story commits; one PR per sprint, merged via auto-merge. Preflight runs at sprint close only. See [`feedback-workflow`] memo for the full policy.

## CI Hygiene

- `.github/workflows/repo-hygiene.yml` fails the build when any tracked file contains Cyrillic characters. Personal notes live in the gitignored `Notes/` folder and may use any language.
- `npm run repo:hygiene` is the same check, locally, before push.
