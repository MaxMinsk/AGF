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

## Current Sprint: Sprint 2 - Agent Loop And Asset Runtime

Goal: make the scene editable by agents, add the first gameplay systems, prototype JSON hot reload, add material/shader manifests, add runtime asset loading, and scaffold backend-agnostic persistent-world contracts.

Stories below are listed at the epic level. Each story must be expanded with tasks, acceptance criteria and verification at the moment it is picked up.

### Epic 6: Gameplay Systems v0

**Story 6.1: System Scheduler**

Status: Implemented.

Tasks:

- Define a `System` shape with a unique `name` and an optional `fixedUpdate(context)` hook.
- Define a `SystemContext` exposing the active `World` and current `TimeContext`.
- Implement `SystemScheduler` with `register`, `unregister`, `has`, `systemNames`, `size` and `runFixedStep`.
- Wire the scheduler into `startRuntime` so registered systems run on every fixed step.
- Keep `engine/core/systems/` independent from Three.js, DOM and Vite.

Acceptance criteria:

- Multiple systems can be registered and run in registration order on every fixed step.
- Registering a system with a duplicate name throws an actionable error.
- A system without `fixedUpdate` is skipped without affecting the rest.
- A runtime with no scheduler behaves exactly as before (no regressions).

Verification:

- Vitest suite for the scheduler (registration, run order, missing hook, duplicate guard, unregister re-index).

**Story 6.2: Sample Movement System**

Status: Implemented.

Tasks:

- Add a `Spin` component to `schemas/scene.schema.json` (`axis`: `x`/`y`/`z`, `speed`: degrees per second).
- Implement `createSpinSystem()` that rotates entities with `Spin` + `Transform` on every fixed step.
- Register the spin system in `src/app.ts` via the runtime scheduler.
- Attach `Spin` to `cube.hero` in `examples/hello-3d/scenes/start.scene.json`.
- Add `Spin` to the diagnostic component name suggestions in `engine check`.

Acceptance criteria:

- `cube.hero` visibly rotates in the browser.
- The system is deterministic for a fixed `dt` and works without a browser in unit tests.
- `engine check examples/hello-3d` still reports OK with the extended scene.
- Unknown-component diagnostics now suggest `Spin` alongside the original four.

Verification:

- Vitest suite for the spin system (axis selection, missing rotation, ignored entities).
- `npm run engine:check -- examples/hello-3d`
- Playwright smoke test (continues to render a nonblank canvas).

### Epic 7: Scene Patches And Hot Reload

**Story 7.1: Scene Diff To Commands**

Status: Implemented.

Tasks:

- Add `component.remove` to `EngineCommand` and `applyCommand`.
- Implement `diffScenes(prev, next): EngineCommand[]` in `engine/core/commands/scene-diff.ts`.
- Compare component data by stable JSON, ignoring object key order.
- Emit deletes before creates; emit component-removes before component-sets on surviving entities.

Acceptance criteria:

- Identical scenes produce no commands.
- Added/removed/changed entities and components produce the minimal command stream.
- Re-ordering JSON keys is a no-op.
- Applying the commands to a `World` built from `prev` yields a `World` equivalent to one built from `next`.

Verification:

- Vitest suite covers add/delete entity, component change, component remove, component add and the round-trip apply-to-world case.

**Story 7.2: JSON Scene Hot Reload In Dev**

Status: Implemented.

Tasks:

- Expose `runtime.applyCommands(commands)` on `RuntimeHandle`.
- Pass it through `AppHandle.applyCommands`.
- In `src/main.ts`, accept Vite HMR for `examples/hello-3d/scenes/start.scene.json`; on update, call `diffScenes(currentScene, nextScene)` and `app.applyCommands(...)`.
- Replace the held scene reference so subsequent edits diff against the latest state.

Acceptance criteria:

- Editing `start.scene.json` in dev updates the running browser without a full page reload.
- Editing a component value (color, Spin speed) is reflected on the next render frame.
- Adding or removing a primitive entity in the JSON is reflected without restarting the runtime.

Verification:

- Manual: change `cube.hero` color or `Spin.speed` in dev — change visible immediately.
- Continued green Playwright smoke test (full reload path is unaffected).

### Epic 8: Material And Shader v0

**Story 8.1: Material Manifest**

Status: Implemented.

Tasks:

