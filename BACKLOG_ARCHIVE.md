# Backlog Archive

Date: 2026-05-13

Completed sprint details live here. Keep the active backlog focused by moving finished sprint content out of `BACKLOG.md` at sprint close.

## Archive Process

At the end of every sprint:

1. Add a sprint entry here.
2. Include completed stories, important deliverables, verification and known follow-ups.
3. Remove completed detailed stories from `BACKLOG.md`.
4. Keep broad unfinished epics in `HIGH_LEVEL_BACKLOG.md`.
5. Keep the next one or two sprints detailed in `BACKLOG.md`.

## Sprint 0 - Discovery, Rules And Technical Spikes

Status: Completed and archived.

### Completed Work

- Created project overview and development documentation.
- Created architecture docs, glossary and repository structure docs.
- Added ADRs for TypeScript/C# split, pragmatic ECS, Three.js renderer, JSON Schemas and command pipeline.
- Added agent rules, review checklist, skill drafts and prompt templates.
- Added Claude Code project memory, slash commands and subagents.
- Added research notes for Three.js, TypeScript, dev loop, backend multiplayer and asset sources.
- Added spike notes for Three.js bootstrap, schema validation, HMR patching and protocol contracts.
- Defined Beacon World as the main persistent-world sample game direction.
- Defined asset source and workflow guidance in `ASSETS_SOURCES.md`.

### Deliverables

