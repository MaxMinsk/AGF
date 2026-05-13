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

## Current Sprint: Sprint 1 - Playable Foundation

Goal: scaffold the TypeScript/Vite workspace, load a scene from JSON, render a simple 3D canvas path, validate project data, and establish unit/browser tests.

### Epic 1: Repository And Toolchain

**Story 1.1: Scaffold TypeScript Workspace**

Status: Implemented.

Tasks:

- Create `package.json`.
- Configure Vite.
- Configure strict `tsconfig.json`.
- Configure a minimal formatter/lint approach.
- Create folders: `engine/`, `examples/`, `schemas/`, `tests/`.

Acceptance criteria:

- `npm run typecheck` exists and passes.
- `npm run dev` starts a Vite app.
- `npm run build` creates a static build.

Verification:

- `npm run typecheck`
- `npm run build`

**Story 1.2: Testing Baseline**

Status: Implemented.

Tasks:

- Add Vitest.
- Add Playwright.
- Add one pure unit test.
- Add one browser smoke test that opens the app and verifies a canvas exists.
- Save a screenshot artifact during the browser smoke test.

Acceptance criteria:

- `npm run test` runs Vitest.
- `npm run test:e2e` runs Playwright.
- The browser smoke test can detect a nonblank canvas.

Verification:

- `npm run test`
- `npm run test:e2e`

### Epic 2: Scene Data And Validation

**Story 2.1: Scene Schema v0**

Status: Implemented.

Tasks:

- Create `schemas/scene.schema.json`.
- Define `scene.id`, `entities` and `components`.
- Support `Transform`, `Camera`, `MeshRenderer` and `Name`.
- Add `examples/hello-3d/scenes/start.scene.json`.

Acceptance criteria:

- A valid scene passes validation.
- Unknown components produce actionable diagnostics.
- Duplicate entity ids produce actionable diagnostics.

Verification:

- `npm run engine:check examples/hello-3d`
- Unit tests for the validator.

**Story 2.2: Project Manifest**

Status: Implemented.

Tasks:

- Create `schemas/project.schema.json`.
- Add `examples/hello-3d/project.json`.
- Support `startScene`, `assetRoot`, `render` and `profiles`.

Acceptance criteria:

- The engine can find the start scene through `project.json`.
- Missing `startScene` reports a field-specific diagnostic.

Verification:

- `npm run engine:check examples/hello-3d`

### Epic 2.5: Asset Organization v0

**Story 2.3: Asset Folder Layout And Source Metadata**

Status: Implemented.

Tasks:

- Create the example asset folder layout under `examples/hello-3d/assets/`.
- Add `assets/_sources/asset-sources.json`.
- Add a schema or typed shape for minimal asset source metadata.
- Document source vs runtime asset folders.
- Add placeholder entries for primitive/procedural assets used by `hello-3d`.

Acceptance criteria:

- The example project has a clear place for source assets, runtime assets and source/license metadata.
- Asset metadata can represent generated, CC0 and procedural assets.
- `engine check` can verify that `assetRoot` exists.

Verification:

- `npm run engine:check examples/hello-3d`
- Unit tests for asset metadata validation when available.

**Story 2.4: Asset Reference Validation v0**

Status: Implemented.

Tasks:

- Add validation for asset paths referenced by `MeshRenderer` and material files.
- Report missing assets with file/path/severity/message/suggestion.
- Keep primitive meshes valid without external files.
- Add valid and invalid fixtures.

Acceptance criteria:

- Missing asset references fail `engine check`.
- Primitive meshes do not require runtime asset files.
- Diagnostics are actionable for agents.

Verification:

- CLI validation tests for valid/missing asset references.

### Epic 3: Pragmatic ECS Core

**Story 3.1: Entity And Component Storage**

Status: Implemented.

Tasks:

- Implement `World`.
- Implement `EntityId`.
- Implement component registry.
- Implement `addEntity`, `removeEntity`, `setComponent`, `getComponent`.
- Implement query by component list.

Acceptance criteria:

- A world can be created from a normalized scene.
- Queries return only entities with the requested components.
- Removing an entity removes its components.

Verification:

- Vitest suite for ECS storage.

**Story 3.2: Command Pipeline v0**

Status: Implemented.

Tasks:

- Define `EngineCommand`.
- Implement command queue.
- Support `entity.create`, `entity.delete`, `component.set`, `scene.load`.
- Add command log for debugging.

Acceptance criteria:

- Runtime changes in the sample scene flow through commands.
- Runtime API can expose the command log.

Verification:

- Vitest suite for command application order.

### Epic 4: Renderer Vertical Slice

**Story 4.1: Three.js Render Adapter**

Status: Implemented.

Tasks:

- Create canvas bootstrap.
- Create `ThreeRenderer`.
- Support `Camera`.
- Support `MeshRenderer` for primitive meshes: `box`, `sphere`, `plane`.
- Sync `Transform` to Three.js objects.

Acceptance criteria:

- `examples/hello-3d` shows a cube, floor and camera.
- Canvas is nonblank in a Playwright screenshot.
- Renderer does not store gameplay state.

Verification:

- `npm run dev`
- `npm run test:e2e`

**Story 4.2: Fixed Update Loop**

Tasks:

- Create runtime loop.
- Separate `fixedUpdate` and `render`.
- Add `Time` context.
- Add FPS/debug counters in a dev overlay.

Acceptance criteria:

- Runtime behaves correctly on resize.
- Fixed update can be tested without a browser.

Verification:

- Unit test for fixed timestep accumulator.
- Playwright smoke test.