- Author `schemas/material.schema.json` (`id`, `shader`, `color`, optional `roughness`/`metalness`/`emissive`/`alphaMode`).
- Extend `engine check` to scan `<assetRoot>/runtime/materials/*.material.json` and validate each file with the schema.
- Update the placeholder `tests/fixtures/valid-asset-reference` material with the full set of required fields.
- Add a `tests/fixtures/invalid-material` fixture (unknown property + bad shader enum + bad color hex).

Acceptance criteria:

- Valid material files pass `engine check` with no diagnostics.
- Invalid material files produce `AGF_SCHEMA_*` diagnostics pointing at the offending JSON path.
- Projects without a `runtime/materials/` directory are unaffected.

Verification:

- Vitest covers valid + invalid material fixtures.
- `npm run engine:check -- tests/fixtures/valid-asset-reference` is green.

**Story 8.2: Shader Manifest Spike**

Status: Implemented.

Tasks:

- Draft `schemas/shader.schema.json` skeleton (id, kind, glsl source path, declared uniforms).
- Write `docs/research/spikes/shader-manifest.md` capturing the proposed runtime flow and what is intentionally out of scope for v0.
- Do not wire the shader manifest into the renderer yet — that lands when a real custom shader use case appears.

Acceptance criteria:

- Shader schema can describe a vertex/fragment glsl pair with optional uniforms.
- Spike doc explains how a material would reference a shader and what the renderer would do at load time.
- The spike is explicit about not being a load path yet.

Verification:

- Manual review.

### Epic 8.5: Runtime Asset Loading v0

**Story 8.3: Asset Registry And Loader Contracts**

Status: Implemented.

Tasks:

- Implement `engine/runtime/asset-registry.ts`: `AssetRegistry` with `baseUrl`, `register(loader)`, `get<T>(ref)` and caching.
- Failed loads drop out of the cache so callers can retry after fixing the source.
- Implement `MaterialLoader` in `engine/runtime/asset-loaders/material-loader.ts` (matches `.material.json`, fetches and JSON-parses).
- Pass the registry through `RuntimeOptions.assetRegistry` to `ThreeRenderer`.
- `ThreeRenderer` reads `MeshRenderer.material`, loads the manifest via the registry, applies `color`/`roughness`/`metalness`/`emissive` to the `MeshStandardMaterial` once the promise resolves.

Acceptance criteria:

- Registering a loader and calling `get(ref)` returns the loader's parsed value.
- Repeated `get(ref)` returns the same promise (caching).
- `get(ref)` rejects if no loader matches.
- Failed loads can be retried after the underlying issue is fixed.
- `engine check examples/hello-3d` stays OK with a material reference in the scene.

Verification:

- Vitest covers register/get/cache/no-match/retry and the URL resolution.
- Manual: hero cube in `examples/hello-3d` renders with the metalness/roughness from its material manifest, not the inline color.

**Story 8.4: First GLB Import Path**

Status: Implemented.

Tasks:

- Implement `engine/render/glb-loader.ts` wrapping Three.js `GLTFLoader`.
- Register the GLB loader alongside the material loader in `src/app.ts`.
- Add a unit test for the matcher (`.glb` and `.gltf` only).
- Do not add a real `.glb` to `examples/hello-3d` yet — no art pipeline; tracked as a follow-up.

Acceptance criteria:

- A `.glb`/`.gltf` reference passed to the registry is routed to the GLB loader, not the material loader.
- The loader resolves with `{ scene }` from `GLTFLoader.load`, rejects with a clear error message on failure.
- Registry + GLB loader pair is usable from `src/app.ts` without further wiring.

Verification:

- Vitest covers the matcher.
- Manual hand-off: when a project ships a `.glb`, the renderer can load it through the registry without further code change.

Follow-up:

- Author a minimal `.glb` for `hello-3d` (Sprint 3 candidate) so the GLB path has an end-to-end smoke test.

**Story 8.5: Asset Authoring Checklist For Beacon World**

Status: Implemented.

Tasks:

- Write `docs/agent/asset-authoring-checklist.md` covering folder layout, per-asset steps, material/shader manifests, anti-patterns and expected diagnostics.
- Keep it short enough for an agent to load as context when adding a single asset.

Acceptance criteria:

- The doc names the folders (`source/`, `runtime/models|materials|textures|shaders/`).
- The doc references the material schema and the shader manifest spike.
- The doc spells out what NOT to do (anonymous binaries, paths escaping assetRoot, inline material data).
- The doc lists the diagnostic codes an author will hit when something is wrong.