- `README.md`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/DEVELOPMENT.md`
- `docs/STRUCTURE.md`
- `docs/GLOSSARY.md`
- `docs/adr/`
- `docs/agent/`
- `docs/research/`
- `.claude/`
- `SAMPLE_GAME_IDEAS.md`
- `ASSETS_SOURCES.md`
- `HIGH_LEVEL_BACKLOG.md`

### Verification

- File structure was inspected.
- Documentation links and topic coverage were manually reviewed.
- No code tests were run because Sprint 0 was documentation and planning only.

### Follow-Ups

- Sprint 1 should scaffold the TypeScript/Vite workspace.
- Asset metadata should be implemented early enough to avoid anonymous files.
- Keep repository files in English.

## Sprint 1 - Playable Foundation

Status: Completed and archived.

### Completed Work

- `1.1` Scaffolded the TypeScript/Vite workspace with strict `tsconfig.json` and the engine/examples/schemas/tests folder split.
- `1.2` Established the Vitest + Playwright baseline with a screenshot-attaching browser smoke test.
- `2.1` Authored `schemas/scene.schema.json` covering `Transform`, `Camera`, `MeshRenderer` and `Name`; valid/invalid fixtures with actionable diagnostics.
- `2.2` Added `schemas/project.schema.json` plus `examples/hello-3d/project.json`; missing `startScene` reports a field-specific diagnostic.
- `2.3` Laid out `examples/hello-3d/assets/` with `_sources/asset-sources.json` and a typed metadata schema.
- `2.4` Added asset reference validation for `MeshRenderer` mesh/material under `assetRoot`; primitive meshes stay valid without files.
- `3.1` Pragmatic ECS `World` with sparse component stores, query intersections and `World.fromScene`.
- `3.2` Command pipeline v0 with `EngineCommand` union (`entity.create`, `entity.delete`, `component.set`, `scene.load`), `CommandQueue` and ordered command log.
- `4.1` Three.js render adapter — `ThreeRenderer` mirrors World state into a `THREE.Scene`, supports primitive meshes, reads Camera and applies Transform every frame.
- `4.2` Fixed-step loop with pure `advanceFixedStep` accumulator, `TimeContext` and dev FPS overlay shown only when `import.meta.env.DEV`.
- `5.0` Shared CLI diagnostic shape (`code`/`file`/`path`/`severity`/`message`/`suggestion`) with valid + intentionally invalid fixtures.
- `5.1` `engine check <projectDir>` CLI with human-readable and `--json` output; exit code `0`/`1`.
- `5.2` `engine inspect <projectDir>` CLI prints normalized scene entities, with `--json` for agents.

### Deliverables

- `engine/core/{ecs,commands,loop}/`
- `engine/runtime/{start,dev-overlay}.ts`
- `engine/render/three-renderer.ts`
- `engine/tools/{check,inspect,cli}.ts`
- `schemas/{project,scene,asset-sources}.schema.json`
- `examples/hello-3d/`
- `src/{main,app}.ts`, `src/styles.css`, `index.html`
- `tests/unit/{math,project-check,engine-cli,ecs-world,commands,fixed-step}.test.ts`
- `tests/e2e/app.spec.ts`
- `tests/fixtures/{valid-project,invalid-project,missing-start-scene,valid-asset-reference,missing-asset-reference,invalid-asset-metadata}/`
- `docs/diagnostics.md` (canonical diagnostic code catalog)
- `.claude/commands/{adr-new,archive-sprint}.md`
- `.claude/settings.json` (project allowlist)

### Verification

- `npm run preflight` at sprint close — typecheck, 34 Vitest tests across 6 files, vite build, 1 Playwright e2e (nonblank Three.js canvas).
- Screenshot artifact `hello-3d-canvas.png` confirms the yellow cube + blue floor + dev overlay.

### Follow-Ups

- Sprint 2 candidates `11.1`–`11.4` (preflight script, debug-protocol, template-policy, quality-axes docs) were authored during Sprint 0/1 and already exist. They should be moved to this archive (or to Sprint 0) instead of re-running in Sprint 2.
- Vite production bundle includes Three.js and crosses the 500 KB warning threshold. Consider manual chunking when bundle hygiene becomes a real concern.
- `WebGLRenderer` runs with `preserveDrawingBuffer: true` so e2e pixel readback works. Revisit if a perf budget appears.
- Cyrillic-character CI check is parked in `HIGH_LEVEL_BACKLOG.md` parking lot as a Sprint 2 candidate.

## Sprint 2 - Agent Loop And Asset Runtime

Status: Completed and archived.

### Completed Work

- `6.1` `SystemScheduler` v0 in `engine/core/systems/`: registration-ordered, duplicate-name guard, missing-hook skip, wired into `startRuntime` via the `scheduler` option.
- `6.2` `Spin` component + `createSpinSystem()`; hero cube now rotates 45°/s around Y, driven by the scheduler.
- `7.1` `diffScenes(prev, next): EngineCommand[]` + new `component.remove` command; key-sorted JSON comparison so JSON-key reordering is a no-op.
- `7.2` `runtime.applyCommands()` exposed on the handle; Vite HMR for `start.scene.json` diffs the scene and patches the live world.
- `8.1` `schemas/material.schema.json` + `engine check` validates `<assetRoot>/runtime/materials/*.material.json`; valid/invalid fixtures cover the contract.
- `8.2` `schemas/shader.schema.json` (draft) + `docs/research/spikes/shader-manifest.md` capturing the proposed runtime flow and out-of-scope list.
- `8.3` `AssetRegistry` with loader plugins, caching and retry-on-failure; `MaterialLoader` fetches and parses `.material.json` via `fetch`.
- `8.4` `engine/render/glb-loader.ts` wraps Three.js `GLTFLoader`; matcher unit-tested. Real `.glb` for `hello-3d` is a Sprint 3 follow-up (no art pipeline yet).
- `8.5` `docs/agent/asset-authoring-checklist.md` — folder layout, per-asset steps, manifests, anti-patterns and diagnostic codes.
- `9.1` `snapshotWorld(world, time)` pure function; `runtime.snapshot()` + `window.__agf = { snapshot, applyCommands }` in DEV builds only.
- `9.2` Playwright robot playtest drives the runtime through `window.__agf`: observes `SpinSystem` advancing rotation, then pushes a `component.set` to freeze the spin and asserts the change.
- `12.1` `.github/workflows/repo-hygiene.yml` fails CI on Cyrillic characters in tracked files; legacy Russian research notes moved into `Notes/`.

### Deliverables

- `engine/core/systems/` (scheduler + spin)
- `engine/core/commands/scene-diff.ts`, `component.remove` in the commands union
- `engine/render/glb-loader.ts`, material wiring in `engine/render/three-renderer.ts`
- `engine/runtime/asset-registry.ts`, `engine/runtime/asset-loaders/material-loader.ts`, `engine/runtime/inspect.ts`
- `schemas/{material,shader}.schema.json`
- `examples/hello-3d/assets/runtime/materials/cube-hero.material.json` (visible hero-cube material)
- `tests/unit/{system-scheduler,spin-system,scene-diff,inspect,asset-registry}.test.ts`
- `tests/e2e/agent-loop.spec.ts`
- `tests/fixtures/invalid-material/`
- `.github/workflows/repo-hygiene.yml`
- `docs/agent/asset-authoring-checklist.md`, `docs/research/spikes/shader-manifest.md`

### Verification

- Sprint-close `npm run preflight`: typecheck clean, 66 Vitest tests across 11 files, vite build OK, 2 Playwright e2e (nonblank Three.js canvas + robot agent-loop).
- `npm run engine:check -- examples/hello-3d` green with the new material reference.
- Screenshot artifact shows the hero cube rendered with metallic cyan + emissive from the loaded material manifest.

### Demo Criteria

7 of 8 met:

- Agent edits scene JSON and dev runtime applies a patch — met.
- Movable entity with system logic and unit tests — met.
- `engine inspect` and runtime inspect API expose world snapshots — met.
- Material and shader manifests exist — met.
- Asset registry loads at least one runtime asset path — met.
- Robot playtest can drive the scene and save metrics — met.
- CI fails on Cyrillic characters — met.
- Backend contracts isolated under `examples/backends/` — deferred to Sprint ~5 by stakeholder decision; solo-client features take priority first.

### Follow-Ups

- Author a minimal `.glb` for `hello-3d` so the GLB loader has an end-to-end smoke (Sprint 3 candidate).
- Wire production asset serving: dev relies on Vite's default file serving; build needs an explicit `public/` or copy step before non-bundled assets can ship.
- Asset hot reload: a `*.material.json` edit currently does not retrigger the renderer because the registry caches the first resolved value. Material HMR is a natural extension of Story 7.2.
- Consider a non-DEV path for `window.__agf` (or a query-flagged opt-in) once a production debugging story is needed.
- Epic 10 (Backend contracts) parked for Sprint ~5.