### Epic 5: Agent-Facing CLI

**Story 5.0: Test Fixtures And Tool Output Contracts**

Status: Implemented.

Tasks:

- Create `tests/fixtures/valid-project`.
- Create `tests/fixtures/invalid-project`.
- Define the shared CLI diagnostic JSON shape.
- Add a fixture README explaining what each fixture is meant to validate.
- Keep fixtures tiny and easy for agents to inspect.

Acceptance criteria:

- Future `engine check` and `engine inspect` tests can reuse the fixtures.
- Diagnostic output has a stable documented shape before CLI implementation grows.
- Fixtures cover at least one valid project and one intentionally invalid project.

Verification:

- Unit tests can load the fixture paths.
- Manual review of fixture documentation.

**Story 5.1: `engine check`**

Status: Implemented.

Tasks:

- Create CLI entrypoint.
- Implement `engine check <projectDir>`.
- Return human-readable output.
- Add `--json` for machine-readable diagnostics.

Acceptance criteria:

- Diagnostics include file, JSON path, severity, message and suggestion.
- Exit code is `0` for valid projects and `1` for invalid projects.

Verification:

- CLI tests with valid/invalid fixtures.

**Story 5.2: `engine inspect` v0**

Status: Implemented.

Tasks:

- Implement `engine inspect <projectDir>`.
- Output normalized scene entities/components.
- Support `--json`.

Acceptance criteria:

- An agent can inspect the start scene without launching a browser.

Verification:

- Snapshot test for inspect output.

## Sprint 1 Demo

Sprint 1 is done when:

- `examples/hello-3d` launches in the browser.
- Scene data comes from JSON.
- Cube and camera are created from components.
- `engine check` catches scene and asset errors.
- Playwright verifies a nonblank canvas.
- ECS and commands have unit tests.

## Next Sprint: Sprint 2 - Agent Loop And Asset Runtime

Goal: make the scene editable by agents, add first gameplay systems, prototype JSON hot reload, add material/shader manifests, add runtime asset loading, and scaffold backend-agnostic persistent-world contracts.

### Epic 6: Gameplay Systems v0

Stories:

- `6.1`: System scheduler.
- `6.2`: Sample movement system.

### Epic 7: Scene Patches And Hot Reload

Stories:

- `7.1`: Scene diff to commands.
- `7.2`: JSON scene hot reload in dev.

### Epic 8: Material And Shader v0

Stories:

- `8.1`: Material manifest.
- `8.2`: Shader manifest spike.

### Epic 8.5: Runtime Asset Loading v0

Stories:

- `8.3`: Asset registry and loader contracts.
- `8.4`: First GLB import path.
- `8.5`: Asset authoring checklist for Beacon World.

### Epic 9: Agent Playtest Loop

Stories:

- `9.1`: Runtime inspect API.
- `9.2`: Robot smoke playtest.

### Epic 10: Backend-Agnostic Persistent World Seam

Stories:

- `10.1`: Protocol schema v0.
- `10.2`: Reference backend skeleton boundary.
- `10.3`: Network/world components in schema.

### Epic 11: Agent Reliability Infrastructure v0

**Story 11.1: Preflight Command**

Tasks:

- Add `npm run preflight`.
- Make it run the current reliable checks in order.
- Document when agents should use it.
- Keep it fast enough for regular local use.

Acceptance criteria:

- `npm run preflight` exists.
- It runs typecheck, unit tests, build and browser smoke tests.
- Documentation points agents to preflight for meaningful implementation tasks.

Verification:

- `npm run preflight`

**Story 11.2: Debug Protocol Draft**

Tasks:

- Create `docs/agent/debug-protocol.md`.
- Define the observe -> diagnose -> repair -> verify -> record loop.
- Define artifact expectations: diagnostics, screenshot, trace, command log, world snapshot, metrics.
- Add a small known-failure taxonomy for AGF: invalid scene, missing asset, blank canvas, shader error, protocol mismatch.

Acceptance criteria:

- Agents have a deterministic debugging checklist before trying random patches.
- The protocol prefers validators/tests over LLM guessing.

Verification:

- Manual review.

**Story 11.3: Template Policy Draft**

Tasks:

- Create `docs/agent/template-policy.md`.
- Define examples as maintained templates, not generated dumps.
- Define when a pattern should become a template.
- List initial template candidates: `hello-3d`, `beacon-world`, `shader-lab`, `persistent-world-client`, reference backends.

Acceptance criteria:

- Future template work has a policy before implementation starts.
- The document explicitly rejects one-prompt generated archives as source of truth.

Verification:

- Manual review.

**Story 11.4: Quality Axes Draft**

Tasks:

- Create `docs/QUALITY_AXES.md`.
- Define build health, runtime health, scene validity, playability, visual readability and world contract health.
- Map each axis to future checks or artifacts.

Acceptance criteria:

- Agents and humans have shared language for "works" beyond build success.
- Each quality axis has at least one planned verification method.

Verification:

- Manual review.

## Sprint 2 Demo

Sprint 2 is done when:

- An agent can edit scene JSON and dev runtime applies a patch.
- There is a movable entity with system logic and unit tests.
- `engine inspect` and runtime inspect API expose world snapshots.
- Material and shader manifests exist.
- Asset registry can load at least one runtime asset path.
- Robot playtest can drive the scene and save screenshot/metrics.
- Backend contracts exist, and any reference server code is isolated under `examples/backends/`.
- `npm run preflight` exists.
- Debug protocol, template policy and quality axes docs exist.