Verification:

- Manual review.

### Epic 9: Agent Playtest Loop

**Story 9.1: Runtime Inspect API**

Status: Implemented.

Tasks:

- Implement `snapshotWorld(world, time): WorldSnapshot` in `engine/runtime/inspect.ts`. Pure function, no DOM.
- Snapshot includes `entityCount`, `entities[]` (sorted by id, each with id + components map), and a clone of the current `TimeContext`.
- Expose `runtime.snapshot()` on `RuntimeHandle`; pipe through `AppHandle.snapshot()`.
- In DEV builds only, mount `window.__agf = { snapshot, applyCommands }`.

Acceptance criteria:

- Snapshot of an empty world is empty.
- Snapshot lists entities sorted by id for deterministic comparison.
- Each entity's components map matches what `world.getComponent` returns.
- Mutating the time argument after the call does not leak into the snapshot.
- Production builds do not expose `window.__agf`.

Verification:

- Vitest suite for `snapshotWorld` (empty world, ordering, component projection, time isolation).

**Story 9.2: Robot Smoke Playtest**

Status: Implemented.

Tasks:

- Add `tests/e2e/agent-loop.spec.ts` driven entirely through `window.__agf`.
- Robot policy: wait for the runtime, take a baseline snapshot, wait 500ms, assert that `cube.hero.Transform.rotation[1]` advanced and `time.fixedStepCount` grew.
- Robot then pushes `applyCommands([{ component.set Spin speed: 0 }])`, waits, takes two further snapshots and asserts the rotation has frozen.
- Attach the final snapshot as a Playwright artifact for postmortem.

Acceptance criteria:

- The robot test passes deterministically alongside the existing canvas smoke test.
- The test only touches the runtime through the inspect API — no DOM scraping for state.
- Failure (e.g. SpinSystem not running) is caught by the rotation deltas, not by visual diffing.

Verification:

- `npm run test:e2e` runs both `app.spec.ts` and `agent-loop.spec.ts`.

### Epic 10: Backend-Agnostic Persistent World Seam

Stories:

- `10.1`: Protocol schema v0.
- `10.2`: Reference backend skeleton boundary.
- `10.3`: Network/world components in schema.

### Epic 12: Repo Hygiene

**Story 12.1: Cyrillic Characters CI Check**

Status: Implemented.

Tasks:

- Add `.github/workflows/repo-hygiene.yml` that runs `rg -l '\p{Cyrillic}'` against the checked-out tree.
- Rely on ripgrep's default `.gitignore` and binary-file handling so `Notes/`, `References/`, `node_modules/` and `dist/` are skipped automatically.
- Emit `::error file=...::` annotations for any matching file so GitHub UI points directly at the offending file.
- Move legacy tracked research notes (`AGENT_WEB_GAME_ENGINE_ANALYSIS.md`, `WEB_GAME_ENGINE_COMPARISON.md`) into the gitignored `Notes/` folder so the workflow's first run on main stays green.
- Document the check in `AGENTS.md` under a new "CI Hygiene" section.

Acceptance criteria:

- On push to `main` and on any PR, the workflow runs and passes against the current tree.
- Introducing any Cyrillic character into a tracked file fails the check with a clear error annotation pointing at the file.
- Notes/ and References/ are not scanned because they are gitignored.

Verification:

- Local: `rg -l '\p{Cyrillic}'` from the repo root returns no matches.
- CI: the workflow appears as a required-passing check on the next PR.

## Sprint 2 Demo

Sprint 2 is done when:

- An agent can edit scene JSON and dev runtime applies a patch.
- There is a movable entity with system logic and unit tests.
- `engine inspect` and runtime inspect API expose world snapshots.
- Material and shader manifests exist.
- Asset registry can load at least one runtime asset path.
- Robot playtest can drive the scene and save screenshot/metrics.
- Backend contracts exist, and any reference server code is isolated under `examples/backends/`.
- CI fails on Cyrillic characters in tracked repo files.

## Next Sprint: TBD

The next sprint will be detailed when Sprint 2 reaches close. Candidates come from `HIGH_LEVEL_BACKLOG.md` (material/shader v1, asset pipeline polish, Beacon World scaffold, inspector overlay, physics v0).
