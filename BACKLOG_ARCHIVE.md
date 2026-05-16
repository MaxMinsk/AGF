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

## Sprint 3 - Sample Game Kickoff And GLB Smoke

Status: Completed and archived.

### Completed Work

- `13.1` Beacon World project scaffold under `examples/beacon-world/` — `project.json`, an initial scene with camera + ground plate, the `source/runtime/_sources` folder layout and a minimal `asset-sources.json`. `engine check` and `engine inspect` work on the new project.
- `13.2` Beacon World first scene populated — salvage drone (sphere) and two counter-spinning beacons (vertical boxes) with PBR material manifests (`beacon.material.json`, `drone.material.json`). No engine code needed; everything composed from primitives + materials + the existing scheduler.
- `14.1` `scripts/build-cube-glb.mjs` writes a 1524-byte binary glTF 2.0 cube without any npm dependency. The committed `examples/hello-3d/assets/runtime/models/cube.glb` is what the runtime now loads instead of the renderer's `box` primitive. `ThreeRenderer` recognises `.glb`/`.gltf` mesh refs, draws a near-zero placeholder while the asset registry resolves the GLB and swaps in the first mesh's geometry. Material binding from Story 8.3 still controls colour/roughness/metalness/emissive on top of the GLB geometry.
- Out-of-story housekeeping: parked a "Remote/CDN asset delivery" roadmap epic in `HIGH_LEVEL_BACKLOG.md` and warned authors in `docs/agent/asset-authoring-checklist.md` not to invent CDN paths in scene references yet.

### Deliverables

- `examples/beacon-world/` (project, scene, materials, asset-sources)
- `examples/hello-3d/assets/runtime/models/cube.glb`
- `scripts/build-cube-glb.mjs`
- Updates to `engine/render/three-renderer.ts` (GLB ref support, `appliedGeometries` map, helper functions)
- `HIGH_LEVEL_BACKLOG.md` (CDN epic) + `docs/agent/asset-authoring-checklist.md` (CDN note)

### Verification

- Sprint-close `npm run preflight`: typecheck clean, 66 Vitest tests across 11 files, vite build OK, 2 Playwright e2e (canvas smoke + agent-loop robot).
- `npm run engine:check -- examples/hello-3d` and `npm run engine:check -- examples/beacon-world` both green.
- `npm run engine:inspect -- examples/beacon-world` lists 5 entities (camera, ground, drone, west/east beacons).
- Screenshot artifact confirms the hero cube renders at the expected size with the cyan-metallic material on top of the GLB geometry.

### Goal Recap

The sprint goal — "Sample Game Kickoff And GLB Smoke" — was met:

- Beacon World is a valid AGF project with a readable first scene.
- The GLB loader path is exercised end-to-end on `hello-3d`, closing the Sprint 2 Story 8.4 follow-up.

### Follow-Ups

- Beacon World visual preview is gated on a project switcher in `src/` or a Vite query-param tweak (Sprint 4 candidate). Today the only way to view Beacon World in the browser is a manual import swap in `src/main.ts`.
- Beacon World gameplay (movement, energy core pickups, repair interactions, hazards) — none of this exists yet; the scene is a static silhouette.
- `npm run build` still does not publish `examples/<project>/assets/` into `dist/`. Production asset serving (Sprint 4 candidate `14.2`) is the next deliverable for the asset epic.
- The hand-rolled GLB has no UVs, no tangents and only flat shading; it is enough for smoke testing but will not survive a real material with textures. A real art pipeline + real `.glb`s for Beacon World is later work.

## Sprint 4 - Browser Polish And Gameplay v0

Status: Completed and archived.

### Completed Work

- `18.1` URL-driven project switcher: `?project=<id>` selects between `hello-3d` (default) and `beacon-world`. `createApp` receives `projectId` so the `AssetRegistry` baseUrl resolves to `examples/<projectId>/assets/`. Status panel renders the project name, the current id, and a switcher chip to the alternative project. Scene HMR stays alive on the active project through static `import.meta.hot.accept` paths.
- `14.2` Production asset serving: tiny zero-dep Vite plugin `agf-copy-example-assets` copies `examples/<id>/assets/` → `dist/examples/<id>/assets/` on `closeBundle`, skipping `.gitkeep`. Verified by `vite preview` returning 200 OK on the material manifests and on the 1524-byte `cube.glb`.
- `13.3` Beacon World gameplay v0: new `PlayerControlled` component in the scene schema, `createPlayerInputSystem` in `engine/runtime/` attaches keyboard listeners, normalises diagonal input and updates `Transform.position` on the XZ plane each fixed step. WASD and arrow keys are interchangeable. `examples/beacon-world` drone is now movable; a Playwright test confirms `KeyD` advances the drone along +X.

### Deliverables

- `src/main.ts`, `src/app.ts` (project switcher + status-panel chip + asset-registry baseUrl)
- `vite.config.ts` (`agf-copy-example-assets` plugin)
- `engine/runtime/player-input-system.ts`
- `schemas/scene.schema.json` (`PlayerControlled`)
- `engine/tools/check/project-check.ts` (suggested component list update)
- `examples/beacon-world/scenes/start.scene.json` (`PlayerControlled` on the drone)
- `tests/unit/player-input-system.test.ts`
- `tests/e2e/project-switcher.spec.ts` (3 tests: switcher, default, KeyD movement)

### Verification

- Sprint-close `npm run preflight`: typecheck clean, 72 Vitest tests across 12 files, vite build OK, 5 Playwright e2e tests (canvas + agent loop + switcher × 2 + KeyD movement).
- `vite preview` serves `examples/<id>/assets/runtime/...` with 200 OK and the expected bytes.
- `engine check` on both `hello-3d` and `beacon-world` stays green.

### Goal Recap

The sprint goal — "Browser Polish And Gameplay v0" — was met:

- Beacon World is reachable in the browser via `?project=beacon-world` without swapping imports.
- `npm run build` produces a static bundle in which the runtime asset fetches resolve.
- Beacon World's drone is the first interactive entity in the engine; the rest of the gameplay loop (pickups, repairs, hazards) can build on top of `PlayerControlled` + `Spin` + the existing systems.

### Follow-Ups

- A new player input fall-back path for touch/mobile is not in scope; current input is WASD/arrow only.
- The dev FPS overlay and the `PlayerInputSystem` both register on `window`. Two runtimes on the same page would conflict; we have only one live runtime at a time, but if multi-instance ever appears, the listener attachment needs to be scoped.
- Beacon World still has no pickups, no repair state and no hazards — gameplay v0 is movement-only. A `13.4`/`13.5` pair (Pickup component + carry/deposit interaction) is the next natural step for the Beacon World epic.
- Bundle is still ~605 KB / 154 KB gzip. Code-split for Three.js when bundle size becomes a real constraint.

## Sprint 5 - Backend Contracts

Status: Completed and archived.

### Completed Work

- `10.1` `schemas/protocol.schema.json` — discriminated-union JSON Schema for client/server messages. Four v0 kinds: `world.snapshot`, `player.join`, `player.leave`, `intent.move`. Envelope-level `sequence` (monotonic integer) is optional. ADR-0007 records the choice.
- `10.2` `examples/backends/node-world-server/` runnable skeleton — loads the protocol schema, compiles it with AJV and validates four sample messages on boot. New `npm run backend:node` script. `tsconfig.json` extended to typecheck backend code. `examples/backends/README.md` documents the engine ↔ backend boundary.
- `10.3` `Networked` (`authority: server | client`, optional `channel`) and `Presence` (`playerId` matching the protocol player-id pattern) components added to `schemas/scene.schema.json`. Beacon World drone gets `Presence + Networked { client }`; both beacons get `Networked { server }`. A new fixture covers invalid authority and a malformed playerId.
- Hot fix: scheduler now exposes a `runFrame(context)` phase alongside `runFixedStep`, so input-style systems can run at the real render-frame delta. `PlayerInputSystem` moved to `frameUpdate`; SpinSystem stays on `fixedUpdate`. Drone movement is visibly smooth now.

### Deliverables

- `schemas/protocol.schema.json`, `docs/adr/0007-protocol-schema-v0.md`
- `examples/backends/README.md`, `examples/backends/node-world-server/{README.md,src/index.ts}`
- `engine/core/systems/{types.ts,scheduler.ts}` (new `runFrame` phase + `frameUpdate` hook)
- `engine/runtime/player-input-system.ts` (renamed hook to `frameUpdate`)
- `engine/runtime/start.ts` (frame-phase invocation after the fixed loop)
- `schemas/scene.schema.json` (Networked + Presence)
- `engine/tools/check/project-check.ts` (suggested component list update)
- `examples/beacon-world/scenes/start.scene.json` (Networked/Presence usage)
- `tests/fixtures/invalid-network-component/`
- `tests/unit/{protocol-schema,system-scheduler,player-input-system,project-check}.test.ts` updates

### Verification

- Sprint-close `npm run preflight`: typecheck clean, 84 Vitest tests across 13 files, vite build OK, 5 Playwright e2e tests.
- `npm run backend:node` prints `valid` for all four sample messages and exits 0.
- `npm run engine:check -- examples/beacon-world` green; `engine inspect` shows `Networked` and `Presence` on the expected entities.
- Manual: hold KeyD in the browser at `?project=beacon-world` — drone slides smoothly across the ground plate.

### Goal Recap

The sprint goal — "Backend Contracts" — was met:

- A backend-agnostic wire schema exists and is enforced by AJV at every entry point.
- A reference Node backend skeleton runs against the schema and demonstrates the boundary.
- Scene data carries enough metadata (`Networked`, `Presence`) for a future network adapter to act on, without forcing it into the engine yet.

### Follow-Ups

- The Node skeleton has no transport yet. Picking SignalR for the C# reference or raw WebSockets for the Node skeleton is the next deliverable when an actual interactive client wants to connect.
- The C#/.NET reference backend is still unstaffed. ADR-0001 and ADR-0006 cover the intent, but no folder exists under `examples/backends/dotnet-world-server/` yet.
- `Networked.channel` is declared in the schema but not consumed anywhere. Decide how the runtime maps `channel` to network adapters when the first real transport lands.
- `frameUpdate` is now a public API surface but is used by exactly one system. Document the fixed-vs-frame split in `docs/agent/` or `docs/ARCHITECTURE.md` once the third system on either phase appears.

## Sprint 6 - Beacon World Gameplay Loop

Status: Completed and archived.

### Completed Work

- `13.4` Pickup entities — `Pickup` component lives in `examples/beacon-world/schemas/scene-extensions.schema.json`. Two energy cores (`core.north`, `core.south`) added to the scene as emissive-green sphere pickups with `Networked { server }`.
- `13.5` Carry / deposit interaction — `Carrier` on the drone, `Repairable` on both beacons (`accepts: "energy-core"`, `repairedColor: "#4af0a8"`). `examples/beacon-world/src/systems/pickup-system.ts` runs on the frame phase: picks up the nearest in-range pickup, makes it follow the drone, deposits on a matching unrepaired beacon (drops the material ref so the inline repaired color shows immediately, removes the carried entity, clears `Carrier.carrying`). Registered in `src/app.ts` only when `projectId === "beacon-world"`. 6 unit tests + 1 Playwright e2e that teleports the drone and asserts the full loop.
- `F.1` Architectural fix — `Pickup`/`Carrier`/`Repairable` were mistakenly added to the root `schemas/scene.schema.json` and `engine/tools/check/project-check.ts` componentNames in the first pass. Refactored so `engine check` deep-merges `<projectDir>/schemas/scene-extensions.schema.json` with the base scene schema before validation, compiles per-project and computes the suggestion list as `[...builtIn, ...extension]`. `pickup-system.ts` moved to `examples/beacon-world/src/systems/`. `tsconfig.json` + `vitest.config.ts` now include `examples/*/src` and `examples/*/tests`. ADR-0008 captures the rule.

### Deliverables

- `examples/beacon-world/schemas/scene-extensions.schema.json`
- `examples/beacon-world/src/systems/pickup-system.ts`
- `examples/beacon-world/tests/unit/pickup-system.test.ts`
- `examples/beacon-world/scenes/start.scene.json` updates (cores + `Carrier`/`Repairable`)
- `engine/tools/check/project-check.ts` (scene-extensions merge, per-project compile)
- `src/app.ts` (conditional registration of project systems)
- `tsconfig.json`, `vitest.config.ts` (include `examples/*/src`, `examples/*/tests`)
- `tests/e2e/beacon-world-gameplay.spec.ts`
- `docs/adr/0008-project-scene-extensions.md`

### Verification

- Sprint-close `npm run preflight`: typecheck clean, 90 Vitest tests across 14 files, vite build OK, 6 Playwright e2e tests (canvas + agent loop + switcher × 2 + KeyD movement + gameplay loop).
- `npm run engine:check -- examples/beacon-world` and `... hello-3d` both green.
- Manual: at `?project=beacon-world`, the drone visibly picks up a core and turns the closest beacon green.

### Goal Recap

The sprint goal — "Beacon World Gameplay Loop" — was met:

- The first interactive gameplay loop (pick up + deposit + visible state change) works end-to-end.
- The architectural mistake of leaking project-specific components into the engine is fixed and documented.

### Follow-Ups

- Beacon World has no respawn / decay / hazards yet — `world keeps changing` from the sample-game pitch needs a `13.6` follow-up.
- A real material swap on repair (rather than dropping the ref and using inline color) needs the renderer to clean up roughness/metalness/emissive when a material ref disappears. Today the old values persist on the `MeshStandardMaterial` instance.
- The Beacon World scene now has 7 entities. The current scheduler walks all of them every frame; performance is still fine, but a Query helper that caches per-archetype lookups will become useful when scenes get larger.
- The C#/.NET reference skeleton from the Sprint 5 follow-up list is still unstaffed.

## Sprint 7 - Agent Loop + World Evolution

Status: Completed and archived.

### Completed Work

- `16.1` Material file hot reload — `AssetRegistry.invalidate(ref)` drops cached loads; `ThreeRenderer.forgetAssetBinding(ref)` clears entity → ref bindings for materials and meshes; `RuntimeHandle.invalidateAsset(ref)` + `AppHandle.reloadAsset(ref)` glue them. A dev-only Vite plugin `agf-asset-hot-reload` watches `examples/<projectId>/assets/**` and pushes a `agf:asset-changed` HMR event with `{ projectId, ref }`; `src/main.ts` listens, scopes to the active project and calls `app.reloadAsset(ref)`. Editing a material file in dev now reflects on the next render frame without a page reload.
- `13.6` Beacon decay + core respawn — extended the Beacon World scene-extensions schema with runtime fields (`Pickup.{originalPosition, respawnAfter, consumed, respawnIn}`, `Repairable.{decayAfter, decayIn, originalMaterial}`). `pickup-system.frameUpdate` now ticks both timers, stashes the original material at repair, and either deletes or "parks" the consumed pickup underground depending on whether respawn fields are present. Beacon World scene gives both beacons `decayAfter: 6` and both cores `respawnAfter: 4` + `originalPosition`.
- Dropped per `CLAUDE.md` "agent-first" rule: `15.1` In-page inspector overlay and `17.1` Scene editor command palette — human-only GUI tooling.

### Deliverables

- `engine/runtime/asset-registry.ts` (`invalidate`)
- `engine/render/three-renderer.ts` (`forgetAssetBinding`)
- `engine/runtime/start.ts` (`RuntimeHandle.invalidateAsset`)
- `src/app.ts` (`AppHandle.reloadAsset`)
- `vite.config.ts` (`agf-asset-hot-reload` dev plugin)
- `src/main.ts` (HMR listener)
- `examples/beacon-world/schemas/scene-extensions.schema.json` (runtime/state fields on Pickup and Repairable)
- `examples/beacon-world/src/systems/pickup-system.ts` (respawn + decay ticks, deposit stash, consumed-skip in carrier search)
- `examples/beacon-world/scenes/start.scene.json` (`decayAfter` on beacons, `respawnAfter` + `originalPosition` on cores)
- `examples/beacon-world/tests/unit/pickup-system.test.ts` (+3 cases)
- `tests/unit/asset-registry.test.ts` (+1 case)
- `CLAUDE.md` updated with the agent-first non-negotiable rule

### Verification

- Sprint-close `npm run preflight`: typecheck clean, 94 Vitest tests across 14 files, vite build OK, 6 Playwright e2e tests.
- `npm run engine:check -- examples/beacon-world` green with the extended schema.
- Manual: editing `examples/beacon-world/assets/runtime/materials/beacon.material.json` in dev triggers `[agf] hot-reloaded asset ...` and changes the beacon visibly without reload.

### Goal Recap

The sprint goal — "Agent Loop + World Evolution" — was met:

- The agent's edit → run cycle is one step tighter: edit any project asset file and see the result on the next frame.
- Beacon World now demonstrably "keeps changing" — repaired beacons decay, picked-up cores respawn. The sample-game pitch "the world drifts whether or not anyone is online" is closer.
- The agent-first priority is now codified in `CLAUDE.md` so it survives between sessions.

### Follow-Ups

- Decay UX has zero anticipation; an agent reading a snapshot sees `decayIn` ticking but a human looking at the scene gets no warning before revert. A small visual cue (e.g. faded color toward the end of the timer) would help, but it's deliberately deferred — agent‑first.
- The dev-only HMR plugin watches every file under `examples/<id>/assets/**`. Today the only consumer of the event is the material renderer; once GLB or texture HMR appears, the plugin can stay as-is but the renderer's `forgetAssetBinding` should already cover geometry too (it does, but is untested for GLB HMR).
- Beacon World still has no hazards (`13.7`) and no real authored `.glb` for drone/beacons (`14.3`).
- The agent does not yet have a structured way to script multi-step playtests (e.g. "pick up + deposit + wait for respawn + repeat"). Promote a "scenario format" story when this becomes a bottleneck.

## Sprint 8 - Agent Loop Tools

Status: Completed and archived.

### Completed Work

- `9.4` Inspect filters — `engine inspect` accepts `--component <Name>` (repeatable), `--query A,B` (AND of components) and `--entity <id>` (repeatable). `InspectResult` gains `matchedEntityCount` + an optional `filter` summary so the JSON output is unambiguous.
- `9.5` Snapshot diff — `engine inspect --diff <prev.json> <next.json>` reports added/removed entities and added/removed/changed components per entity. `diffSnapshots` is a pure function with seven unit tests; CLI exposes `formatDiff` for humans and `--json` for tools.
- `9.3` Scripted playtest scenarios — new `schemas/playtest.schema.json` (`waitStep`, `applyCommandsStep`, `expectComponentStep`, `expectEntityMissingStep`). `engine check` validates any `<projectDir>/playtests/*.playtest.json`. New Playwright runner `tests/e2e/playtest-runner.spec.ts` dynamically discovers scenarios under `examples/*/playtests/` and runs each as a separate test. First scenario lands in `examples/beacon-world/playtests/pickup-cycle.playtest.json`.
- Roadmap addition: `docs/proposals/procedural-character-generator.md` parks the future Procedural Character Generator tool (node-graph-driven rigged-mesh generator emitting Mixamo-compatible characters), tracked in its own proposal-level backlog.

### Deliverables

- `engine/tools/inspect/project-inspect.ts` (filters, matchedEntityCount, filter summary)
- `engine/tools/inspect/snapshot-diff.ts` (new)
- `engine/tools/cli.ts` (rewritten arg parser with `--component`, `--query`, `--entity`, `--diff`)
- `engine/tools/check/project-check.ts` (`playtest` static schema, `validatePlaytestScenarios`)
- `schemas/playtest.schema.json` (new)
- `examples/beacon-world/playtests/pickup-cycle.playtest.json` (new)
- `tests/e2e/playtest-runner.spec.ts` (new, dynamic discovery)
- `tests/unit/snapshot-diff.test.ts` (new, 7 cases)
- `docs/proposals/procedural-character-generator.md` (new, parked proposal)

### Verification

- Sprint-close `npm run preflight`: typecheck clean, 101 Vitest tests across 15 files, vite build OK, 7 Playwright e2e tests (canvas + agent loop + switcher × 2 + KeyD movement + Beacon gameplay + scripted playtest).
- `engine check examples/beacon-world` validates `playtests/pickup-cycle.playtest.json` against the new schema.
- `engine inspect examples/beacon-world --component Pickup` returns the two energy cores; `--query Carrier,Transform` returns the drone.

### Goal Recap

The sprint goal — "Agent Loop Tools" — was met:

- The agent can ask narrow questions of a project (`engine inspect --component ...` / `--query ...`).
- The agent can compare two world states without reading the whole snapshot (`engine inspect --diff ...`).
- The agent can script multi-step playtests as data, not Playwright code, and the runner picks them up automatically.

### Follow-Ups

- Playtest scenarios can't yet assert pixel-level rendering. Deferred.
- The `expectComponent` match is shallow (top-level keys only). Nested deep-equal would generalise, but the shapes used so far don't need it.
- `engine inspect --diff` reads two snapshots but doesn't yet record them via a CLI flow. A `--save <path>` shortcut would be nice.
- Hot-reload of `playtest.json` files isn't wired — editing a scenario in dev currently needs a manual `npm run test:e2e` invocation.
- Procedural Character Generator is parked; pick it up after Beacon World gameplay v0 stabilises.

## Sprint 9 - Asset Polish

Status: Completed and archived.

### Completed Work

- `14.3` Real authored `.glb` for Beacon World drone and beacons — `scripts/lib/write-glb.mjs` factors the GLB writer out of `scripts/build-cube-glb.mjs` so future procedural meshes reuse it. `scripts/build-drone-glb.mjs` emits an octahedron with face-aligned flat normals (1524 bytes) for the salvage drone; `scripts/build-beacon-glb.mjs` emits a hexagonal prism (1992 bytes) for the beacons. Scene swaps `mesh: "sphere"` → `mesh: "runtime/models/drone.glb"` on the drone and `mesh: "box"` → `mesh: "runtime/models/beacon.glb"` on both beacons. `asset-sources.json` gains entries for both models.
- `16.2` Asset HMR for GLB — confirmed end-to-end on the new drone model. The Sprint 7 plumbing already covered GLB (`forgetAssetBinding` clears both materials and geometries, `AssetRegistry.invalidate` drops the cached load). New Playwright spec `tests/e2e/glb-hot-reload.spec.ts` listens for the `[agf] hot-reloaded asset runtime/models/drone.glb` console message and triggers it by rewriting the file with its own bytes.

### Deliverables

- `scripts/lib/write-glb.mjs` (new helper)
- `scripts/build-drone-glb.mjs`, `scripts/build-beacon-glb.mjs` (new generators)
- `examples/beacon-world/assets/runtime/models/{drone,beacon}.glb` (new binaries, regeneratable from the scripts)
- `examples/beacon-world/scenes/start.scene.json` (mesh refs)
- `examples/beacon-world/assets/_sources/asset-sources.json` (entries for both meshes)
- `tests/e2e/glb-hot-reload.spec.ts` (new e2e for HMR path)

### Verification

- Sprint-close `npm run preflight`: typecheck clean, 101 Vitest tests across 15 files, vite build OK, 8 Playwright e2e tests (added GLB hot-reload test).
- `engine check examples/beacon-world` green with the new mesh refs.
- Manual: `?project=beacon-world` shows a faceted octahedron drone and faceted hex-prism beacons; HMR test confirms the asset reload path fires when the GLB file changes on disk.

### Goal Recap

The sprint goal — "Asset Polish" — was met:

- Beacon World's drone and beacons are sourced from real `.glb` files generated and reviewable through the procedural scripts, not from renderer primitives.
- The asset HMR plumbing is verified for GLBs end-to-end; an agent editing a model on disk gets the reload event without a page reload.

### Follow-Ups

- The GLB meshes are still procedurally generated; an authored model from Blender / Meshy goes through the same path but needs an art workflow.
- The GLB HMR test relies on a console-message contract (`hot-reloaded asset <ref>`). If the runtime log format changes, the test silently waits for nothing until timeout. Consider adding a structured HMR API surface (e.g. `window.__agf.lastReloadedAsset`) when the second consumer of the signal appears.
- Sprint 9 was small (two stories). Asset polish proceeds in lockstep with Beacon World gameplay; `13.7` hazards remain the next gameplay step.

## Sprint 10 - Beacon World Hazards

Status: Completed and archived.

### Completed Work

- `13.7` Hazards v0 — new `Hazard` component (`minRadius`, `maxRadius`, `period`) in the Beacon World scene-extensions schema. `examples/beacon-world/src/systems/hazard-system.ts` pulses `Transform.scale` along a sine cycle and drops any Carrier inside the current radius into the existing consumed-pickup respawn flow. `src/app.ts` registers the system only for beacon-world. Scene gains `hazard.center` between the drone and the west cluster. 4 unit tests + 1 playtest scenario (`hazard-drop.playtest.json`) cover the behaviour.
- Procedural Character Generator proposal updated: JSON is the primary surface, any UI is secondary and may not become a side-channel. Stories TBD list reordered.

### Deliverables

- `examples/beacon-world/schemas/scene-extensions.schema.json` (`Hazard`)
- `examples/beacon-world/src/systems/hazard-system.ts`
- `examples/beacon-world/scenes/start.scene.json` (`hazard.center`)
- `examples/beacon-world/tests/unit/hazard-system.test.ts`
- `examples/beacon-world/playtests/hazard-drop.playtest.json`
- `src/app.ts` (system registration)
- `docs/proposals/procedural-character-generator.md` (JSON-first reframe)

### Verification

- Sprint-close `npm run preflight`: typecheck clean, 105 Vitest tests across 16 files, vite build OK, 9 Playwright e2e tests (added hazard-drop scenario).
- `engine check examples/beacon-world` green.

### Goal Recap

The sprint goal — "Beacon World Hazards" — was met:

- A pulsing hazard now sits between the drone and one of the cores; the carrier loses its core if it enters the radius.
- All hazard logic is project-local; the engine learns nothing new.
- The data-driven playtest format scales — second scenario runs alongside the first automatically.

### Follow-Ups

- Hazard punishment is binary (lose the core or don't); a `13.8` "damage state" story would let hazards do something richer.
- Multiple hazards in the same scene work but were not exercised. Add a second hazard when level design starts.
- The hazard visual is just a scaled sphere with inline colour. Replacing it with an authored `.glb` would go through Sprint 9's path; deliberately skipped to keep this sprint short.
- `despawnOrRemove` is implemented twice — once in pickup-system, once in hazard-system. Lift into a shared module under `examples/beacon-world/src/systems/lib/` when a third caller appears.

## Sprint 11 - Agent Loop Polish

Status: Completed and archived.

### Completed Work

- `9.6` `engine inspect --save <path>` — both `check`, `inspect` and `--diff` now write the JSON payload to a file (parent dirs created). Stdout stays clean; stderr logs only the destination.
- `9.9` Structured HMR signal on `window.__agf` — DEV builds expose `lastReloadedAsset?: string` and a monotonic `reloadCount`. `glb-hot-reload.spec.ts` no longer depends on the console log format.
- `9.8` Deep-equal `match` in `expectComponent` — playtest runner now uses `expect(component).toMatchObject(step.match)`. Nested matchers work without changing the scenario schema.
- `9.7` Playtest scenario hot reload — `scripts/watch-playtests.mjs` + `npm run playtest:watch`. Watches `examples/*/playtests/*.playtest.json`; on change spawns `npx playwright test ... --grep <scenario.id>`. Reuses an already-running `npm run dev`.

### Deliverables

- `engine/tools/cli.ts` (`--save <path>`)
- `src/main.ts` (`window.__agf.lastReloadedAsset`, `reloadCount`)
- `tests/e2e/glb-hot-reload.spec.ts` (structured signal)
- `tests/e2e/playtest-runner.spec.ts` (deep-equal match)
- `scripts/watch-playtests.mjs`
- `package.json` (`playtest:watch`)

### Verification

- Sprint-close `npm run preflight`: typecheck clean, 105 Vitest tests across 16 files, vite build OK, 9 Playwright e2e tests.
- `engine inspect examples/beacon-world --component Pickup --save /tmp/agf-snapshot.json` writes the file with no stdout pollution.

### Goal Recap

The sprint goal — "Agent Loop Polish" — was met:

- Snapshot capture is one CLI call.
- The asset HMR contract is structured data on `window.__agf`, not a log string.
- Playtest scenarios accept full nested matchers.
- A focused watcher gives the agent fast feedback while iterating on a `.playtest.json`.

### Follow-Ups

- `playtest:watch` spawns a fresh Playwright per change; add debounce when rapid edits prove costly.
- `engine check --save` is wired but unused; surface in CI docs once diagnostics archiving lands.
- The Sprint 11 surface is undocumented for agents. A small `docs/agent/` page (`D.1` in Sprint 12 candidates) covers it.

## Sprint 12 - Beacon World Damage + Multi-Hazard

Status: Completed and archived.

### Completed Work

- `13.8` Damage / lives state for the drone — three new project-local components in the Beacon World scene-extensions schema: `Health { current, max }`, `Invulnerable { until }` and `Respawnable { position }`. `Hazard` gains optional `damage` (default 1) and `invulnerabilitySeconds` (default 1). The hazard-system now iterates over every entity with a `Transform`, applies damage if the entity has `Health`, drops the carried pickup, sets `Invulnerable` and respawns to `Respawnable.position` when `Health.current` hits zero. Invulnerable entities are skipped until `until` is in the past.
- `13.9` Multi-hazard placement + tuning — second hazard `hazard.east` placed near the east beacon/core route, faster radius (0.6→1.3) and longer period (4.5s) so the two pulses give the player a real route decision. Both hazards renamed (`Hazard Pulse (west route)` / `Hazard Pulse (east route)`).
- New playtest scenario `hazard-damage.playtest.json` reproduces a single hit and asserts `Health.current` drops from 3 to 2 and `Invulnerable` is set.

### Deliverables

- `examples/beacon-world/schemas/scene-extensions.schema.json` (`Health`, `Invulnerable`, `Respawnable`; `Hazard.damage`, `Hazard.invulnerabilitySeconds`)
- `examples/beacon-world/src/systems/hazard-system.ts` (damage, invulnerability, respawn)
- `examples/beacon-world/scenes/start.scene.json` (`Health`/`Respawnable` on drone, `hazard.east` entity, tuning)
- `examples/beacon-world/tests/unit/hazard-system.test.ts` (+4 cases)
- `examples/beacon-world/playtests/hazard-damage.playtest.json`

### Verification

- Sprint-close `npm run preflight`: typecheck clean, 109 Vitest tests across 16 files, vite build OK, 10 Playwright e2e tests (added `hazard-damage` scenario).
- `engine check examples/beacon-world` green; `engine inspect` lists 9 entities (drone now carries `Health`, `Respawnable` alongside `Carrier`/`Networked`/`Presence`).

### Goal Recap

The sprint goal — "Beacon World Damage + Multi-Hazard" — was met:

- Hazards damage the carrier instead of only dropping the carried core.
- Carrier survives three hits; the fourth respawns at the drone's `Respawnable.position` with full health.
- Two hazards in different positions, different periods and different radii now exercise the multi-hazard path; the system handles them in the same query without code change.

### Follow-Ups

- No visual feedback for invulnerability (drone colour blink, hazard ring opacity change). Skipped per agent-first priority.
- `Respawnable.position` is hard-coded in scene data; a future story could derive it from a scene-level "spawn point" entity.
- Death currently teleports — no animation, no audio. Both later.
- The hazard logic still iterates every entity with a `Transform` per frame; fine at 9 entities, will need a tighter query when scenes grow.

## Sprint 13 - Hazard Mesh + Agent Iteration Docs + Beacon HUD

Status: Completed and archived.

### Completed Work

- `14.4` Hazard `.glb` — `scripts/build-hazard-glb.mjs` emits a 2.9 KB stellated-octahedron mesh through the shared `scripts/lib/write-glb.mjs` writer. Both `hazard.center` and `hazard.east` swap their primitive sphere for `mesh: "runtime/models/hazard.glb"` while keeping their inline colours, so the mesh is shared and intent stays in the scene. `asset-sources.json` declares the new runtime file.
- `D.1` Agent iteration docs — `docs/agent/iteration-loop.md` walks the edit → inspect → run loop: `engine inspect` filters, `--save`, `--diff`; `window.__agf` `snapshot`/`applyCommands`/`lastReloadedAsset`/`reloadCount`; playtest scenarios and the runner; `playtest:watch`. Linked from `docs/agent/claude-code.md`.
- `13.10` Health / Invulnerable HUD — `examples/beacon-world/src/ui/health-hud.ts` polls `runtime.snapshot()` every 100 ms and renders HP cells plus an INVULN badge. `src/app.ts` mounts the HUD only when `projectId === "beacon-world"` and disposes it on `AppHandle.dispose`. DOM stays secondary; the canonical state is still the entity's `Health`/`Invulnerable` components reachable through `window.__agf.snapshot()`.
- Recorded `feedback-sprint-size` memory: default sprint is 4–6 stories; grow undersized sprints by pulling adjacent candidates.

### Deliverables

- `scripts/build-hazard-glb.mjs`, `examples/beacon-world/assets/runtime/models/hazard.glb`
- `examples/beacon-world/assets/_sources/asset-sources.json` (`beacon-world.hazard-mesh`)
- `docs/agent/iteration-loop.md`, `docs/agent/claude-code.md` link
- `examples/beacon-world/src/ui/health-hud.ts`, `src/app.ts` mount/dispose
- `memory/feedback-sprint-size.md`

### Verification

- Sprint-close `npm run preflight`: typecheck clean, 109 unit tests across 16 files, vite build OK, 10 Playwright e2e tests.
- `engine check examples/beacon-world` green; HUD visible in the dev server only for `beacon-world`.

### Goal Recap

The sprint goal — a slightly larger Sprint 13 honouring the new `feedback-sprint-size` rule — was met:

- The hazard authoring path matches the beacon path: shared procedural script, shared writer, shared `asset-sources` shape.
- A human-readable iteration doc explains the agent loop end-to-end so a fresh agent does not have to rediscover it from code.
- The Beacon HUD demonstrates the agent-first pattern: DOM is one read-only view of the snapshot, never the source of truth.

### Follow-Ups

- HUD does not yet show any derived world signal (repaired beacon count, score). Picked up in Sprint 14 (`13.11`).
- Hazard mesh is uniform across both entities. Per-hazard variation deferred.
- Sound pings (`13.12`) still pending.

## Sprint 14 - Asset Polish + World Signal + Smallest-Pivot Query

Status: Completed and archived.

### Completed Work

- `14.5` Core `.glb` — `scripts/build-core-glb.mjs` emits a 1.7 KB flat-shaded pentagonal-bipyramid mesh through the shared `scripts/lib/write-glb.mjs` writer. Both `core.north` and `core.south` swap their primitive sphere for `mesh: "runtime/models/core.glb"` and keep their inline `color`, so the mesh is shared but the scene still controls intent. `asset-sources.json` declares the new runtime file.
- `14.6` Material variants — new `examples/beacon-world/assets/runtime/materials/beacon-repaired.material.json` provides the repaired-beacon look (teal `#4af0a8`, emissive, lower roughness, higher metalness). `Repairable` schema gains optional `repairedMaterial` and runtime-only `originalColor`. `pickup-system.ts` deposit/decay refactored to swap the `MeshRenderer.material` ref when `repairedMaterial` is present and restore the original material (or inline colour) on decay; the legacy `repairedColor` path remains as a fallback for color-only scenes. New unit tests cover the material-swap path and the colour-only fallback.
- `13.11` Derived world signal in HUD — `health-hud.ts` now also counts repaired vs total `Repairable` entities from the snapshot and renders a `SIG repaired/total` line with filled cells. No new component; the HUD reads pure derived state through `runtime.snapshot()`, matching the agent-first principle.
- `E.1` Smallest-pivot query — `engine/core/ecs/world.ts` `query` now picks the component with the fewest entities as the pivot instead of always using the first argument. Missing-store short-circuit covered. New `tests/unit/ecs-world.test.ts` cases prove a 100-entity / 3-hazard scene reaches the matches through the small store.

### Deliverables

- `scripts/build-core-glb.mjs`, `examples/beacon-world/assets/runtime/models/core.glb`
- `examples/beacon-world/assets/runtime/materials/beacon-repaired.material.json`
- `examples/beacon-world/assets/_sources/asset-sources.json` (`beacon-world.core-mesh`)
- `examples/beacon-world/schemas/scene-extensions.schema.json` (`repairedMaterial`, `originalColor`)
- `examples/beacon-world/scenes/start.scene.json` (cores → `core.glb`, beacons → `repairedMaterial`)
- `examples/beacon-world/src/systems/pickup-system.ts` (material swap + colour fallback)
- `examples/beacon-world/src/ui/health-hud.ts` (`SIG` line)
- `engine/core/ecs/world.ts` (smallest-pivot query)
- `tests/unit/ecs-world.test.ts`, `examples/beacon-world/tests/unit/pickup-system.test.ts`

### Verification

- `engine check examples/beacon-world` green.
- Sprint-close `npm run preflight`: typecheck clean, 113 Vitest tests across 16 files, vite build OK, 10 Playwright e2e tests (including the updated `beacon-world-gameplay` material-swap assertions).

### Goal Recap

The sprint goal — asset polish stretched per the `feedback-sprint-size` rule — was met:

- Both moving prop families (cores, beacons) now use authored `.glb` + named materials; the procedural-primitive era is over for the dogfood scene.
- The repair loop swaps material refs instead of dropping them, so HMR on `beacon-repaired.material.json` will live-update repaired beacons.
- The HUD now surfaces a real-time world signal derived from the snapshot, giving the agent a one-glance check that the gameplay loop is producing progress.
- ECS queries no longer scale with the first-argument store; gameplay code can pass the broadest filter first without paying for it.

### Follow-Ups

- Per-core or per-beacon material variants (e.g. "north" vs "south") would let scenes distinguish entities by material alone. Deferred — no gameplay call for it yet.
- `13.12` Sound pings still pending.
- `10.4`/`10.5`/`10.6` backend follow-ups still pending.

## Sprint 15 - Backend Round-Trip + World Signal + Cached Queries

Status: Completed and archived.

### Completed Work

- `10.4` WebSocket transport for `node-world-server` — new `examples/backends/node-world-server/src/transport-ws.ts` opens a `ws://` listener (port 8787 by default, `PORT=` env override), validates every inbound frame against `schemas/protocol.schema.json`, routes `player.join`/`player.leave`/`intent.move` to a new `ServerWorld`, and broadcasts a `world.snapshot` at `tickHz` (default 20) to every connected client. `src/index.ts` gains a `--serve` mode (kept the smoke mode as default). New `backend:node:serve` script. Authoritative state is in `examples/backends/node-world-server/src/world.ts` — `Map<playerId, PlayerEntity>` with sequence-aware intent ingestion. New `tests/unit/node-world-server.test.ts` spins the transport in-process and proves the round-trip via the real `ws` client.
- `10.6` Client network adapter — new `engine/runtime/network/ws-network-adapter.ts` opens a WS, sends `player.join` on open, applies every inbound `world.snapshot` via `applyCommands` (entity.create for new server-owned ids, component.set for updates, entity.delete for ids that disappeared from the snapshot). Outbound `sendIntent([x, z])` is exposed for the host app. Locally-known entities are skipped on `entity.create` so the adapter never collides with the local scene. `src/app.ts` accepts an `AppOptions { serverUrl, playerId }` and `src/main.ts` reads `?server=` + `?playerId=` from the URL to enable it. New `tests/unit/ws-network-adapter.test.ts` runs the full server↔adapter↔client-`World` loop and proves: inbound snapshot creates `player.alpha`, outbound `sendIntent([1, 0])` moves it on the server, and `dispose()` removes only server-owned entities.
- `13.13` Scoring / WorldSignal — project-local `WorldSignal { health, target, tau }` component on a new singleton `world.signal` entity in the Beacon World scene. New `examples/beacon-world/src/systems/world-signal-system.ts` runs each frame: computes the raw repaired-ratio over `Repairable` entities and EMA-smooths it into `health`. HUD prints `SIG repaired/total (XX%)`. Four new unit tests cover ramp-up, decay and the no-singleton no-op branch. Pure derivation — agents observe via `window.__agf.snapshot()`.
- `E.2` Cached query handles — `World` gains a `revision` counter bumped on entity / component add+remove (NOT on data overwrites) and a new `createQuery(componentNames)` API that returns a `QueryHandle` memoising its result until the revision changes. Two new unit tests prove the handle returns the same array reference across data-only writes and invalidates on structural change.

### Deliverables

- `examples/backends/node-world-server/src/world.ts`
- `examples/backends/node-world-server/src/transport-ws.ts`
- `examples/backends/node-world-server/src/index.ts` (+ `--serve` mode)
- `package.json` (`ws`, `@types/ws`, `backend:node:serve` script)
- `engine/runtime/network/ws-network-adapter.ts`
- `src/app.ts` (`AppOptions`, network handle on `AppHandle`), `src/main.ts` (URL `?server=` / `?playerId=`)
- `examples/beacon-world/schemas/scene-extensions.schema.json` (`WorldSignal`)
- `examples/beacon-world/scenes/start.scene.json` (`world.signal` singleton)
- `examples/beacon-world/src/systems/world-signal-system.ts`
- `examples/beacon-world/src/ui/health-hud.ts` (smoothed %)
- `engine/core/ecs/world.ts` (`revision`, `getRevision`, `createQuery`, `QueryHandle`)
- Tests: `tests/unit/node-world-server.test.ts`, `tests/unit/ws-network-adapter.test.ts`, `examples/beacon-world/tests/unit/world-signal-system.test.ts`, additions in `tests/unit/ecs-world.test.ts`

### Verification

- `engine check examples/hello-3d` and `engine check examples/beacon-world`: green.
- Sprint-close `npm run preflight`: typecheck clean, 123 Vitest tests across 19 files, vite build OK, 10 Playwright e2e tests.
- Manual: `PORT=8799 npm run backend:node:serve` boots cleanly, accepts SIGTERM cleanly.

### Goal Recap

The sprint goal — a bigger sprint per `feedback-sprint-size` that connects all four pillars (backend, client, gameplay, engine) — was met:

- Backend now actually serves over a network port. The protocol contract from Sprint 5 is no longer paper; AJV validates every frame and a real `ws` client gets `world.snapshot` broadcasts.
- The browser can opt into the server via `?server=ws://localhost:8787` without changing the local scene. Locally-known entities are protected from collision with server-owned ones.
- The Beacon World gameplay state now exposes a derived signal that is itself ECS data — agents can read it without any new tool, and the HUD just renders the same field.
- ECS queries can now be cached without invalidating on data-only writes, eliminating most per-frame allocation in well-behaved systems.

### Follow-Ups

- `10.5` C#/.NET reference skeleton still pending (separate epic).
- The Beacon World scene does not yet route its player drone through the network adapter — the WS path is plumbed but the drone still moves locally. Future story: opt-in `networked` profile for the drone.
- `13.12` Sound pings still pending.
- Cached query handles are not yet adopted by built-in systems (`spin-system`, `pickup-system`, `hazard-system`, `world-signal-system`). Wiring them in is a separate, mechanical change once any of them shows up in a profile.

## Sprint 16 - Networked Drone + Reconnect + Cached Query Adoption + Schema Diagnostics

Status: Completed and archived.

### Completed Work

- `10.7` Networked Beacon drone — `PlayerInputSystem` gains an optional `onIntent(direction)` callback. When set, the system stops mutating the local `Transform` and forwards the normalised direction every frame the player is moving. `src/app.ts` gains `AppOptions.networked` and, when both `serverUrl` and `networked` are set, builds the input system with `onIntent` wired to `network.sendIntent`. `src/main.ts` reads `?networked=1` from the URL. The server's authoritative `player.<playerId>` entity appears in the snapshot as a separate entity alongside the local drone; pickup / hazard / signal systems still see the local drone unchanged. Two new tests cover the intent forwarding path (`onIntent` fires with the normalised direction; no `Transform` write) and the no-op idle path.
- `10.8` Connection lifecycle hardening — `WsNetworkAdapter` accepts `reconnect: boolean | { initialDelayMs, maxDelayMs, maxAttempts }` (defaults: 250 ms initial, 5 s cap, unlimited attempts). On an unexpected `close`, server-owned entities are flushed from the local world and a reconnect is scheduled with exponential backoff. On open, the adapter re-sends `player.join` automatically. `readyState()` returns `-1` while a reconnect is pending. `reconnectCount()` exposes the attempt counter for tests. `setTimeoutFn` / `clearTimeoutFn` hooks make backoff deterministic under vitest. New integration test runs the full server-down → server-up cycle and proves the adapter rejoins and the server-owned entity reappears in the client `World`. `src/app.ts` enables reconnect by default when `serverUrl` is provided.
- `E.3` Adopt cached query handles in built-in systems — `spin-system`, `pickup-system`, `hazard-system` and `world-signal-system` now lazily build `world.createQuery(...)` handles on first tick (or whenever the bound `world` reference changes) and reuse them across frames. Component-data overwrites no longer trigger a full re-scan; only structural changes do. Existing unit and e2e suites unchanged in behaviour and still green.
- `E.4` Schema-driven diagnostics — `project-check.ts` now emits a dedicated `AGF_SCHEMA_UNKNOWN_COMPONENT` code (with message `Unknown component "Foo".`) when the schema rejects an unknown property at the `components` slot. The suggestion lists every component the project actually has access to (built-ins + scene-extensions) and includes a Levenshtein-based "Did you mean ..." line when the unknown name is a near-match. New `tests/fixtures/component-typo/` proves `Trnasform` → `Transform`. Updated `engine-cli.test.ts` and `project-check.test.ts` to expect the new code.

### Deliverables

- `engine/runtime/player-input-system.ts` (`onIntent`)
- `engine/runtime/network/ws-network-adapter.ts` (`reconnect`, `reconnectCount`, `setTimeoutFn`/`clearTimeoutFn` hooks)
- `src/app.ts` (`networked` option, reconnect-on by default), `src/main.ts` (`?networked=`)
- `engine/core/systems/spin-system.ts`, `examples/beacon-world/src/systems/{pickup,hazard,world-signal}-system.ts` (cached queries)
- `engine/tools/check/project-check.ts` (`AGF_SCHEMA_UNKNOWN_COMPONENT`, Levenshtein)
- `tests/fixtures/component-typo/`
- Tests: `tests/unit/player-input-system.test.ts` (+2), `tests/unit/ws-network-adapter.test.ts` (+1 reconnect), `tests/unit/project-check.test.ts` (+1 typo), `tests/unit/engine-cli.test.ts` (code update)

### Verification

- `engine check examples/hello-3d` and `examples/beacon-world`: green.
- Sprint-close `npm run preflight`: typecheck clean, 127 Vitest tests across 19 files, vite build OK, 10 Playwright e2e tests.

### Goal Recap

The sprint goal — close the loop on the backend epic and polish the engine surface — was met:

- Keyboard input crosses the wire when `?networked=1` is on; the server is authoritative for the networked player's position. Local gameplay systems (pickup, hazard, signal) keep operating on the local entity unchanged, so the local single-player loop is unaffected.
- The client survives a server restart: server-owned entities are removed cleanly on disconnect and re-appear on reconnect, with exponential backoff bounded by `maxDelayMs`.
- Built-in systems no longer pay for per-frame `world.query(...)` allocation; the cached handles invalidate only on structural changes, so steady-state scenes hit the memo path every frame.
- An agent that types `"Trnasform"` (or `"Camear"`) gets a one-line diagnostic that names the nearest known component and points at `<projectDir>/schemas/scene-extensions.schema.json` for genuinely new components.

### Follow-Ups

- `10.5` C#/.NET reference skeleton still pending.
- Server-side player timeout (drop a player whose snapshot tick has not seen activity in N seconds) is still on the to-do list; the close-event path already drops them when the WS shuts down.
- `13.12` Sound pings still pending.
- The networked profile does not yet hide / swap the local drone with the server-owned one; both render simultaneously. A future story can fold them when authority hand-off is wired up.

## Sprint 17 - Lifecycle Timeout + Profile Gating + Inspect Tail + Round Summary

Status: Completed and archived.

### Completed Work

- `10.9` Server-side player timeout — `ServerWorld` now records `lastActivity` on each player (bumped on join and on `intent.move`) and exposes `expiredPlayers(timeoutSeconds)`. The WS transport accepts a `playerTimeoutSeconds` option (default 30 s; pass 0 to disable) and on every tick disconnects any player whose intent hasn't arrived within the window, logging `timeout playerId=...`. New unit test boots the transport with a 0.2 s timeout and proves the player is dropped and logged without further activity.
- `E.5` Profile gating — `SystemScheduler` now accepts `activeProfiles` in its constructor and `register(system, { profiles })` skips registration unless at least one of the named profiles is in the active set. `createApp` reads `project.profiles[0]` (or `?profile=...`) as the active profile and gates the Beacon Pickup / Hazard / WorldSignal / Round systems on `"static"`. The runtime branching that previously asked `if (projectId === "beacon-world")` now layers a profile filter on top so adding a `"connected"` system family is a one-line registration. Two new scheduler tests cover the skip / register paths.
- `E.6` `engine inspect --tail N` — new `tailSnapshotDiff` helper truncates a `SnapshotDiffResult` to the last N entries and records the hidden count in a new `truncated` field. `engine inspect --diff prev.json next.json --tail N` propagates the option through `cli.ts` and `formatDiff` annotates the human output with `Changes: X (showing last N, M hidden by --tail)`. Four new tests cover undefined / N / 0 / format-string paths.
- `13.14` Win condition / round summary — new `RoundState { phase, thresholdHealth, holdSeconds, holdProgress, completedAt }` component on the singleton `world.signal` entity. `examples/beacon-world/src/systems/round-system.ts` runs every frame: while `WorldSignal.health >= thresholdHealth` it accumulates `holdProgress`; on reaching `holdSeconds` it flips to `phase = "complete"` and stamps `completedAt = time.elapsed`. Phase never regresses. HUD adds a third line that shows `HOLD x.x/X.Xs` while the threshold is held and `ROUND COMPLETE` once it locks. Five new unit tests cover the ramp-up, completion, hold-reset, no-regression and missing-singleton paths.

### Deliverables

- `examples/backends/node-world-server/src/world.ts` (`lastActivity`, `expiredPlayers`, `elapsedSeconds`)
- `examples/backends/node-world-server/src/transport-ws.ts` (`playerTimeoutSeconds`, per-player socket map, idle drop)
- `engine/core/systems/scheduler.ts` (`SystemSchedulerOptions`, `SystemRegistrationOptions`, profile filter, `getActiveProfiles`)
- `engine/tools/inspect/snapshot-diff.ts` (`tailSnapshotDiff`, `truncated`)
- `engine/tools/cli.ts` (`--tail N` flag, usage)
- `examples/beacon-world/schemas/scene-extensions.schema.json` (`RoundState`)
- `examples/beacon-world/scenes/start.scene.json` (`RoundState` on `world.signal`)
- `examples/beacon-world/src/systems/round-system.ts`
- `examples/beacon-world/src/ui/health-hud.ts` (round summary + `HOLD` line)
- `src/app.ts` (active profile resolution, profile-gated beacon registrations), `src/main.ts` (`?profile=`)
- Tests: `tests/unit/node-world-server.test.ts` (+1 timeout), `tests/unit/system-scheduler.test.ts` (+2 profile cases), `tests/unit/snapshot-diff.test.ts` (+4 tail cases), `examples/beacon-world/tests/unit/round-system.test.ts` (5 cases)

### Verification

- `engine check examples/hello-3d` and `examples/beacon-world`: green.
- Sprint-close `npm run preflight`: typecheck clean, 139 Vitest tests across 20 files, vite build OK, 10 Playwright e2e tests.

### Goal Recap

The sprint goal — close the second wave of polish around the network epic and surface a real win state — was met:

- Idle clients no longer pile up on the server; the close-handler path is reinforced by an explicit activity timeout with a clear log line.
- Project system wiring is now declarative w.r.t. profiles, so a future `"connected"` story can opt entities in or out without touching `src/app.ts` branching.
- `engine inspect --tail N` keeps agent context windows manageable when scenes evolve into many entities; the truncation is honest about how much is hidden.
- The Beacon World gameplay loop has a visible terminal: hold all beacons repaired for 3 s and the HUD locks to `ROUND COMPLETE`. The state is data, so an agent can poll for it through `window.__agf.snapshot()`.

### Follow-Ups

- `10.5` C#/.NET reference skeleton still pending.
- `10.10` Authority hand-off for the Beacon drone still pending; networked profile still renders the local + server drone side by side.
- The round resets automatically only by decay; there is no explicit "new round" action yet. Future story can add a `round.reset` command.
- `13.12` Sound pings still pending.

## Sprint 18 - Multi-Client e2e + Stable Inspect + Recipe Doc + Round Reset

Status: Completed and archived.

### Completed Work

- `10.11` Multi-client e2e — new `tests/e2e/multiclient-roundtrip.spec.ts`. The test spawns `tsx examples/backends/node-world-server/src/index.ts --serve` on a random port, opens two browser contexts at `?project=beacon-world&server=ws://...&networked=1&playerId=alpha|bravo`, and proves: (1) each page's `__agf.snapshot()` lists `player.alpha` and `player.bravo`; (2) when `alpha` presses `KeyD`, `bravo`'s snapshot for `player.alpha` shows `Transform.position[0] > 0.1`. The backend is started fresh per test and torn down via `SIGTERM`.
- `E.7` Stable inspect JSON — new `toStableInspectResult` reduces `projectDir` to its basename and re-emits the result with top-level keys sorted alphabetically. `engine inspect --save` writes the stable form so a diff between two runs on different machines is byte-meaningful. Component values were already alphabetically sorted by `inspectProject`. Three unit tests cover the rename, byte-stability, and filter/project/scene preservation paths.
- `E.8` Agent test recipe doc — new `docs/agent/test-recipe.md`. One page of pinned commands and URL flags walking through the canonical verification recipe: edit JSON → `engine check` → before/after `engine inspect --save --diff [--tail N]` → `npm run test` → `npm run playtest` → browser dev + `window.__agf` → `npm run test:e2e` → optional WS round-trip → sprint-close `preflight`. Linked from `docs/agent/claude-code.md`.
- `13.15` Round reset — new `examples/beacon-world/src/round-reset.ts` exports `resetBeaconRound(world)` that re-arms all `Repairable` beacons (restoring `originalMaterial`/`originalColor` the same way decay does), respawns every consumed `Pickup` to its `originalPosition` and flips `RoundState` back to `"active"` with `holdProgress = 0`. `src/app.ts` binds `window`-level `KeyR` (skipping input fields) when the project is Beacon World and exposes `AppHandle.resetRound()`. `src/main.ts` re-exports it on `window.__agf.resetRound()` (DEV only). Four unit tests cover the beacon path, the pickup path, the round-state path and the no-op / mutation-count path.

### Deliverables

- `engine/tools/inspect/project-inspect.ts` (`toStableInspectResult`)
- `engine/tools/cli.ts` (uses stable form for `--save` on inspect)
- `examples/beacon-world/src/round-reset.ts`
- `examples/beacon-world/tests/unit/round-reset.test.ts`
- `src/app.ts` (`AppHandle.resetRound`, `KeyR` keyboard binding), `src/main.ts` (`__agf.resetRound`)
- `tests/e2e/multiclient-roundtrip.spec.ts`
- `tests/unit/project-inspect-stable.test.ts`
- `docs/agent/test-recipe.md`, `docs/agent/claude-code.md` (link)

### Verification

- `engine check examples/hello-3d` and `examples/beacon-world`: green.
- Sprint-close `npm run preflight`: typecheck clean, 146 Vitest tests across 22 files, vite build OK, 11 Playwright e2e tests (including the new multi-client backend round-trip).

### Goal Recap

The sprint goal — agent-first verification and a complete gameplay terminal — was met:

- The networking stack now has end-to-end coverage that genuinely uses the WS server, two real browser contexts, and asserts on cross-client visibility. Anyone (or any agent) can rerun it with one `npm run test:e2e`.
- `engine inspect --save` produces output that diffs cleanly across machines, so an agent saving snapshots in CI and locally gets the same bytes.
- The recipe doc collapses the right command chain into one page, so a fresh agent doesn't have to grep for which script to run.
- Beacon World now has an explicit "play again" gesture (`KeyR`, `__agf.resetRound()`, or `AppHandle.resetRound()`), so post-completion the world is in a known clean state without a page reload.

### Follow-Ups

- `10.5` C#/.NET reference skeleton still pending.
- `10.10` Authority hand-off (hide local drone when networked) still pending.
- `13.12` Sound pings still pending.
- HUD does not yet say "Press R to restart" when phase === "complete"; the affordance is documented but not on-screen. Trivial follow-up.

## Sprint 19 - Authority Hand-Off + Snapshot Resync + HUD Restart Hint + Plain Inspect Tail

Status: Completed and archived.

### Completed Work

- `10.10` Authority hand-off + client prediction + reconciliation — project-local `network-drone-sync-system.ts` reconciles the local `player.drone` with the server-owned `player.<options.playerId>`. `beacon-world/project.json` declares `"static"` and `"connected"` profiles; `src/app.ts` auto-selects `"connected"` when `?networked=1&server=...` is on, hoists `playerId` once so the adapter and sync system agree.
  - Client-side prediction: `PlayerInputSystem` in networked mode now also moves the local drone immediately on input (in addition to emitting `intent.move`), so the player sees instant motion.
  - Server reconciliation: the sync system measures XZ drift between the local drone and the server snapshot. When drift exceeds `snapThresholdUnits` (default 1.5 — set by teleports / respawns), it snaps. Below the threshold it exponentially lerps at `reconcileRate` (default 12 / s) so prediction errors melt away smoothly.
  - Server constants updated: tick defaults to 30 Hz (down from 60 — clients no longer need raw frame rate because of prediction) and `PLAYER_SPEED` lifted to 3.5 to match `PlayerControlled.speed`, so prediction stays in lockstep with the authoritative integration.
  - Input release: `PlayerInputSystem` now emits a final `[0, 0]` intent the frame the keys are released, so the server stops driving the player when the client lets go.
  - Four unit tests cover the mirror, wrong-id, client-authority and missing-local-drone paths; two new `PlayerInputSystem` cases prove the `[0, 0]` release intent and the deduped emission. The multi-client e2e gained an extra assertion that alpha's `player.drone.Transform.position[0]` moves while bravo's stays at zero — proving authority hand-off across the wire.
- `10.12` Resync on snapshot gap — `WsNetworkAdapter` now compares each inbound `world.snapshot.sequence` against the previous one. When the sequence number jumps (server restart, dropped frames, out-of-order delivery) it logs `snapshot gap: expected N, got M; resyncing`, flushes every server-owned entity via `entity.delete` and lets the next snapshot re-create them. A new `snapshotGapCount()` field on the handle exposes the counter. `lastSequence` is also reset on the close path so a reconnect always starts fresh. New unit test drives the path with a fake `WebSocket` and proves: out-of-sequence snapshot drops the orphaned `player.echo`; the next in-sequence snapshot restores it.
- `13.16` HUD restart affordance — `health-hud.ts` now splits the `ROUND COMPLETE` line into a title + dimmer `Press R to restart` hint. Each line carries its own `data-testid` (`hud-round-complete`, `hud-round-restart-hint`) so e2e can assert on them independently. Active only when `RoundState.phase === "complete"`.
- `E.9` `engine inspect --tail N` for plain inspect — new `tailInspectResult(result, tail)` truncates `scene.entities` to the last N while preserving `matchedEntityCount`. `formatInspection` annotates the human output: `Showing last N of M (K hidden by --tail).`. `cli.ts` threads `--tail` through both the diff path (already supported) and the plain inspect path. Four new tests cover undefined / N / 0 / format-string.
- `13.X` Multiplayer discoverability hint — when the project is Beacon World and the user is not currently networked, the status panel renders a collapsible `Play multiplayer` block with the `backend:node:serve` command and two pre-built links (`Open as alpha` / `Open as bravo`). When already networked, the panel shows the connected URL + player id so two-tab setups are self-explanatory without reading docs.
- `10.13` Remote-player visibility — new project-local `remote-presence-decorator-system.ts` watches `Presence + Networked` entities and, for everything that is server-authority and NOT the local player, attaches a `MeshRenderer` (drone.glb + drone.material with a per-player palette color via stable hash) and a `Transform.scale` of `[0.7, 0.7, 0.7]` when missing. Idempotent: only writes when fields are absent, so the renderer's GLB cache is not invalidated each frame. Five unit tests cover the decorate, skip-local, no-overwrite, ignore-client-authority and stable-color paths.

### Deliverables

- `examples/beacon-world/src/systems/network-drone-sync-system.ts` (snap threshold + lerp reconciliation)
- `examples/beacon-world/src/systems/remote-presence-decorator-system.ts`
- `examples/beacon-world/tests/unit/network-drone-sync-system.test.ts`
- `examples/beacon-world/tests/unit/remote-presence-decorator-system.test.ts`
- `engine/runtime/player-input-system.ts` (local prediction in networked mode, `[0, 0]` release intent, dedupe)
- `examples/backends/node-world-server/src/world.ts` (`PLAYER_SPEED = 3.5`)
- `examples/backends/node-world-server/src/transport-ws.ts` (default `tickHz = 30`)
- `examples/beacon-world/project.json` (`profiles: ["static", "connected"]`)
- `examples/beacon-world/src/ui/health-hud.ts` (`hud-round-complete` + `hud-round-restart-hint`)
- `engine/runtime/network/ws-network-adapter.ts` (gap detection, `snapshotGapCount`)
- `engine/tools/inspect/project-inspect.ts` (`tailInspectResult`, hidden-count annotation in `formatInspection`)
- `engine/tools/cli.ts` (threads `--tail` through plain inspect)
- `src/app.ts` (auto-`connected` profile, hoisted `playerId`, drone-sync registration, status-panel multiplayer hint)
- `tests/e2e/multiclient-roundtrip.spec.ts` (asserts local drone mirror + bravo drone stationary)
- Tests: `tests/unit/ws-network-adapter.test.ts` (+1 gap resync), `tests/unit/project-inspect-stable.test.ts` (+4 tail cases)

### Verification

- `engine check examples/hello-3d` and `examples/beacon-world`: green.
- Sprint-close `npm run preflight`: typecheck clean, 155 Vitest tests across 23 files, vite build OK, 11 Playwright e2e tests including the strengthened multi-client backend round-trip.

### Goal Recap

The sprint goal — make the networked profile actually drive the local visible drone, harden the wire and give the agent better truncation knobs — was met:

- The local drone now moves under server authority while still carrying its local components (Carrier, Health, Respawnable, MeshRenderer). Pickup, hazard, signal and round systems keep working unchanged; the player just doesn't fight against a stationary drone any more.
- A snapshot-sequence gap is recoverable: the client deletes its server-owned cache and rebuilds from the next snapshot. No ghosted entities survive a server restart.
- `engine inspect --tail N` now applies to plain inspect too, so an agent can ask for "the last N entities" without writing a filter.
- The HUD's win-state line tells the player how to restart, not just that the round is over.

### Follow-Ups

- Remote players are visible but their `Transform.position` is overwritten every server tick with no smoothing — at 30 Hz that's perceivable as a 30 ms cadence jitter on unstable networks. Sprint 20 candidate `10.13.5` will add an interpolation buffer (render past server time, store last N snapshots with timestamps) for production-grade smoothness.
- `10.5` C#/.NET reference skeleton still pending.
- `13.12` Sound pings still pending.

## Sprint 20 - Snapshot Interpolation + Inspect --components-only + Drone Palette + Auto-Reset

Status: Completed and archived.

### Completed Work

- `10.13.5` Snapshot interpolation buffer — `WsNetworkAdapter` now timestamps every inbound `world.snapshot` and records `{ receivedAtSeconds, position }` per entity in a bounded ring buffer (default 10 samples, configurable via `snapshotBufferSize`). The new `getSnapshotBuffer()` handle returns a read-only view of that buffer. A project-local `remote-presence-interpolator-system.ts` reads the buffer each frame and writes `Transform.position` at `now - renderDelaySeconds` (default 100 ms) by lerping between the two samples that bracket the render time. When the render time runs past the newest sample, the system extrapolates linearly using the last segment's velocity for up to `extrapolationLimitSeconds` (default 200 ms), then holds the last known position. The local player is skipped — `network-drone-sync` already handles prediction + reconciliation there. Five unit tests cover the lerp path, the bounded extrapolation, the hold-after-cap, the skip-local, and the empty-buffer no-op. Buffer entries are cleared on disconnect and on entity.delete so reconnect / server restart starts clean.
- `E.11` `engine inspect --components-only` and `--exclude-component` — new `excludeComponents` field on `InspectOptions` drops listed component names from every emitted entity. New `NOISY_METADATA_COMPONENTS` constant lists the canonical noise (`Name`, `Networked`, `Presence`); `--components-only` flag in the CLI is an alias for excluding all of them. `--exclude-component N1,N2,...` adds custom names. Pairs naturally with `--tail` to keep the agent's context window small.
- `14.7` Drone material variant family — four new project-owned material manifests under `examples/beacon-world/assets/runtime/materials/`: `drone-orange`, `drone-cyan`, `drone-violet`, `drone-amber`. `asset-sources.json` declares them as `beacon-world.drone-material-palette`. The remote-presence decorator now picks a palette entry indexed by a stable hash of the remote player's id (and no longer attaches a `color` field, which the standalone material already encodes).
- `13.17` Auto-reset on completion — `RoundState` gains an optional `autoResetSeconds`. New `round-auto-reset-system.ts` watches the singleton `world.signal.RoundState`; when phase is complete and `elapsed - completedAt >= autoResetSeconds`, it calls `resetBeaconRound(world)`. `round-reset.ts` carries `autoResetSeconds` across the reset boundary. Beacon's scene declares `autoResetSeconds: 5`. Four unit tests cover the active no-op, the wait-then-reset, the missing-field no-op, and the preservation of `autoResetSeconds` across resets.

### Deliverables

- `engine/runtime/network/ws-network-adapter.ts` (timestamped sample buffer, `getSnapshotBuffer`, `SnapshotSample`)
- `engine/tools/inspect/project-inspect.ts` (`excludeComponents`, `NOISY_METADATA_COMPONENTS`, `applyExclude`)
- `engine/tools/cli.ts` (`--components-only`, `--exclude-component`)
- `examples/beacon-world/src/systems/remote-presence-interpolator-system.ts`
- `examples/beacon-world/src/systems/remote-presence-decorator-system.ts` (palette-driven material)
- `examples/beacon-world/src/systems/round-auto-reset-system.ts`
- `examples/beacon-world/src/round-reset.ts` (autoResetSeconds preservation)
- `examples/beacon-world/schemas/scene-extensions.schema.json` (`RoundState.autoResetSeconds`)
- `examples/beacon-world/scenes/start.scene.json` (`autoResetSeconds: 5`)
- `examples/beacon-world/assets/runtime/materials/drone-{orange,cyan,violet,amber}.material.json`
- `examples/beacon-world/assets/_sources/asset-sources.json` (palette entry)
- `src/app.ts` (registers the interpolator and auto-reset systems)
- Tests: `examples/beacon-world/tests/unit/remote-presence-interpolator-system.test.ts`, `examples/beacon-world/tests/unit/round-auto-reset-system.test.ts`, `tests/unit/project-inspect-stable.test.ts` (+ exclude/NOISY_METADATA cases)

### Verification

- `engine check examples/hello-3d` and `examples/beacon-world`: green.
- Sprint-close `npm run preflight`: typecheck clean, 172 Vitest tests across 26 files, vite build OK, 11 Playwright e2e tests.

### Goal Recap

The sprint goal — push the networked profile toward production-quality netcode and tighten the agent's inspect knobs — was met:

- Remote players now smooth across jittery networks: the adapter buffers timestamped server samples, the interpolator renders 100 ms behind real-time, and bounded extrapolation handles short packet gaps gracefully.
- `engine inspect --components-only` (and the lower-level `--exclude-component`) trims `Name` / `Networked` / `Presence` from every output so an agent comparing diffs against a large scene gets only the gameplay components that actually change.
- Networked players now wear distinct material variants, hashed from their `playerId`, so two browser tabs visually distinguish each other without any per-client config.
- Beacon World now closes its gameplay loop on its own: hold the threshold for `holdSeconds`, see `ROUND COMPLETE`, wait `autoResetSeconds`, and the world re-arms automatically — useful both for HMR demos and for keeping an idle browser session productive.

### Follow-Ups

- `10.5` C#/.NET reference skeleton still pending.
- `10.15` Server-acked input sequences for precise reconciliation still pending.
- `13.12` Sound pings still pending.
- Local-player reconciliation could itself become rollback-style once `10.15` lands: keep recent unacked intents, replay them on each server snapshot rather than blending toward the server position.

## Sprint 21 - Acked Inputs + Inspect Watch + Scoreboard + Material HMR Audit

Status: Completed and archived.

### Completed Work

- `10.15` Server-acked input sequences — `schemas/protocol.schema.json` gains optional `world.snapshot.payload.lastAcked` keyed by playerId. `ServerWorld.snapshot()` populates it from each player's `lastIntentSequence`. `WsNetworkAdapter` parses the field into a per-playerId map and exposes `lastAckedFor(playerId)` and `highestOutboundSequence()`. `network-drone-sync-system` accepts an optional `getUnackedInputCount` callback and, while it returns > 0, stays in lerp-only mode (no snap), so the local prediction is not yanked back by a stale snapshot. `src/app.ts` wires the callback to the adapter handle. Two new unit tests cover the unacked-no-snap and acked-snap paths.
- `E.12` `engine inspect --watch` — new long-running CLI mode. `engine inspect <project> --watch [--save ...]` re-runs the inspect pipeline on every `.json` change under `<project>` (debounced 120 ms), supporting all existing flags (`--components-only`, `--tail`, `--query`, etc.). Watch uses Node's recursive `fs.watch`; SIGINT/SIGTERM stops cleanly. Tagged with timestamp + filename for each re-run so an agent can correlate to its own writes.
- `13.18` Scoreboard — `Repairable` schema gains optional `lastRepairedBy: string`. `pickup-system` writes the carrier's `Presence.playerId` into it on every successful repair; decay and round-reset both clear it. HUD adds a `SCORE` panel that aggregates `Repairable.repaired === true` entities by `lastRepairedBy` and renders one row per player, sorted by count desc then id. Hidden when no scores. Three new unit tests cover the write, the no-Presence case, and the clear-on-decay path.
- `14.8` Material HMR audit — new `tests/e2e/material-hmr-audit.spec.ts` walks every file under `examples/beacon-world/assets/runtime/materials/`, touches it, and asserts that `window.__agf.lastReloadedAsset` matches the expected ref and `reloadCount` increments. Catches accidental regressions to the `agf:asset-changed` plugin path. Updated `glb-hot-reload.spec.ts` to wait on `lastReloadedAsset` directly rather than re-reading after the fact, eliminating a race with the new audit when both run in parallel.

### Deliverables

- `schemas/protocol.schema.json` (`lastAcked` on `world.snapshot`)
- `examples/backends/node-world-server/src/world.ts` (`Snapshot.lastAcked`)
- `engine/runtime/network/ws-network-adapter.ts` (`lastAckedFor`, `highestOutboundSequence`, ack tracking on disconnect)
- `examples/beacon-world/src/systems/network-drone-sync-system.ts` (`getUnackedInputCount`, lerp-only while unacked)
- `src/app.ts` (wires `getUnackedInputCount` to the adapter handle)
- `engine/tools/cli.ts` (`--watch` mode, refactored inspect path)
- `examples/beacon-world/schemas/scene-extensions.schema.json` (`Repairable.lastRepairedBy`)
- `examples/beacon-world/src/systems/pickup-system.ts` (writes `lastRepairedBy` on repair, clears on decay)
- `examples/beacon-world/src/round-reset.ts` (clears `lastRepairedBy` on reset)
- `examples/beacon-world/src/ui/health-hud.ts` (`SCORE` scoreboard panel)
- `tests/e2e/material-hmr-audit.spec.ts`
- `tests/e2e/glb-hot-reload.spec.ts` (race-free wait)
- Tests: `examples/beacon-world/tests/unit/network-drone-sync-system.test.ts` (+2 ack paths), `examples/beacon-world/tests/unit/pickup-system.test.ts` (+3 lastRepairedBy paths), `tests/unit/node-world-server.test.ts` (polling instead of fixed sleep)

### Verification

- `engine check examples/hello-3d` and `examples/beacon-world`: green.
- Sprint-close `npm run preflight`: typecheck clean, 177 Vitest tests across 26 files, vite build OK, 12 Playwright e2e tests (including the new HMR audit and the strengthened multi-client round-trip).
- Manual: `npm run engine:inspect -- examples/beacon-world --watch --components-only --tail 3` boots, re-renders on touch, exits on SIGINT.

### Goal Recap

The sprint goal — close the netcode trilogy and tighten the agent's inspect loop — was met:

- The server now tells the client which input it last applied; the client's reconciliation skips the snap branch while there are un-acked inputs, so high-latency play does not feel like rubber-banding. This is the foundation for full rollback-replay in a future story.
- `engine inspect --watch` removes the manual re-run between edits, so the canonical agent loop is effectively single-command: open the watch in one terminal, edit the JSON in another.
- The Beacon HUD now surfaces a per-player repair count derived from `Repairable.lastRepairedBy`, giving multi-tab play a tangible scoreboard with zero additional state.
- The HMR audit guarantees that every material under `assets/runtime/materials/` keeps the live-reload contract intact when the palette grows.

### Follow-Ups

- `10.5` C#/.NET reference skeleton still pending.
- `10.15.5` Rollback-replay reconciliation — once we have per-input timestamps in the client buffer, network-drone-sync can replay un-acked intents on top of the server position instead of just refusing to snap. Adds true precision but requires tracking direction-change timestamps client-side.
- `13.12` Sound pings still pending.
- Scoreboard does not yet survive round resets (counts wipe along with `lastRepairedBy`). A future story can persist a `RoundState.scores` cumulative total separate from per-beacon ownership.

## Sprint 22 - Rollback-Replay + ApplyCommand Perf + Asset Diagnostics + Bootstrap Registry

Status: Completed and archived.

### Completed Work

- `10.15.5` Rollback-replay reconciliation — `WsNetworkAdapter` now retains each outbound `intent.move` in an `unackedIntents` map with the wall-clock `sentAtSeconds`; entries with `sequence <= lastAckedFor(playerId)` are pruned on every snapshot. New `getUnackedIntents()` returns the sorted list. `network-drone-sync-system` accepts `getUnackedIntents` + `nowSeconds` + `playerSpeed`; when all three are set, it computes the **predicted position** = server position + per-intent replay (each intent applies `direction * speed * duration` over its real `[sentAt, nextIntent.sentAt ?? now]` span) and reconciles the local drone toward the prediction instead of toward the bare server position. The snap branch still requires zero un-acked intents. Two new unit tests cover the single-intent replay and the multi-segment integration paths.
- `E.10` `applyCommand` perf boundary — `applyCommand` already only depends on `ecs/` + `commands/types`. New `engine/core/commands/apply.ts` re-exports it so external callers can import the applicator in isolation, never pulling in `CommandQueue` or anything that imports systems. New `tests/unit/apply-command-perf.test.ts` asserts a 400-command worst-case batch (create / set / remove / delete × 100) on a fresh `World` runs in under 50 ms and that `apply.ts` exports only `applyCommand`.
- `14.10` Asset diagnostics — `engine check` now walks `assets/runtime/` recursively (excluding dotfiles) and emits a `AGF_ASSET_RUNTIME_UNDECLARED` warning for any file that is not listed under an `asset-sources.json` entry's `runtimeFiles`. The new diagnostic immediately caught two real omissions in `examples/beacon-world/assets/_sources/asset-sources.json` (the `core.glb` and `beacon-repaired.material.json` entries) — both fixed in this sprint. New fixture `tests/fixtures/undeclared-runtime-asset/` and unit test cover the warning shape.
- Project bootstrap registry (P3 from `codex_review_1.md`) — new `engine/runtime/project-bootstrap.ts` defines `ProjectBootstrap` with `registerSystems` / `attachUi` / `resetRound` / `renderConnectivityHint`. `examples/hello-3d/bootstrap.ts` and `examples/beacon-world/bootstrap.ts` implement it; the Beacon bootstrap carries everything that used to live in `src/app.ts`'s `if (projectId === "beacon-world")` branches — system registrations, HUD mount, `KeyR` handler, multiplayer hint. `src/app.ts` no longer imports from `examples/`; `src/main.ts` selects the bootstrap by project id and passes it through `AppOptions.bootstrap`.

### Deliverables

- `engine/core/commands/apply.ts`
- `engine/runtime/network/ws-network-adapter.ts` (`UnackedIntent`, `getUnackedIntents`, prune on ack)
- `engine/runtime/project-bootstrap.ts`
- `engine/tools/check/project-check.ts` (`AGF_ASSET_RUNTIME_UNDECLARED` + walker)
- `examples/beacon-world/bootstrap.ts`
- `examples/beacon-world/src/systems/network-drone-sync-system.ts` (replay path, `getUnackedIntents` / `nowSeconds` / `playerSpeed` options)
- `examples/beacon-world/assets/_sources/asset-sources.json` (`core.glb`, `beacon-repaired.material.json` declarations)
- `examples/hello-3d/bootstrap.ts`
- `src/app.ts` (bootstrap pass-through, no example imports)
- `src/main.ts` (bootstrap registry)
- `tests/fixtures/undeclared-runtime-asset/` (new)
- Tests: `tests/unit/apply-command-perf.test.ts` (2 cases), `tests/unit/project-check.test.ts` (+1 undeclared-asset case), `examples/beacon-world/tests/unit/network-drone-sync-system.test.ts` (+2 replay cases)

### Verification

- `npm run engine:check:examples`: every example project green (post-asset-declaration fixes).
- Sprint-close `npm run preflight`: typecheck clean, 184 Vitest tests across 27 files, vite build OK, 12 Playwright e2e tests.

### Goal Recap

The sprint goal — finish the modern-netcode story and pay down the architecture debt flagged by the review — was met:

- The reconciliation pipeline now lerps toward the **predicted** position (server + un-acked intent replay), not the raw server position. With matching client/server speeds and a stable clock, the steady-state drift is bounded by `now - lastIntent.sentAt`.
- `applyCommand` has a clean import boundary and a perf budget that is asserted in unit tests; future churn cannot silently regress it.
- `engine check` will now flag any runtime asset that an agent forgets to declare in `asset-sources.json`. The audit immediately caught real omissions on `main`.
- `src/app.ts` and the engine no longer import anything from `examples/`; adding a third sample project is a one-line registry entry in `src/main.ts` plus a `bootstrap.ts` file under the example directory.

### Follow-Ups

- `10.5` C#/.NET reference skeleton still pending.
- `13.12` Sound pings still pending.
- `13.19` Persistent scoreboard still pending.
- Bootstrap registry could become a dynamic-import map once more samples land so the root bundle stops shipping every example's systems. Today's eager imports keep the contract simple at the cost of bundle size growth (still flagged by P3 in `codex_review_1.md`).
- Replay assumes client/server speeds match exactly. A future story can broadcast the server's effective `PLAYER_SPEED` so the client does not have to hard-code it.

## Sprint 23 - Server Speed Broadcast + Dynamic Bootstraps + Persistent Scores + Beacon Palette + Inspect On-Change

Status: Completed and archived.

### Completed Work

- `10.17` Server-broadcast player speed — `world.snapshot.payload.playerSpeed` added to `schemas/protocol.schema.json`. `ServerWorld.snapshot()` populates it from the server-side `PLAYER_SPEED` constant. `WsNetworkAdapter` parses the field and exposes `lastServerPlayerSpeed()`. `network-drone-sync-system` gains `getPlayerSpeed?: () => number | undefined`; when set it dynamically picks the server's value during replay, falling back to `playerSpeed` for the first frame before the first snapshot. Beacon's bootstrap wires the callback to the adapter handle. Unit test asserts the snapshot payload carries `playerSpeed: 3.5`.
- `E.14` Dynamic bootstrap imports — `src/main.ts` no longer eagerly imports each example's `project.json` / `scenes/start.scene.json` / `bootstrap.ts`. Instead, a per-project loader map runs `import("../examples/<id>/...")` only for the selected project. The Vite production build now emits a per-project `bootstrap-*.js` chunk (~21 KB for `beacon-world`, ~0.05 KB for `hello-3d`) plus a per-project `start.scene-*.js` chunk; the root bundle does not include any code for non-active projects.
- `13.19` Persistent scoreboard — `RoundState.scores: Record<playerId, number>` added to the project schema. `pickup-system` increments `scores[playerId]` on every successful repair (in addition to writing `Repairable.lastRepairedBy`). `round-reset` preserves the `scores` field across a reset, so the cumulative total survives `KeyR` / `__agf.resetRound()` / `autoResetSeconds` while the per-beacon ownership clears. HUD now reads scores from `RoundState.scores` instead of re-tallying `Repairable.lastRepairedBy` each frame.
- `14.9` Beacon material variant family — four new manifests under `examples/beacon-world/assets/runtime/materials/`: `beacon-repaired-orange.material.json`, `beacon-repaired-cyan`, `beacon-repaired-violet`, `beacon-repaired-amber`. `asset-sources.json` declares them as `beacon-world.beacon-repaired-palette`. `pickup-system` picks one by stable hash of the carrier's `Presence.playerId` on repair — each player now leaves a recognisable colour on the beacons they have fixed. Falls back to `Repairable.repairedMaterial` when the carrier has no Presence (single-player path stays unchanged).
- `E.13` `engine inspect --watch --on-change <cmd>` — new CLI flag. After every debounced re-run of inspect, watch shells out to `<cmd>` via `child_process.spawn` (with `shell: true`, inherited stdio), so agents can chain a custom validator / formatter without writing a wrapper. Errors and non-zero exits are logged but do not stop the watcher.

### Deliverables

- `schemas/protocol.schema.json` (`world.snapshot.payload.playerSpeed`)
- `examples/backends/node-world-server/src/world.ts` (`Snapshot.playerSpeed`)
- `engine/runtime/network/ws-network-adapter.ts` (`lastServerPlayerSpeed`)
- `examples/beacon-world/src/systems/network-drone-sync-system.ts` (`getPlayerSpeed`)
- `examples/beacon-world/bootstrap.ts` (uses adapter's broadcast speed)
- `src/main.ts` (dynamic project loaders, per-project chunks)
- `examples/beacon-world/schemas/scene-extensions.schema.json` (`RoundState.scores`)
- `examples/beacon-world/src/systems/pickup-system.ts` (score increment + palette pick)
- `examples/beacon-world/src/round-reset.ts` (preserve scores)
- `examples/beacon-world/src/ui/health-hud.ts` (read RoundState.scores)
- `examples/beacon-world/assets/runtime/materials/beacon-repaired-{orange,cyan,violet,amber}.material.json`
- `examples/beacon-world/assets/_sources/asset-sources.json` (beacon palette entry)
- `engine/tools/cli.ts` (`--on-change` flag + `runOnChange`)
- Tests: `tests/unit/node-world-server.test.ts` (playerSpeed assertion), `examples/beacon-world/tests/unit/pickup-system.test.ts` (+1 score increment), `examples/beacon-world/tests/unit/round-reset.test.ts` (+1 scores-preserved)

### Verification

- `engine check` green on every `examples/*/project.json`.
- Sprint-close `npm run preflight`: typecheck clean, 186 Vitest tests across 27 files, vite build OK (with per-project chunk split visible in the output), 12 Playwright e2e tests.
- Manual: `npm run engine:inspect -- examples/beacon-world --watch --on-change "echo refreshed"` boots, prints `refreshed` after every debounced re-run, exits cleanly on SIGINT.

### Goal Recap

The sprint goal — finish the netcode polish from PR #24's follow-ups and pay down a chunk of the architecture debt — was met:

- The client's rollback-replay no longer hard-codes the integration speed; it reads what the server is using, so future server-side speed tweaks propagate automatically.
- The production bundle now ships only the active project's code; the per-project chunk sizes are visible in the build output, which makes future bundle drift trivial to spot.
- The scoreboard now survives across rounds and HUD-driven resets — a multi-tab session no longer wipes the score on every `ROUND COMPLETE`.
- Beacons visually advertise which player repaired them last via the new four-colour palette, hashed off `playerId`.
- `engine inspect --watch --on-change` closes the agent's edit loop: scene change → inspect refresh → external validator, all in one terminal.

### Follow-Ups

- `10.5` C#/.NET reference skeleton still pending.
- `13.12` Sound pings still pending.
- Three.js + AJV are still the dominant weight in the main bundle (~700 KB pre-gzip). A future story can lazy-import the renderer too once the contract there is stable.
- Beacon palette currently only affects the *repaired* material; a future story could colour pickups (`core.glb`) or the carry effect by the same playerId hash for stronger ownership reads.

## Sprint 24 - Local Drone Palette + JSON Watch Stream + Hazard Materials + Inspect Diagnostics Echo

Status: Completed and archived.

### Completed Work

- `13.20` Local drone palette — new shared `examples/beacon-world/src/drone-palette.ts` exports `DRONE_MATERIAL_PALETTE` + `pickDroneMaterialFor(playerId, palette?)`. The remote-presence decorator now imports from it instead of carrying its own copy. Beacon's bootstrap `attachUi` calls `tintLocalDrone(runtime, playerId)` when networked, which rewrites the local `player.drone.MeshRenderer.material` to the palette entry hashed off the player's id. Result: an `?playerId=alpha` tab shows the same drone colour another tab sees through the remote-presence decorator. Five new unit tests cover the helper (palette membership, stability, empty-id, empty-palette, custom-palette).
- `E.15` `engine inspect --json --watch` NDJSON stream — `emitResult` now emits compact single-line JSON when both `--watch` and `--json` are set, so agents can pipe the stream through line-delimited JSON parsers. Without `--watch`, `--json` still produces pretty-printed output (existing callers unchanged).
- `14.11` Hazard material variants — two new manifests under `examples/beacon-world/assets/runtime/materials/`: `hazard-warning.material.json` (red emissive, used by the west-route hazard) and `hazard-amber.material.json` (warm amber, east route). `asset-sources.json` declares them under `beacon-world.hazard-materials`. `scenes/start.scene.json` swaps the inline `MeshRenderer.color` on both hazards for the named materials. Hazard pulses (`Transform.scale` animation) keep working unchanged because they touch scale, not material.
- `14.12` `engine inspect` echoes asset-diagnostics — `formatInspection` already passes through `result.diagnostics` under a `Diagnostics:` section. Locked the contract with a new unit test that asserts an `AGF_ASSET_RUNTIME_UNDECLARED` warning produces a line containing both the code and the orphaned file path. Agents running `engine inspect --watch` now see the warning the moment they drop a new file under `runtime/`.

### Deliverables

- `examples/beacon-world/src/drone-palette.ts` (new shared helper)
- `examples/beacon-world/src/systems/remote-presence-decorator-system.ts` (uses shared palette)
- `examples/beacon-world/bootstrap.ts` (`tintLocalDrone` on networked boot)
- `examples/beacon-world/tests/unit/drone-palette.test.ts`
- `examples/beacon-world/assets/runtime/materials/hazard-warning.material.json`
- `examples/beacon-world/assets/runtime/materials/hazard-amber.material.json`
- `examples/beacon-world/scenes/start.scene.json` (hazards use named materials)
- `examples/beacon-world/assets/_sources/asset-sources.json` (hazard-materials entry)
- `engine/tools/cli.ts` (NDJSON when `--watch --json`)
- `tests/unit/project-inspect-stable.test.ts` (diagnostics-in-formatInspection assertion)

### Verification

- `engine check` green on every `examples/*/project.json`.
- Sprint-close `npm run preflight`: typecheck clean, 192 Vitest tests across 28 files (+5 palette, +1 diagnostics-echo), vite build OK, 12 Playwright e2e tests.
- Manual: `npm run engine:inspect -- examples/beacon-world --watch --json --tail 1` emits a single JSON line per refresh.

### Goal Recap

The sprint goal — close the visible-polish gap that multiplayer left open and make the agent's watch loop a first-class data stream — was met:

- Both tabs in a two-tab session now see the local drone in the same palette colour. No more "alpha sees grey, bravo sees orange". The palette is a single source of truth (`drone-palette.ts`) used by both the decorator and the local tinter.
- `engine inspect --watch --json` is now usable as a continuous data feed for any agent / tool that wants to react to scene changes.
- Hazards visually distinguish themselves via materials instead of inline `MeshRenderer.color`, which pairs with the existing material HMR audit so future palette tweaks live-reload.
- The inspect diagnostics contract is now under test: an undeclared runtime asset will always surface in the human output (and in JSON `result.diagnostics`).

### Follow-Ups

- `10.5` C#/.NET reference skeleton still pending.
- `10.18` Server-side hazard / pickup state still pending; would make hazards / cores consistent across browser tabs.
- `13.12` Sound pings still pending.
- `E.16` Dynamic renderer import (lazy `engine/render/`) still pending — main bundle is dominated by Three.js + AJV.

## Sprint 25 - Diagnostic Codes + Bundle Budget + Carry Tint + Lazy Three + C# Skeleton

Status: Completed and archived.

### Completed Work

- `E.17` Inspect stream schema doc — new `docs/agent/inspect-stream.md` documents the NDJSON wire contract of `engine inspect --watch --json`: one `InspectResult` per line, status logs on stderr, no terminator, debounced at ~120 ms. Includes a `jq` recipe.
- `14.13` Typed diagnostic codes — new `engine/tools/check/diagnostic-codes.ts` exports `DIAGNOSTIC_CODES` const-as-enum + `DiagnosticCode` type + `ALL_DIAGNOSTIC_CODES` array. Future CI / agent tooling can import and pattern-match. Unit test locks the full set.
- `E.18` Bundle-size budget — new `scripts/check-bundle-size.mjs` walks `dist/assets/*.js`, gzips, asserts the **largest** chunk stays under 250 KB gzipped. Wired into `preflight` between `build` and `test:e2e` via new `npm run bundle:check`.
- `13.23` HUD pulse on score change — scoreboard rows that incremented since the last refresh paint themselves green for ~600 ms via a CSS `color` transition. `data-pulse="true"` attribute lets future e2e check.
- `13.21` Core palette while carried — `Pickup` schema gains optional `originalColor` / `originalMaterial` runtime fields. `pickup-system` swaps the carried core's `MeshRenderer.material` to a palette entry hashed off the carrier's `Presence.playerId` (`pickDroneMaterialFor`), stashes the original on `Pickup`. Deposit clears the stash and restores. Hazard-drop path leaves the stash in place — `tickPickupRespawns` restores on respawn. Three unit cases cover the multiplayer tint, the single-player no-tint path, and the hazard-drop → respawn restore path.
- `E.20.5` Asset-source runtime missing — `engine check` now scans the reverse direction too: every `asset-sources.json` `runtimeFiles` entry must exist on disk, otherwise emits `AGF_ASSET_SOURCE_RUNTIME_MISSING` (warning). New fixture `declared-but-missing/` + unit test.
- `E.16` lite — Three.js + AJV split into dedicated chunks — `vite.config.ts` adds a `manualChunks` function that lifts `three` (149 KB gzipped) and `ajv` (33 KB gzipped) into their own cached chunks. Main `index-*.js` drops from 191 KB gzipped to **9.27 KB gzipped**.
- `10.5` C#/.NET reference skeleton — new `examples/backends/dotnet-world-server/` with `GameServer.csproj` (net9.0, console exe) + `Program.cs` that mirrors the Node smoke path: locate the repo's `schemas/protocol.schema.json`, parse a `player.join` / `player.leave` / `intent.move` / `world.snapshot` sample with `System.Text.Json`, exit non-zero on any parse failure. `npm run backend:dotnet` script. `.gitignore` excludes `bin/` / `obj/`.

### Deliverables

- `docs/agent/inspect-stream.md`
- `engine/tools/check/diagnostic-codes.ts`
- `tests/unit/diagnostic-codes.test.ts`
- `scripts/check-bundle-size.mjs`
- `package.json` (`bundle:check`, `backend:dotnet`, `preflight` chain)
- `examples/beacon-world/src/ui/health-hud.ts` (score pulse, `data-pulse`)
- `examples/beacon-world/schemas/scene-extensions.schema.json` (`Pickup.originalColor` / `originalMaterial`)
- `examples/beacon-world/src/systems/pickup-system.ts` (`applyCarryTint` / `clearCarryTint` / respawn-restore)
- `engine/tools/check/project-check.ts` (reverse-direction asset diagnostic)
- `tests/fixtures/declared-but-missing/`
- `vite.config.ts` (`manualChunks` function for `three` + `ajv`)
- `examples/backends/dotnet-world-server/` (`GameServer.csproj`, `Program.cs`, `README.md`)
- `.gitignore` (`**/bin/`, `**/obj/`)
- `HIGH_LEVEL_BACKLOG.md` (M1–M12 from codex review M-section folded in)

### Verification

- `engine check` green on every `examples/*/project.json`.
- Sprint-close `npm run preflight`: typecheck clean, 198 Vitest tests across 29 files, vite build OK with per-library chunks visible, `bundle:check` reports largest chunk under the 250 KB gzipped budget, 12 Playwright e2e tests.
- Manual: `npm run backend:dotnet` parses all four samples cleanly.
- Manual: `npm run engine:inspect -- examples/beacon-world --watch --json --tail 1` continues to emit one JSON line per refresh.

### Goal Recap

The sprint goal — double sprint size (8–10 stories) and pay down a wider polish backlog while the netcode work cools off — was met:

- The inspect stream is now a documented wire contract; external agent tooling can rely on the line shape.
- Diagnostic codes are a typed enum; CI matchers stop using string-literal substrings.
- Bundle-size has a guardrail in `preflight`; routine deps cannot creep past it silently.
- Cores visually advertise the player carrying them; the palette is shared between local and remote drones (Sprint 24) and now pickups too.
- `engine check` catches the reverse asset-mismatch — declared-but-missing — in addition to the existing undeclared-but-present check.
- Three.js + AJV are split into their own cached chunks; the application chunk is now small enough to be irrelevant to load time.
- A C#/.NET reference backend skeleton anchors ADR-0007's promise that the protocol contract is backend-agnostic.

### Follow-Ups

- `10.18` Server-side hazard / pickup state still pending; would make hazards / cores consistent across browser tabs.
- `13.12` Sound pings still pending.
- C# skeleton runs schema-existence + parse-only smoke; replacing that with a real `Json.Schema` validator parity-with-AJV is a future story.
- Per the `Notes/codex_review_1.md` M-section landed in `HIGH_LEVEL_BACKLOG.md`: **M5 runtime diagnostics bus** and **M11 resource lifecycle / leak tests** are the next two engine priorities.

## Sprint 26 - Runtime Diagnostics Bus + Resource Lifecycle Tests + Renderer Boundary

Status: Completed and archived.

### Completed Work

- `E.22` `RuntimeDiagnosticsBus` core — new `engine/runtime/diagnostics/diagnostics-bus.ts` with typed `RuntimeDiagnostic` (`severity`, `code`, `source`, `message`, optional `entityId`/`component`/`assetRef`/`details`), bounded ring buffer (default 200), monotonic ids, subscriber pattern with listener isolation. 7 unit tests.
- `E.23` `AssetRegistry` emits diagnostics — `AGF_RUNTIME_ASSET_NO_LOADER` on missing matcher, `AGF_RUNTIME_ASSET_LOAD_FAILED` with `details: { loader, reason }` on rejection. Two new integration tests.
- `E.24` `WsNetworkAdapter` emits diagnostics — non-JSON frame, invalid frame, snapshot-gap resync, id collision all route to the bus alongside the existing log lines.
- `E.25` HUD diagnostics overlay v0 — `engine/runtime/diagnostics/diagnostics-overlay.ts` mounts a DEV-only compact panel that shows the last 8 warnings/errors (info filtered out). Subscribes to the bus, hides when empty.
- `E.26` `window.__agf.rendererInfo()` — `ThreeRenderer.info()` returns `{ geometries, textures, programs, drawCalls, triangles, meshes }` straight from Three's `info` object plus the local mesh map. Plumbed through `AppHandle.rendererInfo` and the DEV `__agf` global.
- `E.27` HMR reload stress test — new `tests/e2e/hmr-stress.spec.ts` touches `drone.material.json` 30 times in a row and asserts the renderer's geometry / texture / program / mesh counts stay within +4 of the baseline. Catches HMR-introduced leaks before they accumulate.
- `E.28` Adapter create/dispose stress — new vitest case creates and disposes the WS adapter 50 times against a fake socket and asserts no local entities leak (server-owned ids are removed by `dispose`). 50 socket constructions, zero residual entities.
- `13.24` Score-pulse e2e — new `tests/e2e/score-pulse.spec.ts` seeds Presence on the local drone, drives one pickup → deposit cycle, asserts the `hud-score-alpha` row paints `data-pulse="true"`. HUD now tracks a 600 ms expiry timer per playerId so the pulse stays observable across Playwright's polling window.
- `14.16` Hazard material HMR lock — new `tests/e2e/hazard-material-hmr.spec.ts` touches both `hazard-warning.material.json` and `hazard-amber.material.json` and asserts both fire `agf:asset-changed`. Explicit lock alongside the existing material audit.
- `E.21` Renderer import boundary — new `tests/unit/renderer-import-boundary.test.ts` walks `engine/**/*.ts`, asserts that no file outside `engine/render/` imports the `three` package. Locks the boundary for future headless tooling.

### Deliverables

- `engine/runtime/diagnostics/diagnostics-bus.ts`
- `engine/runtime/diagnostics/diagnostics-overlay.ts`
- `engine/runtime/asset-registry.ts` (diagnostic emit)
- `engine/runtime/network/ws-network-adapter.ts` (diagnostic emit)
- `engine/render/three-renderer.ts` (`info()` snapshot)
- `engine/runtime/start.ts` (`RuntimeHandle.diagnostics`)
- `src/app.ts`, `src/main.ts` (`AppHandle.diagnostics` / `clearDiagnostics` / `rendererInfo`; `window.__agf` extensions)
- `examples/beacon-world/src/ui/health-hud.ts` (600 ms pulse expiry timer)
- `tests/unit/diagnostics-bus.test.ts`
- `tests/unit/asset-registry.test.ts` (+2 diagnostics integration cases)
- `tests/unit/ws-network-adapter.test.ts` (+1 create/dispose stress)
- `tests/unit/renderer-import-boundary.test.ts`
- `tests/e2e/hmr-stress.spec.ts`
- `tests/e2e/score-pulse.spec.ts`
- `tests/e2e/hazard-material-hmr.spec.ts`

### Verification

- `engine check` green on every `examples/*/project.json`.
- Sprint-close `npm run preflight`: typecheck clean, **209 Vitest tests across 31 files**, vite build OK with the manualChunks split still intact, `bundle:check` under the 250 KB budget, **15 Playwright e2e tests** (three new — HMR stress, score pulse, hazard material HMR).
- Manual: `window.__agf.diagnostics()` returns the bus snapshot; `window.__agf.rendererInfo()` returns the WebGL counters.

### Goal Recap

The sprint goal — fold `M5` (runtime diagnostics) and `M11` (resource lifecycle / leak tests) from the codex M-list into the running runtime, plus the renderer-boundary lock — was met:

- Agents now have a structured runtime error channel. Asset and network problems land on a typed bus that the dev overlay reads and that tests can assert against.
- Renderer info is queryable; HMR can't silently leak resources because the stress test will catch it. The 30-touch test asserts a tight +4 envelope.
- The "only engine/render/ may import three" contract is now under unit-test, so future headless tooling won't accidentally drag Three into a CLI bundle.
- HUD score pulse stays visible long enough for an external observer (Playwright, agent polling) to catch it.

### Follow-Ups

- `10.5+` C# skeleton transport (WebSocket) still pending.
- `10.14` Server-authoritative carry, `10.16` Snapshot delta encoding, `10.18` Server-side hazard / pickup state still pending.
- `13.12` Sound pings still pending.
- Diagnostics overlay is read-only; a future story can add a "copy as JSON" / "open trace" button for human use.

## Sprint 27 - AI-native CLI + Project Versioning + Perf Budgets

Status: Completed and archived.

### Completed Work

- `E.52` `engine summarize <projectDir>` — new `engine/tools/summarize/project-summarize.ts` walks the project and emits metadata, component vocabulary (project-local + project-extension), scene entity-component counts, declared asset entries and playtest list. Human + `--json` output, wired through `engine/tools/cli.ts` as `engine summarize` and `npm run engine:summarize`.
- `E.56` `engine doctor <projectDir>` — new `engine/tools/doctor/project-doctor.ts` consolidates `checkProject`, `summarizeProject` and optional `performance-budget.json` read. `compareRendererInfo(info, budget)` returns soft/hard violations against any caller-supplied `rendererInfo` (live or captured). Exits 1 on errors, 0 otherwise. Wired as `engine doctor` + `npm run engine:doctor`.
- `E.54` `engine asset import <projectDir> <sourceFile> --id <id>` — new `engine/tools/asset/asset-import.ts` copies the source file into `assets/runtime/<subdir>/` (auto-detect `models`/`materials`/`misc` from extension) and appends an entry to `_sources/asset-sources.json`. Optional `--kind`/`--license`/`--notes`/`--subdir` flags. Wired as `engine asset import` + `npm run engine:asset`.
- `E.53` Template contract — new `schemas/template.schema.json` plus per-project `template.json` and `template_context.md` for `hello-3d` and `beacon-world`. Defines `templateId`, `name`, `summary`, `gameplayVocabulary`, `extensionPoints`, `templateContextFile`.
- `E.57` `agfFormatVersion` added to `schemas/project.schema.json` (optional integer ≥ 1) and the two reference projects' `project.json`. Format-version helpers under `engine/tools/check/format-version.ts` (`CURRENT_FORMAT_VERSION = 1`, `MIN_SUPPORTED_FORMAT_VERSION = 1`, `readFormatVersion`).
- `E.58` `engine check` emits `AGF_FORMAT_VERSION_MISSING` (warning) when the field is absent, `AGF_FORMAT_VERSION_UNSUPPORTED` (error) when the file declares a version newer than `CURRENT`, and `AGF_FORMAT_VERSION_TOO_OLD` (warning) when older than `MIN_SUPPORTED`. New fixture `tests/fixtures/format-version-future/` plus two project-check unit tests.
- `E.59` `engine migrate <projectDir> [--dry-run]` v0 — new `engine/tools/migrate/project-migrate.ts` plans JSON patches (currently: add missing `agfFormatVersion`) and applies them by rewriting `project.json` with `agfFormatVersion` first. Three new unit tests using a tests/tmp sandbox.
- `E.60` Per-project `performance-budget.json` — new `schemas/performance-budget.schema.json` (renderer soft/hard for `geometries`/`textures`/`programs`/`drawCalls`/`triangles`/`meshes`; bundle soft/hard `largestChunkGzipKb`). Reference budgets shipped for `hello-3d` (renderer soft 4/hard 8) and `beacon-world` (renderer soft 12/16/8/12, hard 24/32/16/24).
- `E.61` `engine doctor` reads the budget when present, prints renderer + bundle thresholds, and exposes `compareRendererInfo(info, budget)` so callers can flag observed renderer state against soft/hard ceilings.
- `E.62` `window.__agf.copyDiagnostics()` — `AppHandle.copyDiagnostics()` serialises `runtime.diagnostics.snapshot()` to JSON, best-effort writes it to the OS clipboard via `navigator.clipboard.writeText`, and always returns the JSON string for paste fallback.

### Deliverables

- `engine/tools/summarize/project-summarize.ts`
- `engine/tools/doctor/project-doctor.ts`
- `engine/tools/asset/asset-import.ts`
- `engine/tools/migrate/project-migrate.ts`
- `engine/tools/check/format-version.ts`
- `engine/tools/check/project-check.ts` (`validateFormatVersion`)
- `engine/tools/check/diagnostic-codes.ts` (3 new codes)
- `engine/tools/cli.ts` (summarize/doctor/migrate/asset dispatchers + `--id/--kind/--license/--notes/--subdir/--dry-run` flags)
- `schemas/template.schema.json`, `schemas/performance-budget.schema.json`, `schemas/project.schema.json`
- `examples/hello-3d/{template.json,template_context.md,performance-budget.json}`
- `examples/beacon-world/{template.json,template_context.md,performance-budget.json}`
- `src/app.ts`, `src/main.ts` (`AppHandle.copyDiagnostics`, `window.__agf.copyDiagnostics`)
- `tests/fixtures/format-version-future/` (new project + scene + asset-sources fixtures)
- `tests/unit/migrate.test.ts`
- `tests/unit/project-check.test.ts`, `tests/unit/diagnostic-codes.test.ts` (updated)
- `package.json` — `engine:summarize`, `engine:doctor`, `engine:migrate`, `engine:asset` scripts

### Verification

- Sprint-close `npm run preflight`: typecheck clean, **214 Vitest tests across 32 files**, vite build OK (three chunk 144 kB gzip, well under the 250 kB bundle budget), all **15 Playwright e2e tests** green (18.6 s).
- Manual: `npm run engine:doctor -- examples/beacon-world` reports status OK, 10 declared assets, 3 playtests, prints renderer soft/hard plus bundle 200 / 250 KB.

### Goal Recap

Sprint 27 turned the M-list and AI-native ideas into agent-runnable commands:

- An agent dropped into a fresh checkout can now type `engine summarize`, `engine doctor`, `engine migrate` and `engine asset import` and get structured project context, a health scorecard, version migrations and an asset onboarding path.
- Project files now declare `agfFormatVersion`, so future format changes can fail fast with `AGF_FORMAT_VERSION_UNSUPPORTED` rather than misbehaving silently.
- Performance budgets are explicit per project — the renderer / bundle ceilings the doctor enforces now live next to the project, not in CI scripts.
- `window.__agf.copyDiagnostics()` removes one of the last "open DevTools to grab state" workflows from the agent path.

### Follow-Ups

- `E.63` Lazy renderer import — defer to Sprint 28; bundle budget is healthy.
- `E.61` follow-up: have `engine doctor` actually run `vite build --report` and compare bundle output against the budget (currently the budget is read but bundle comparison still requires `npm run bundle:check`).
- `10.5+` C# skeleton transport (WebSocket) still pending.
- `10.14` Server-authoritative carry, `10.16` Snapshot delta encoding, `10.18` Server-side hazard / pickup state still pending.
- `13.12` Sound pings still pending.

## Sprint 28 — Record/Replay v0, schema docs, lazy renderer, bundle doctor, Cyrillic CI, sound pings

Status: Completed and archived.

### Completed Work

- `E.65` Recorder core — new `engine/runtime/recording/recorder.ts` captures the initial scene + every applied `EngineCommand` with monotonic index + elapsed-seconds timestamp + optional `finalSnapshot`. `RuntimeHandle.startRecording()` / `stopRecording()` plumbs it through `applyCommands`.
- `E.66` `engine replay <file>` — new `engine/tools/replay/project-replay.ts` drives a headless `World` through a recorded command stream, emits the resulting snapshot, and supports `--expect <snapshot.json>` (otherwise compares against the recording's `finalSnapshot`). Drift produces exit code 1.
- `E.67` Record-replay unit tests — two cases in `tests/unit/record-replay.test.ts` lock the deterministic round-trip and the drift path.
- `E.63` Lazy renderer import — `startRuntime` now `await import("../render/three-renderer")`. `createApp` + the bootstrap in `src/main.ts` become async; the build splits a tiny `three-renderer-*.js` chunk separate from the main `three` chunk (4.8 KB / 1.7 KB gzip).
- `E.64` Bundle pass in `engine doctor` — doctor reads `dist/assets`, gzip-measures the largest JS chunk and folds soft/hard bundle violations into `DoctorReport.bundle`. A hard violation flips `report.ok` to false.
- `E.68` `engine docs <projectDir>` — new `engine/tools/docs/project-docs.ts` walks `schemas/*.schema.json`, renders a Markdown table per schema, copies the project's `template_context.md`, writes an `index.md`. Output is gitignored (`docs/generated/`) and regenerable via `npm run engine:docs`.
- `RH.1`/`RH.2` Cyrillic CI was already shipped (`.github/workflows/repo-hygiene.yml`). Added a sibling `typecheck-and-unit` job that runs `engine:check:examples` + `typecheck` + `vitest run` on every push and PR.
- `13.12` Beacon World sound pings — new `examples/beacon-world/src/audio/sound-pings.ts` emits three procedural beeps (`pickup`, `deposit`, `damage`) via Web Audio. `PickupSystem` and `HazardSystem` now expose typed `onEvent` callbacks; the Beacon bootstrap wires both into a shared `SoundPings` instance and disposes the `AudioContext` on teardown. Headless-safe (no `AudioContext` ⇒ silent no-op), with two unit tests.

### Deliverables

- `engine/runtime/recording/recorder.ts`
- `engine/runtime/start.ts` (`RuntimeHandle.startRecording`/`stopRecording`, lazy renderer import)
- `engine/tools/replay/project-replay.ts`
- `engine/tools/docs/project-docs.ts`
- `engine/tools/cli.ts` (`replay` + `docs` dispatchers + `--expect` flag)
- `engine/tools/doctor/project-doctor.ts` (bundle measurement + `BundleStat` + `--ok` gating on hard violation)
- `examples/beacon-world/src/audio/sound-pings.ts`
- `examples/beacon-world/src/systems/pickup-system.ts` (`PickupEvent`, `onEvent`)
- `examples/beacon-world/src/systems/hazard-system.ts` (`HazardEvent`, `HazardSystemOptions`, `onEvent`)
- `examples/beacon-world/bootstrap.ts` (audio wiring + dispose)
- `.github/workflows/repo-hygiene.yml` (new `typecheck-and-unit` job)
- `src/app.ts`, `src/main.ts` (async `createApp` + bootstrap)
- `package.json` (`engine:asset`, `engine:replay`, `engine:docs` scripts)
- `.gitignore` (`tests/tmp/`, `docs/generated/`)
- `tests/unit/record-replay.test.ts`, `tests/unit/sound-pings.test.ts`

### Verification

- Sprint-close `npm run preflight`: typecheck clean, **218 Vitest tests across 34 files**, vite build OK (lazy renderer split adds a dedicated 4.8 KB / 1.7 KB gzip chunk; `three` still 144 KB gzipped under the 250 KB hard budget), `bundle:check` green, all **15 Playwright e2e tests** green.
- Manual: `npm run engine:docs -- examples/hello-3d` renders 9 schemas + the project's template context into `docs/generated/hello-3d/`.
- Manual: `npm run engine:doctor -- examples/beacon-world` now also reports the measured largest chunk (`three-*.js` at 144 KB, level `none`).

### Goal Recap

Sprint 28 cleared the remaining "regression / docs / polish" gaps from the M-list:

- Record/replay is the foundation for headless deterministic regression bisection — every applied command now has a wire-format artifact that `engine replay` can re-execute and diff.
- The lazy renderer + bundle-doctor pair makes the `three` chunk's size a first-class metric of the doctor scorecard.
- `engine docs` turns the existing schemas into agent-ready Markdown without the agent having to load each `.schema.json`.
- CI now enforces typecheck + unit tests + project validation on every PR — previously only the Cyrillic check ran in CI; everything else lived in local preflight.
- Beacon World finally has audio feedback on the three core gameplay moments (pickup / deposit / damage); zero asset shipping cost because the cues are procedural Web Audio beeps.

### Follow-Ups

- M2-b deterministic seed for `Math.random` consumers (Beacon hazard pulse, pickup respawn) — still pending; needs a profile-flag-gated rng helper.
- `10.5+` C# skeleton WebSocket transport still pending.
- `10.14` Server-authoritative carry, `10.16` Snapshot delta encoding, `10.18` Server-side hazard / pickup state still pending.
- `M13` Project-file patch contract (parking-lot) — design + first slice.
- `E.64` follow-up — invoke `vite build` from `engine doctor` if `dist/` is missing, so the doctor can run from a clean checkout.

## Sprint 29 — Determinism primitive, project-file patches, prefab schema, doctor --build, CI build job

Status: Completed and archived.

### Completed Work

- **Hotfix** (out of cycle, merged via `fix/ci-engine-check-local-tsx`) — `scripts/engine-check-examples.mjs` now spawns the local `node_modules/.bin/tsx` instead of `npx tsx`, which on CI was re-installing tsx into the npx cache and failing to resolve `ajv`. PR #31.
- `E.70` Deterministic seeded RNG primitive — new `engine/core/util/seeded-rng.ts` (mulberry32) with `next` / `nextRange` / `nextInt` / `pick` / `state` and seven unit tests. **No beacon-world wire-up shipped** — `Math.random()` is not used by Beacon's hazard pulse or pickup respawn today, so the primitive sits ready until a system actually rolls dice.
- `E.73` Patch contract types + `applyPatch` library — `engine/tools/patch/project-patch.ts` defines `EnginePatch` (ordered `set` / `delete` / `insert` ops addressed by JSON pointer + target file). Pure; `--check` is in-memory dry-run, `--write` mutates files.
- `E.74` `engine patch <projectDir> <patch.json> [--check|--write]` CLI + `npm run engine:patch` script.
- `E.75` Five patch unit tests covering set dry-run, set write, insert at array, delete object key, and reject-malformed (no leading slash / missing file / insert pointed at non-array).
- `E.76` Prefab schema scaffold — `schemas/prefab.schema.json` defines `{ agfFormatVersion, id, components, tags?, description? }`. `engine check` walks `<projectDir>/prefabs/*.prefab.json` and emits `AGF_PREFAB_INVALID` on schema violations. Two new fixtures (`valid-project-with-prefabs`, `invalid-prefab`) + two new `project-check` unit tests. Scene-level `instances` expansion is **intentionally not shipped** here — that will follow once a sample project actually consumes prefabs.
- `E.77` `engine doctor --build` flag — when `dist/` is missing, doctor optionally invokes `npm run build` first so a fresh checkout can be scored end-to-end. Default behaviour unchanged.
- `RH.3` Build + bundle:check CI job — sibling to the Sprint 28 `typecheck-and-unit` job. A PR can no longer merge with a broken vite build or a chunk over the 250 KB gzipped budget.
- `E.78` `engine summarize` reports prefab count + lists every `*.prefab.json` so an agent reading the summary knows which prefabs exist before grepping.
- **`M15` investigation story** — added `M15 — Engine dev server` epic in `HIGH_LEVEL_BACKLOG.md` after the user pushed back on a clipboard/download draft of "live debug bridge". The single story (`E.80`) is an investigate-only ticket that will produce `docs/research/engine-dev-server-investigation.md` covering use cases, architecture options (Vite plugin vs sidecar), endpoint surface, security stance, and a sequenced implementation sprint plan. **Explicit non-goals:** no Ctrl-C/Ctrl-V, no file-download flows, no overlay "Copy bug report" buttons.

### Deliverables

- `engine/core/util/seeded-rng.ts`
- `engine/tools/patch/project-patch.ts`
- `engine/tools/cli.ts` (`patch` dispatcher, `--check`/`--write`/`--build` flags)
- `engine/tools/doctor/project-doctor.ts` (`DoctorOptions.build`)
- `engine/tools/summarize/project-summarize.ts` (`prefabs` field)
- `engine/tools/check/project-check.ts` (prefab validator) + `diagnostic-codes.ts` (`AGF_PREFAB_INVALID`)
- `schemas/prefab.schema.json`
- `scripts/engine-check-examples.mjs` (local tsx binary, no npx)
- `package.json` (`engine:patch` script)
- `.github/workflows/repo-hygiene.yml` (`build-and-bundle-check` job)
- `HIGH_LEVEL_BACKLOG.md` (M15 investigation epic + M2b/M13/M3 status updates)
- `tests/unit/seeded-rng.test.ts`, `tests/unit/patch.test.ts`, `tests/unit/project-check.test.ts` (+2 prefab cases)
- `tests/fixtures/valid-project-with-prefabs/`, `tests/fixtures/invalid-prefab/`

### Verification

- Sprint-close `npm run preflight`: typecheck clean, **232 Vitest tests across 36 files**, vite build OK (still under the 250 KB gzip bundle budget), all **15 Playwright e2e tests** green (15.8 s).
- Manual: `npm run engine:patch -- tests/fixtures/valid-project /tmp/patch.json --check` round-trips set / insert / delete ops; `engine doctor --build` builds when `dist/` is missing.

### Goal Recap

Sprint 29 was a "primitives + investigation" sprint:

- **Determinism primitive** is on the shelf for the first system that rolls dice.
- **Patch contract** opens the agent-authored edit channel — agents can produce reviewable JSON patches that the engine validates before mutating the repo.
- **Prefab schema** lays the foundation for de-duplication; the scene-level expansion follows when a project needs it.
- **Doctor self-build + CI build job** removes the "broken build slipped past local preflight" failure mode that hit Sprint 28's CI job on first run.
- **M15 investigation** captures the right shape for the next big arc (engine dev server) after the user explicitly rejected the clipboard/download draft. AGF stays agent-first.

### Follow-Ups

- `E.80` M15 investigation — write `docs/research/engine-dev-server-investigation.md`, then a sequenced implementation sprint.
- M3-b scene `instances` syntax + `expandScenePrefabs` once a sample project consumes a prefab.
- M2b-seed wire-up — when the first system actually rolls dice.
- M13 follow-ups — `engine patch` schema validation post-apply, AGF-command patch variant.
- Existing 10.x backend follow-ups still pending.

## Sprint 30 — Transform hierarchy, persistence v0, dev-server investigation

Status: Completed and archived.

### Completed Work

- `E.80` Engine dev-server investigation — produced `docs/research/engine-dev-server-investigation.md` settling **M15** as a Vite plugin (`apply: "serve"`) + page-side bootstrap that exposes `/__agf/*` HTTP + WS endpoints. Architecture decision (option A), endpoint surface (snapshot / diagnostics / renderer-info / bug-report / recording / commands / events SSE / asset-invalidate), security stance (localhost-only, DEV-only), and a 9-story sequenced implementation plan (M15-a → M15-i). Explicit non-goals: no clipboard / download / "Copy bug report" buttons.
- `M16-a` Transform hierarchy schema + diagnostics — `Transform.parent` added to `schemas/scene.schema.json` (optional, entity-id pattern). `engine/tools/check/project-check.ts` emits `AGF_TRANSFORM_PARENT_MISSING`, `AGF_TRANSFORM_PARENT_SELF`, `AGF_TRANSFORM_PARENT_CYCLE`. New fixture `tests/fixtures/transform-hierarchy` exercises all three failure paths plus a valid cart/wheel chain.
- `M16-b` Pure hierarchy resolver — `engine/core/transform/resolve.ts` exports `resolveHierarchy(inputs)` and `resolveWorldHierarchy(world)`. Topo-sorts entities and composes 4x4 column-major transform matrices (XYZ Euler in radians, decomposed back to Euler XYZ). 9 unit tests cover flat, single parent, deep chain (order-independent), scale composition, rotation-via-child-position, self-ref / missing / cycle errors.
- `M16-c` Renderer consumes the resolver — `ThreeRenderer.render()` builds resolved transforms once per frame (degrees → radians applied upfront) and applies world transforms to camera + meshes. Renderer no longer reads `Transform` directly past the resolver call. Defensive fallback: if resolution fails, identity-per-entity instead of a crash.
- `M16-d` `engine inspect` surfaces hierarchy — `InspectEntity` now carries optional `parent` and `worldPosition`. `formatInspection` renders inline: `- cart.wheel: Transform  (parent: cart.root)  worldPosition=[10.000, 0.000, 1.000]`. Decoration short-circuits when a scene has no parent links. New fixture `tests/fixtures/valid-hierarchy` + 2 unit tests.
- `M3-b` Scene-instance expander — `instances: [{ id, prefab, overrides? }]` added to `schemas/scene.schema.json`. `engine/core/scene/expand-prefabs.ts` is a pure function: given a scene + a `Map<id, PrefabDefinition>` it returns a flat entity list with per-instance shallow override merge. Two new diagnostics: `AGF_SCENE_INSTANCE_PREFAB_MISSING`, `AGF_SCENE_INSTANCE_DUPLICATE_ID`. 6 unit tests. No engine-side scene-load integration yet — pure function only.
- `M13-c` `engine patch` post-apply validation — `applyPatch` now accepts `validateAfter: true` (default for the CLI). On `--check`, copies the project to a tmp scratch, writes in-memory results, runs `checkProject` against the scratch, returns diagnostics in `result.postCheck`. On `--write`, validates the live dir after writing. `result.ok` flips to false on post-check failure. A new unit test patches `project.json#startScene` to a missing path: op-level diagnostics empty, postCheck.ok false, `AGF_PROJECT_START_SCENE_MISSING` reported.
- `M4-a` Persistence primitives — `engine/runtime/persistence/local-store.ts` defines the `LocalStore` interface with `createMemoryStore()` (tests / headless) and `createIndexedDbStore(dbName)` (browser). `saveKey(projectId, profile, slot?)` builds the canonical `agf/<projectId>/<profile>/<slot>` key. `engine/runtime/persistence/save-load.ts` implements per-entity allowlisted persistence (no implicit "save everything"), format-versioned blob, projectId guard on load, scene-authoritative entity lifetime. 6 unit tests cover the round trip + edge cases.
- `M4-b` Runtime / AppHandle / window.__agf wiring — `RuntimeOptions.persistence`, `RuntimeHandle.save / load / clearSave` (throws when persistence isn't wired). `src/app.ts` constructs the IndexedDB store (falls back to memory in non-browser) from `ProjectMeta.persistence`. `window.__agf.save / load / clearSave` exposed under the existing DEV gate.
- `M4-c` Beacon World persistence proof — `examples/beacon-world/project.json` carries `persistence.components = ["Repairable", "WorldSignal", "Scoreboard"]`. New `schemas/project.schema.json#persistence` definition. Integration test `tests/unit/persistence-beacon.test.ts` round-trips a repaired beacon + degraded world signal through save/load and verifies non-allowlisted components are NOT persisted. Full-page-reload e2e proof is deferred to Sprint 31.

### Deliverables

- `docs/research/engine-dev-server-investigation.md`
- `schemas/scene.schema.json` (`Transform.parent`, `instances`)
- `schemas/project.schema.json` (`persistence`)
- `engine/tools/check/project-check.ts` (`validateTransformHierarchy`)
- `engine/tools/check/diagnostic-codes.ts` (3 new transform codes)
- `engine/core/transform/resolve.ts`
- `engine/core/scene/expand-prefabs.ts`
- `engine/render/three-renderer.ts` (resolver wiring)
- `engine/tools/inspect/project-inspect.ts` (hierarchy decoration)
- `engine/tools/patch/project-patch.ts` (`validateAfter` + postCheck plumbing)
- `engine/runtime/persistence/{local-store,save-load}.ts`
- `engine/runtime/start.ts` (`RuntimeHandle.save/load/clearSave`)
- `src/app.ts`, `src/main.ts` (`AppHandle` + `window.__agf` persistence surface)
- `examples/beacon-world/project.json` (persistence config)
- `tests/fixtures/transform-hierarchy/`, `tests/fixtures/valid-hierarchy/`
- `tests/unit/transform-resolve.test.ts`
- `tests/unit/inspect-hierarchy.test.ts`
- `tests/unit/expand-prefabs.test.ts`
- `tests/unit/persistence.test.ts`, `tests/unit/persistence-beacon.test.ts`
- `tests/unit/project-check.test.ts`, `tests/unit/diagnostic-codes.test.ts`, `tests/unit/patch.test.ts` (extended)

### Verification

- Sprint-close `npm run preflight`: typecheck clean, **259 Vitest tests across 41 files**, vite build OK (`three` chunk 144 KB gzip under 250 KB), `bundle:check` green, all **15 Playwright e2e tests** green.
- Manual: `npm run engine:check -- examples/beacon-world` accepts the new `persistence` field; rejecting a malformed prefab still emits `AGF_PREFAB_INVALID`; `Transform.parent` cycles still report.

### Goal Recap

- **Composition is now unblocked.** Hierarchy went from "would need to retrofit later" to a schema + resolver + renderer + inspect surface that everyone uses. The hard schema bump is paid; future stories (cascade delete, prefab parent rewiring) layer on top without touching the format.
- **Persistence v0** opens local save/load with an explicit allowlist. The agent loop now has a deterministic way to test save-state assumptions even before a full Playwright reload proof lands.
- **Patch validation closes the loop** the patch contract opened — an agent learns *immediately* whether a patch leaves the project well-formed, before the file write.
- **The dev-server epic is sequenced.** Sprint 31 starts from a concrete plan instead of a sketch.

### Follow-Ups

- `M15-a` plugin scaffold + health endpoint (start of dev-server implementation).
- `M16-cascade` Cascade-delete commands when a parent is removed; current path leaves orphan transforms in the world (engine check catches them next run, but runtime should handle it inline).
- `M16-renderer-optim` The resolver runs every frame; for large scenes a dirty-flag-driven cache would help. Premature for current entity counts.
- `M3-c` Beacon adopts prefabs once `expandScenePrefabs` is wired into scene load (still pure-function-only as of Sprint 30).
- `M4-reload-e2e` Playwright spec that reloads the page and asserts persisted Beacon state survives.
- `M2b-seed` deterministic RNG wire-up (still waiting for a system that rolls dice).
- `10.5+` C# WS transport and the rest of 10.x.

## Sprint 31 — Hello-3d hierarchy showcase + Engine dev server (M15-a → M15-h)

Status: Completed and archived.

### Completed Work

- **Hello-3d hierarchy showcase** — `examples/hello-3d/scenes/start.scene.json` now demonstrates the Sprint 30 M16 resolver end-to-end: 7 new entities (one invisible `arena.root` + 6 children) forming three composition cases — wide platform parented to root, tower (base → 45°-rotated crown → tall spire, depth 3), and a 60°-tilted satellite disc with a beacon child that inherits the tilt + the disc's squashed Y scale. New `tests/unit/hello-3d-hierarchy.test.ts` (4 cases) locks the world positions hand-computed against the resolver math; new `tests/e2e/hello-3d-hierarchy.spec.ts` opens the page in Chromium, asserts all 10 entities are in `__agf.snapshot()`, checks for zero error diagnostics, and saves `test-results/hello-3d-hierarchy.png` for visual review. Visual confirmation: tower stacking, crown rotation, and disc tilt all render correctly.
- `M15-a` `engine/dev/agf-dev-bridge.ts` Vite plugin (`apply: "serve"`) registering `/__agf/*` middleware on the dev server. `GET /__agf/health` returns `{ ok, version, page }`. Unknown `/__agf/*` paths return a structured `AGF_BRIDGE_ROUTE_UNKNOWN` 404 instead of falling through to the SPA index. Production builds verified to exclude the plugin (no `/__agf/` strings in `dist/`).
- `M15-b` WebSocket bridge at `/__agf/ws`. Server-side single-page invariant: the latest connected page wins; the previous receives `{ kind: "displaced" }` and is closed. Page side (`engine/dev/page-bridge.ts`) opens the WS under `import.meta.env.DEV` and sends a `hello` handshake with `{ projectId, profile }`; the plugin logs the connection.
- `M15-c` Pull endpoints — `GET /__agf/{snapshot,diagnostics,renderer-info,reload-events}` proxy through the WS RPC layer with a 3 s timeout and structured `AGF_BRIDGE_PAGE_NOT_CONNECTED` / `AGF_BRIDGE_PAGE_TIMEOUT` envelopes.
- `M15-d` `GET /__agf/bug-report` composes snapshot + diagnostics + renderer-info + reload-events plus the connected page's project id and an ISO `capturedAt` into one `AgentBugReport`. New `schemas/bug-report.schema.json` defines the shape.
- `M15-e` `POST /__agf/recording/start` and `/__agf/recording/stop` forward to `app.startRecording` / `app.stopRecording` (Sprint 28 plumbing now surfaced on `AppHandle` + `window.__agf`). `/stop` returns the captured `Recording` JSON.
- `M15-f` `POST /__agf/commands` (body `{ commands }`) lets an agent edit the running scene live. Malformed body returns `AGF_BRIDGE_INVALID_COMMANDS` / `AGF_BRIDGE_INVALID_JSON`. Live edits show up in the next `/snapshot`.
- `M15-h` `POST /__agf/asset/invalidate` (body `{ ref }`) triggers `runtime.invalidateAsset(ref)` over the bridge.
- `engine/dev/page-bridge.ts` polish — auto-reconnect 250 ms after every unexpected WS close so a displaced page slips back into the active slot when the displacer goes away. Plus a dedicated `playwright.dev-bridge.config.ts` (workers=1, fullyParallel=false) so the bridge spec gets exclusive access; `npm run preflight` now runs both the default and the dev-bridge config.

### Deliverables

- `examples/hello-3d/scenes/start.scene.json` (hierarchy showcase)
- `engine/dev/agf-dev-bridge.ts` (Vite plugin: HTTP + WS + 8 routes)
- `engine/dev/page-bridge.ts` (browser-side WS client with auto-reconnect)
- `vite.config.ts` (plugin wired)
- `src/app.ts`, `src/main.ts` (AppHandle.startRecording/stopRecording/reloadAsset surfaced on `window.__agf`)
- `schemas/bug-report.schema.json`
- `playwright.config.ts` + `playwright.dev-bridge.config.ts` + `package.json` script wiring
- `tests/unit/hello-3d-hierarchy.test.ts`
- `tests/unit/agf-dev-bridge.test.ts`
- `tests/e2e/hello-3d-hierarchy.spec.ts`
- `tests/e2e/dev-bridge.spec.ts` (4 cases: pull endpoints, commands, asset invalidate, recording)

### Verification

- `npm run preflight`: **268 Vitest tests across 43 files**, vite build OK, bundle:check green (three chunk 144 KB gzipped), **16 default e2e + 4 dev-bridge e2e** all pass.
- Manual: `curl http://127.0.0.1:5173/__agf/health` returns the connected page's projectId; `curl /__agf/snapshot` proxies the live world snapshot; `curl -X POST -H 'Content-Type: application/json' -d '{"commands":[...]}' /__agf/commands` injects commands into the running game.
- Visual: `test-results/hello-3d-hierarchy.png` shows the cart-style tower with 45°-rotated crown, vertical spire, and tilted satellite — all derived purely from the M16 resolver.

### Goal Recap

- **The hero ask from the user landed.** Hello-3d demonstrates the full M16 stack with non-trivial scale + rotation composition, and both unit + e2e verification lock it.
- **The engine dev server is real.** An agent can curl `/__agf/snapshot`, `/__agf/bug-report`, `/__agf/commands`, `/__agf/recording/*`, `/__agf/asset/invalidate` against a running tab — zero DevTools, zero clipboard, zero file-paste. The single piece of M15 still missing is SSE (M15-g) and an optional `engine connect` CLI wrapper.

### Follow-Ups

- `M15-g` SSE event stream (`GET /__agf/events`).
- `M15-multi-page` allow multiple concurrent pages on the bridge (drops the single-page invariant + the playwright workaround).
- `M15-i` `engine connect <url>` CLI.
- M16-cascade, M3-c, M4-reload-e2e, 10.x backend, M2b-seed wire-up still pending.

## Sprint 42 — follow camera + HDR env + bucket picking + M21 research

Status: Completed and archived.

### Completed Work

- `M21-shadow-pcss` doc gap — note explaining the S41 substitution targets the BASIC-shadowmap getShadow variant, not the modern PCF chunk. PCSS is currently a no-op on default-PCF projects. Follow-up `M21-shadow-pcss-modern` carries to Sprint 43.
- `M21-cam-follow` — new `FollowCamera { target, offset, lookAtOffset?, smoothing? }` component + FollowCameraSystem. Anchors camera to a target entity, computes Euler look-at via Three's -Z convention (`yaw = atan2(-dx, -dz)`, `pitch = atan2(dy, |dxz|)`), supports frame-rate-aware smoothing. 5 unit tests.
- `M21-env-hdr` — `scene.environment` gains `{ kind: "hdr", url, intensity? }`. Adapter uses RGBELoader + PMREMGenerator to pre-filter; previous environment stays applied until the new texture lands so the scene doesn't flash unlit. `SceneEnvironmentInput` becomes a discriminated union. 4 new schema tests.
- `M21-tsl-investigate` ✅ Research note at `docs/research/m21-tsl-investigation.md` — verdict: **defer until WebGPU lands**. TSL's node-graph verbosity beats inline GLSL ~10× in JSON LOC; pitch (one source → WebGL + WebGPU) only materialises after `M21-webgpu-spike`. Keep the S40/S41 GLSL paths.
- `M17-static-merge-spike` ✅ Research note at `docs/research/m17-static-merge-investigation.md` — verdict: **don't ship a static-merge primitive yet**. InstancedMesh (S35) + BatchedMesh (S40) cover every shipped project; static-merge's real target is 10k+ static-prop scenes that AGF doesn't have today. The more valuable follow-up was `M17-instance-picking-buckets` (now shipped).
- `M17-instance-picking-buckets` — `pickAtNdc` returns a discriminated `PickHit` covering Mesh / InstancedMesh / BatchedMesh slots. RuntimeHandle.pick resolves bucket slots by scanning entities with `BatchedMeshHandle` (O(N) on a click — cold path). Verified: clicking `batch-bench?seed=64`'s centre returns a `bench.<i>` entity instead of falling through.

### Deliverables

- `engine/render/systems/follow-camera-system.ts` (new)
- `engine/render/three-render-adapter.ts` — `EnvironmentSpec` union, RGBELoader hdr path, discriminated `PickHit` + bucket pick branches.
- `engine/render/shadow-pcss.ts` — doc gap on BASIC vs PCF scope.
- `engine/runtime/start.ts` — env-hdr narrow + pick bucket resolution.
- `engine/core/ecs/types.ts` — `SceneEnvironmentInput` discriminated union.
- `schemas/scene.schema.json` — `followCameraComponent`, `environment.kind: "hdr"` + allOf+if/then for `url`.
- `tests/unit/follow-camera-system.test.ts` (new) — 5 cases.
- `tests/unit/scene-environment-schema.test.ts` — 4 hdr cases.
- `docs/research/m21-tsl-investigation.md` (new).
- `docs/research/m17-static-merge-investigation.md` (new).

### Verification

- `npm run preflight` — 408 unit tests pass; e2e mixed (hmr-stress / multiclient flaky under parallel load, deterministic in isolation — verified by re-running just those specs).
- `beacon-world-gameplay.spec` ✅.
- Bucket pick smoke against `batch-bench?seed=64` returns a Batchable entity from the bucket.

### Follow-Ups

- `M21-shadow-pcss-modern` — rewrite PCSS substitution against the modern PCF chunk (Vogel disc + sampler2DShadow + `texture(...)`). Today's S41 implementation only hits the BASIC variant.
- `M21-shadow-pcss-csm` — extend the substitution into `three/addons/csm/CSMShader.js` so cascade-shadow scenes (`shadows-bench`) get PCSS too.
- `M21-cam-cinematic` — declarative camera-track playback with waypoint interpolation.
- `M21-webgpu-spike` — anchors the eventual `M21-tsl` decision.



## Sprint 41 — ASSET-compression rollout + camera + picking + PCSS

Status: Completed and archived.

### Completed Work

- `M25 / ASSET-compression` ✅ `createGlbLoader` defaults `meshopt: true` + `draco: true` (Three.js engages decoders only when the GLB declares the matching extension, so uncompressed projects pay zero cost). Beacon's procedurally-built GLBs stay canonical — the optimize pipeline's dedup pass would destroy build-script flat-shaded normals; documented as a known limit on the optimize CLI (it's for art-authored GLBs, not procedural).
- `M21-cam-orbit` ✅ New `OrbitCamera { target, distance, pitch, yaw, minDistance?, maxDistance? }` component + `OrbitCameraSystem` (frameUpdate, runs before CameraSyncSystem) resolves the polar coords into Transform.position + rotation. Input-agnostic — gameplay mutates OrbitCamera fields. 5 unit tests.
- `M17-instance-picking` ✅ `ThreeRenderAdapter.pickAtNdc(x, y)` does Raycaster.setFromCamera + iterates the per-entity Mesh map for the closest hit. MeshHandleRegistry gains `entityForHandle` (with mirror map). RuntimeHandle.pick / AppHandle.pick / `window.__agf.pick({ x, y })` return `{ entityId, point, distance }`. Verified end-to-end against Beacon. Instance-mesh resolution is the natural follow-up.
- `ASSET-decoder-vendor` ✅ Copied `node_modules/three/examples/jsm/libs/draco/` + `.../basis/` into `public/decoders/{draco,basis}/`. Default DRACO + KTX2 paths flipped from the three.js unpkg CDN to `/decoders/...`. Production / offline builds no longer hit the CDN.
- `RUNTIME-resource-leak-tests` ✅ Extended `hmr-stress.spec.ts` with a second case that creates + deletes 30 short-lived entities via applyCommands. Asserts `meshes === baseline`, `handleLeak === 0`, and geometries/programs grow by at most a small constant. Catches MeshLifecycleSystem regressions alongside the existing material-HMR coverage.
- `M21-mat-shader-files` ✅ Material manifest gains `vertexShaderRef` + `fragmentShaderRef` URL fields. MaterialBindingSystem fetches them in parallel, caches per URL, falls back gracefully on 404 / network errors. Inline `vertexShader` / `fragmentShader` still supported; refs take precedence when both are set.
- `M21-shadow-pcss` ✅ Percentage-closer soft shadows via shader-chunk substitution. New `engine/render/shadow-pcss.ts` ports three's `webgl_shadowmap_pcss.html` recipe. Schema `render.shadows.algorithm` enum gains `"pcss"`. Idempotent + process-wide. Beacon opts in — contact shadows under the drone soften with distance from the receiver. Known limit: CSM uses its own `CSMShader.js` and ignores the patched chunk; PCSS is a no-op on CSM scenes (shadows-bench) until a follow-up patches CSMShader.

### Drive-by fixes

- physics-bench light.sun shadow bias `-0.01 → -0.0008` + normalBias `0.4 → 0.1`. Falling dynamic bodies were losing their contact shadow as they approached the floor; the aggressive bias was pushing the shadow off the receiver.

### Deliverables

- `engine/render/glb-loader.ts` — `meshopt` / `draco` default-on.
- `engine/render/asset-decoders/decoders.ts` — vendored decoder paths.
- `engine/render/three-render-adapter.ts` — `pickAtNdc`, `PCSS` branch in `shadowAlgorithmType`, ShaderChunk apply hook.
- `engine/render/three-renderer.ts` — shadowAlgorithm forwarded into adapter.
- `engine/render/shadow-pcss.ts` (new).
- `engine/render/mesh-handle-registry.ts` — `entityForHandle` + mirror map.
- `engine/render/systems/orbit-camera-system.ts` (new).
- `engine/render/systems/material-binding-system.ts` — vertex/fragment shader ref fetcher.
- `engine/runtime/start.ts` — orbit registration, `pick` on RuntimeHandle.
- `engine/runtime/asset-loaders/material-loader.ts` — `vertexShaderRef`, `fragmentShaderRef`.
- `schemas/scene.schema.json` — `orbitCameraComponent`.
- `schemas/material.schema.json` — shader-ref fields.
- `schemas/project.schema.json` — `pcss` in `shadows.algorithm` enum.
- `examples/beacon-world/project.json` — `algorithm: "pcss"`.
- `examples/physics-bench/scenes/start.scene.json` — bias fix.
- `public/decoders/draco/` + `public/decoders/basis/` (vendored, ~4 MB total on disk; never in JS bundle).
- `tests/unit/orbit-camera-system.test.ts` (new) — 5 cases.
- `tests/unit/material-manifest-schema.test.ts` — `+1` shader-ref case.
- `tests/e2e/hmr-stress.spec.ts` — `+1` entity-leak case.

### Verification

- `npm run preflight` ✅ — 399 unit tests + 23 e2e passed, 2 flaky-retried. Dev server stayed alive throughout.
- `beacon-world-gameplay.spec` ✅ with `meshopt` decoder default-on + PCSS substitution active.
- Pick smoke against Beacon centre-of-screen returned the `ground` entity.

### Follow-Ups

- `M21-shadow-pcss-csm` — extend PCSS into `CSMShader.js` so cascade-shadow scenes (`shadows-bench`) also benefit.
- `ASSET-texture-compress` — KTX2 / Basis textures behind a `--textures` flag on `engine asset optimize`. Needs `basisu` binary + per-channel policy authoring.
- `M17-instance-picking-buckets` — resolve `instanceId → EntityId` against M17 InstancedMesh / BatchedMesh buckets so Batchable entities are pickable too.
- `M21-cam-follow` / `M21-cam-cinematic` — camera helpers on top of `M21-cam-orbit`.



## Sprint 40 — post-pipeline + LOD + asset CLI + shader-material

Status: Completed and archived.

### Completed Work

- `M21-post-pipeline` ✅ `project.json#render.post` declares an ordered post-processing chain validated by `oneOf` (`bloom` / `fxaa` v0). Adapter builds an EffectComposer lazily once an active camera exists; always appends an OutputPass for tone-mapping + sRGB conversion. draw() routes through composer.render() when active; resize() forwards setSize. Tried bloom on shadows-bench but it reproduced the S39 "scenes look overlit" feedback — final shadows-bench config opts in to FXAA only.
- `DEV-server-test-coexist` ✅ Verified `playwright.config.ts`' `reuseExistingServer: true` actually works — running `npx playwright test ...` while `npm run dev` is up does NOT touch the live server (PIDs on 5173 unchanged). The historical disruption was the agent killing 5173 unprompted. Locked the workflow rule into AGENTS.md.
- `ASSET-gltf-transform-investigate` ✅ Picks devDep + engine-owned CLI (`engine asset optimize`) over raw `npx gltf-transform`. Reasons: encoded policy (Beacon's UASTC normal / ETC1S diffuse / Meshopt geometry mix), reproducible regenerate via `assets/_sources/asset-sources.json`, single verb beside the rest of `engine check / inspect / doctor`. Written up at `docs/research/asset-gltf-transform-investigation.md`.
- `M17-lod` ✅ New `LOD` component on `MeshRenderer` entities lists `{ maxDistance, mesh, material?, color? }` levels. `LodSelectionSystem` runs in frameUpdate (between CameraSyncSystem + MeshLifecycleSystem), reads the active camera's position, picks the lowest-`maxDistance` level whose threshold the entity is inside, writes the level into MeshRenderer. `fallback: "hide"` removes MeshRenderer + stashes the restore values in a runtime-only `LodHidden` component; the system re-installs it when the entity comes back into range. 5 unit tests.
- `M21-mat-custom` ✅ Material manifest gains `shader: "custom"` + inline `vertexShader` / `fragmentShader` GLSL + an optional `uniforms` map (`#rrggbb` strings parsed as `Color`; numeric / array values pass through) + `defines` for #ifdef gating. Adapter constructs a Three.js `ShaderMaterial` with sensible defaults so an empty `custom` material still draws.
- `M21-shadow-algorithm` ✅ `project.json#render.shadows.algorithm: "pcf" | "vsm"` (default `"pcf"`) lets projects swap `WebGLRenderer.shadowMap.type` at startup. PCF stays the default since every existing project was tuned against it; VSM becomes opt-in for projects that want smoother penumbras (with the known light-leak tradeoff).
- `ASSET-optimize-command` ✅ New `engine asset optimize <projectDir>` walks every GLB/glTF under `<projectDir>/assets/_sources/`, runs `dedup → prune → weld → meshopt` via `@gltf-transform/functions`, emits a 1:1 mirror tree under `assets/runtime/`. Per-asset bytes-in / out / saved% printed; `--json` for the typed report. Drive-by fix: the existing `asset import` sub-command read positional[1] as the sub-name (always the project dir), so it never actually reached the import path — both sub-commands now read positional[0] correctly.

### Deliverables

- `engine/render/three-render-adapter.ts` — EffectComposer (RenderPass + UnrealBloomPass + FXAAPass + OutputPass), VSM/PCF shadow-algorithm switch, ShaderMaterial "custom" branch, MaterialPatch fields for shader source + uniforms + defines.
- `engine/render/three-renderer.ts` — forwards `shadowAlgorithm` + `color` into adapter options.
- `engine/runtime/start.ts` — `shadowAlgorithm` option propagated.
- `engine/runtime/asset-loaders/material-loader.ts` — `MaterialShader` adds `"custom"`; manifest fields.
- `engine/render/systems/lod-selection-system.ts` (new) — `LOD` resolution + `LodHidden`.
- `engine/runtime/inspect.ts` — `LodHidden` added to `RENDER_INTERNAL_COMPONENTS`.
- `engine/render/systems/material-binding-system.ts` — forwards new MaterialPatch fields.
- `engine/tools/asset/asset-optimize.ts` (new) — gltf-transform pipeline + `formatAssetOptimizeReport`.
- `engine/tools/cli.ts` — `engine asset optimize` dispatch + the asset-import positional-index fix.
- `schemas/project.schema.json` — `render.post` chain + `render.shadows.algorithm`.
- `schemas/scene.schema.json` — `lodComponent`.
- `schemas/material.schema.json` — `custom` shader + uniforms + defines + vertexShader/fragmentShader.
- `docs/research/asset-gltf-transform-investigation.md` (new).
- `AGENTS.md` — "Do not kill port 5173 between test runs" Hard Rule.
- `tests/unit/lod-selection-system.test.ts` (new) — 5 cases.
- `tests/unit/material-manifest-schema.test.ts` — `custom` accept / reject cases.

### Verification

- `npm run preflight` ✅ — 394 unit tests + 22 e2e passed, 2 flaky-retried (hmr-stress, score-pulse). Dev server stayed alive across the entire preflight run (PIDs on 5173 unchanged) — DEV-server-test-coexist verified.
- `beacon-world-gameplay.spec` ✅.
- post-pipeline smoke against shadows-bench (composer active + zero console errors) ✅.
- `engine asset optimize /tmp/beacon-fixture` ran the full pipeline cleanly against `drone.glb` + `core.glb`.

### Follow-Ups

- `M25 / ASSET-compression` — flip `createGlbLoader({ meshopt: true })` for a real project + verify runtime loads optimized GLBs. Foundation in place (S38 decoders + S40 optimize CLI).
- `ASSET-texture-compress` — add KTX2 / Basis texture compression to the optimize CLI behind a `--textures` flag once `basisu` toolchain is committed to.
- `RUNTIME-resource-leak-tests` — extend the existing hmr-stress coverage with an adapter-create/destroy cycle (currently covered for materials only).
- `M21-shadow-pcss` — PCSS chunk-substitution exploration; three.js doesn't ship it in core.

## Sprint 39 — static-mesh + decoder-paths follow-ups + renderer polish

Status: Completed and archived.

### Completed Work

- `M24-static-mesh` ✅ Trimesh + heightfield collider kinds. Scene schema gains per-kind `allOf+if/then` constraints (trimesh: `vertices` + `indices`, heightfield: `rows` × `columns` + row-major `heights` + `scale`). RapierAdapter.acquireCollider switches on the new kinds; heightfield maps `nrows = rows-1, ncols = columns-1` per Rapier's quad-count convention. `engine check` gains `AGF_RIGIDBODY3D_DYNAMIC_TRIMESH` (error), `AGF_COLLIDER3D_TRIMESH_LARGE` (warning, ≥50k vertices), `AGF_COLLIDER3D_HEIGHTFIELD_DIMS` (error). Spike `spikes/physics-rapier-v0/static-mesh-spike.ts` lands a dynamic ball on a 5×5 heightfield (y=0.299) + a slanted trimesh wedge (y≈0.30 after slide).
- `M24-character sensor-exclude fix` ✅ Carry-over hot-fix from Sprint 38: Rapier's KinematicCharacterController was treating sensor colliders as movement obstacles. Beacon's 1.2 / 1.6 m sensor radii (sized to gameplay pickup / deposit / hazard range) blocked the drone from approaching anything. `computeColliderMovement` now passes `QueryFilterFlags.EXCLUDE_SENSORS` so sensors still emit enter/exit events but stop pushing the character.
- `M21-context-loss` ✅ ThreeRenderAdapter subscribes to canvas `webglcontextlost` / `webglcontextrestored` events (with `preventDefault` on lost so the browser actually restores). startRuntime emits `AGF_RENDER_CONTEXT_LOST` (warning) + `AGF_RENDER_CONTEXT_RESTORED` (info) on the DiagnosticsBus. Listeners cleaned up in adapter.dispose.
- `M21-color` ✅ `project.json#render.color.{toneMapping, exposure}` (default toneMapping `"none"` — legacy linear) gives projects ACES Filmic / AgX / Reinhard / Cineon highlight roll-off on opt-in. Adapter maps the schema enum to the matching Three.js constant; the initial ACES default was reverted to "none" after a perceived overlit shift on Beacon.
- `RUNTIME-renderer-ready` ✅ `ThreeRenderer.render()` returns `true` iff there was an active camera + a real `adapter.draw()` ran. start.ts seeds `RuntimeHandle.rendererReady: Promise<void>` resolved on the first such draw. Exposed via `AppHandle.rendererReady` → `window.__agf.rendererReady` so tests + dev-bridge clients await it before snapshots / rendererInfo probes.
- `M21-mat-textures` ✅ Material manifest schema gains `map` / `normalMap` (+ `normalScale`) / `roughnessMap` / `metalnessMap` / `emissiveMap` (+ `emissiveIntensity`) / `aoMap`. MaterialPatch + MaterialBindingSystem forward through to `setMeshMaterialPatch`. Adapter holds a process-wide cached TextureLoader + URL→Texture Map so a shared map is fetched once. Base-colour gets SRGBColorSpace; data maps stay linear per glTF. KTX2 routing through the S38 decoder singletons is deferred to ASSET-compression.

### Deliverables

- `engine/physics/rapier/rapier-adapter.ts` — trimesh + heightfield branches in acquireCollider; EXCLUDE_SENSORS in computeColliderMovement
- `engine/physics/rapier/physics-sync-system.ts` — Collider3D mirror fields for trimesh / heightfield
- `engine/render/three-render-adapter.ts` — context callbacks, color pipeline, TextureLoader cache, texture-map application
- `engine/render/three-renderer.ts` — render() returns boolean
- `engine/runtime/start.ts` — `rendererReady`, context callbacks → diagnostics, color forwarding
- `engine/runtime/asset-loaders/material-loader.ts` — texture fields on MaterialManifest
- `engine/render/systems/material-binding-system.ts` — texture fields forwarded into MaterialPatch
- `engine/tools/check/project-check.ts` — `validatePhysicsColliders`
- `engine/tools/check/diagnostic-codes.ts` — 3 new codes
- `schemas/scene.schema.json` — trimesh + heightfield Collider3D kinds
- `schemas/material.schema.json` — texture-map fields
- `schemas/project.schema.json` — `render.color`
- `src/app.ts` + `src/main.ts` — rendererReady + color + context callbacks plumbed through
- `spikes/physics-rapier-v0/static-mesh-spike.ts` (new)
- `tests/fixtures/physics-static-mesh/` (new project-check fixture)
- `tests/unit/scene-physics-schema.test.ts` — 6 trimesh + heightfield cases
- `tests/unit/material-manifest-schema.test.ts` — 2 texture-map cases
- `tests/unit/project-check.test.ts` — AGF_RIGIDBODY3D_DYNAMIC_TRIMESH + AGF_COLLIDER3D_HEIGHTFIELD_DIMS case
- `tests/unit/diagnostic-codes.test.ts` — 3 new codes registered

### Verification

- `npm run preflight` ✅ — 387 unit tests + 21 e2e passed, 2-3 flaky-retried (the usual hmr-stress / multiclient-roundtrip / score-pulse set).
- `beacon-world-gameplay.spec` ✅ — drone pickup + repair end-to-end through the now-non-blocking sensor wiring.
- `project-switcher.spec` ("KeyD moves the Beacon World drone along +X") ✅.
- Raycast spike + Static-mesh spike both green end-to-end against real Rapier.

### Follow-Ups

- `M25 / ASSET-compression` — flip Draco / KTX2 / Meshopt flags on `createGlbLoader` for a real project, then route the texture-map loader through the shared KTX2Loader for `.ktx2` references. Foundation already in place (S38 decoders + S39 texture cache).
- `M21-mat-custom` — custom `ShaderMaterial` / `onBeforeCompile` shader kind for the manifest.
- `M21-post-pipeline` — schema-driven `project.json#renderer.post` chain (EffectComposer + Bloom / FXAA / SSAO / Outline).
- `DEV-server-test-coexist` — investigation: `playwright.config.ts` declares `reuseExistingServer: true` but preflight + ad-hoc test runs still sometimes interrupt the developer's live `npm run dev` on 5173. Tighten the probe or move headless tests to a separate port.



## Sprint 38 — character controller + physics raycast + bench polish

Status: Completed and archived.

### Completed Work

- `beacon-physics-character` ✅ New `CharacterMovementSystem` in `engine/physics/rapier/` runs in fixedUpdate BEFORE `PhysicsSyncSystem` for entities with `CharacterController3D` + kinematic `RigidBody3D`. Reads `Transform - body` as desired delta, optionally adds `gravity * gravityScale * fixedDt` (default scale 0), feeds `computeCharacterMovement` for collide-and-slide / autostep / snapToGround, applies via `setBodyNextKinematicTranslation`, mirrors resolved position back to Transform. Teleports (>1m delta) bypass and hard-set. `PhysicsSyncSystem.phase3` skips CC entities; `phase5b` writes post-step body position to Transform. `PhysicsBodyRegistry.colliderFor(entityId)` added. Beacon's drone adopts the component (maxSlopeDegrees 45, snapToGroundDistance 0.25, mass 3).
- `M24-raycast` ✅ `RapierAdapter.castRay(origin, direction, maxDistance)` wraps `castRayAndGetNormal` with `solid: true` and reverse-maps the hit through the internal handle table. `AppHandle.physics.raycast(...)` / `window.__agf.physics.raycast(...)` return `{ entityId, distance, point, normal }`. Spike `spikes/physics-rapier-v0/raycast-spike.ts` verifies vertical + horizontal hits + miss semantics.
- `M21-shadow-static` ✅ `project.json#render.shadows.autoUpdate` (default true). When false, `renderer.shadowMap.autoUpdate` is disabled at startup; `__agf.renderer.invalidateShadowMap()` schedules one re-render. `examples/shadows-bench` opts in — buildings + trees + rocks never move, cascade bakes once and stops re-rendering each frame.
- `M17-material-sharing-doctor` ✅ New `engine/tools/doctor/material-sharing.ts` scans `.material.json` manifests under `assets/{runtime,_sources}/materials/`, hashes shader kind + colour + opacity + PBR / clearcoat / sheen / iridescence / phong into stable signatures, reports duplicate groups. Hooked into `engine doctor` with a top-level recommendation. 3 unit tests.
- `M21-light-budgets` ✅ `RendererMetric` gains `lights` + `shadowCasters`; `compareRendererInfo` walks them. `schemas/performance-budget.schema.json` adds matching fields.
- `ASSET-decoder-paths` ✅ New `engine/render/asset-decoders/decoders.ts` — process-wide singletons for `DRACOLoader`, `KTX2Loader` (with `detectSupport(renderer)` re-issued on renderer change), `MeshoptDecoder`. `createGlbLoader({ renderer?, draco?, ktx2?, meshopt? })` reuses them. Scaffolding for `M25` ASSET-compression; no project opts in yet.
- `M17-batched-mesh-system` ✅ `Batchable.path?: "instanced" | "batched"` on scene schema. `BatchingSystem` grows a discriminated `BucketRecord`; the `BatchedRecord` path keys by `(colour + shadow + group)` and uses `acquireBatchedBucket` / `addBatchedGeometry` / `addBatchedInstance` / `setBatchedInstanceTransform` / `setBatchedInstanceGeometry`. Overflow on 512-instance / 16k-vertex / 32k-index caps emits a one-shot `AGF_BATCH_OVERFLOW` per bucket.

### Deliverables

- `engine/physics/rapier/character-movement-system.ts` (new) + `physics-body-registry.ts` (colliderFor) + `physics-sync-system.ts` (phase 3 skip + phase 5b writeback) + `rapier-adapter.ts` (`castRay`)
- `engine/render/three-render-adapter.ts` — `setShadowMapAutoUpdate` + `invalidateShadowMap`
- `engine/render/glb-loader.ts` + `engine/render/asset-decoders/decoders.ts` — opt-in compression helpers + singletons
- `engine/render/systems/batching-system.ts` — discriminated `InstancedRecord | BatchedRecord` + `updateInstanced` + `updateBatched`
- `engine/tools/doctor/material-sharing.ts` (new) + `project-doctor.ts` integration
- `src/app.ts` + `src/main.ts` — wire `CharacterMovementSystem` registration, `setShadowMapAutoUpdate`, `__agf.physics.raycast`, `__agf.renderer.invalidateShadowMap`
- `schemas/project.schema.json` — `render.shadows.autoUpdate`
- `schemas/scene.schema.json` — `Batchable.path`
- `schemas/performance-budget.schema.json` — `lights` + `shadowCasters` thresholds
- `examples/beacon-world/scenes/start.scene.json` — `CharacterController3D` on the drone
- `examples/shadows-bench/project.json` — `shadows.autoUpdate: false`
- `spikes/physics-rapier-v0/raycast-spike.ts` (new)
- `tests/unit/material-sharing-doctor.test.ts` (new) — 3 tests
- `tests/unit/physics-sync-system.test.ts` — stub adapter gains `castRay`

### Verification

- `npm run preflight` ✅ — full chain green; 378 unit tests + 21 e2e passed, 3 flaky-retried (hmr-stress, multiclient-roundtrip, score-pulse — the usual parallel-worker flake set, deterministic in isolation).
- `project-switcher.spec` ("KeyD moves the Beacon World drone along +X") ✅ — drone now moves through the character controller instead of direct Transform writes.
- `beacon-world-gameplay.spec` ✅ — pickup + repair end-to-end through the new pipeline (PhysicsSync phase 5b writeback + sensor-wired pickup-system from S37).
- Raycast spike: vertical hit on ground (distance 10, upward normal), horizontal hit on offset cube (distance 4.5), miss returns undefined.
- Batched-bucket probe: 4 mixed-mesh entities (box + sphere variants) → 1 batched bucket, `batchedBucketInstances: 4`, drawCalls 2.

### Follow-Ups

- `M24-static-mesh` — fixed-body `trimesh` + `heightfield` colliders from GLB assets. `engine check` warns on huge trimesh, rejects dynamic trimesh, validates heightfield dimensions. Carries to Sprint 39.
- Future `gravityScale` schema field on `CharacterController3D` if a project needs to author the value statically instead of via the runtime-only knob.



## Sprint 37 — CSM + physics polish + benches

Status: Completed and archived.

### Completed Work

- `examples/physics-bench/` ✅ Sibling of `batch-bench`. Camera + ambient + sun + fixed-collider ground + 4 walls; bootstrap seeds N dynamic primitive bodies (box/sphere, default 200) high above the floor that fall, collide, and settle. `?count=N&shape=box|sphere` URL params (count clamped 0..2048). Bodies use CCD to avoid tunnelling at speed. Collider sizes match visual meshes 1:1.
- `M21-frame-timing` ✅ `start.ts` samples `performance.now()` around each tick phase; once per metrics window (~500 ms) the accumulators flatten into a `FrameTiming` record `{ fixedUpdateMs, frameUpdateMs, renderMs, totalFrameMs, samples }`. Exposed via `RuntimeHandle.frameTiming()` → `AppHandle.frameTiming()` → `__agf.frameTiming()`. Dev overlay renders `fix / frm / rnd / ms` cells next to fps. Overlay also picks up `drawCalls` from `renderer.info()` as a batching-regression signal.
- `M24-debug` ✅ `RapierAdapter.getDebugLines()` exposes `world.debugRender()` (Float32Array vertices + RGBA colors). `ThreeRenderAdapter.setDebugOverlayEnabled(boolean)` / `setDebugOverlayData(...)` manage a single transparent `LineSegments` node in the scene (`renderOrder: 999`, `depthTest: false`). `PhysicsDebugSystem` (frame update, registered when `project.physics.enabled`) drives the overlay from a shared `enabled` flag. Surface: `__agf.physics.setDebugOverlay(boolean)` + `?physicsDebug=1` URL param.
- `M21-shadow-csm` ✅ `ThreeRenderAdapter.setCsm(config)` constructs `three/addons/csm/CSM.js` lazily — `rebuildCsm` runs the moment an active camera exists, registering every renderer-managed material through `setupMaterial`. Hooked at acquireMesh / acquireBucket / acquireBatchedBucket / setMeshMaterialPatch. `draw()` calls `csm.update()` before render. Camera-swap triggers full reconstruction. Schema lands on `project.json#render.shadows.csm` with cascades / maxFar / mode / shadowMapSize / shadowBias / lightDirection / lightIntensity.
- `examples/shadows-bench/` ✅ RTS-style showcase for CSM — 80×80 field + procedural "village" (28 buildings, 80 trees, 50 rocks). Deterministic LCG seed so screenshots reproduce. `RtsCameraSystem` (project-local under `src/systems/`) — WASD/arrows pan, mouse wheel + Q/E zoom, tilt authored once in the scene. `?buildings=N&trees=N&rocks=N` URL params. drawCalls 36 at default seed, soft cascade shadows visible under every prop.
- `M24-interpolation` ✅ `TimeContext` gains optional `physicsAlpha` in [0, 1]; runtime tick computes it from the leftover accumulator. `PhysicsSyncSystem` buffers `prev`/`curr` (position + rotation per dynamic body) in fixedUpdate and lerps in a new frameUpdate phase. Linear-degree blend on rotation is correct at 60 Hz steps. 120 Hz displays no longer show 60 Hz pulses for dynamic bodies. 7 unit tests cover alpha=0/0.5/1 + state churn.
- `beacon-physics-sensor-wiring` ✅ Pickups (cores) sensor radius 0.5 → 1.2, beacons 0.6 → 1.6, so sensor zones match the gameplay radii. `pickup-system.tryPickup` + `handleCarry` read `OverlappingTriggers3D` on the carrier when present, otherwise fall back to the full query + distance gate. `hazard-system` reads it on the hazard so the inner pulse-radius check walks only entities inside the outer sensor sphere. Both systems handle the physics-disabled case (no overlap data → same behavior as before).

### Deliverables

- `engine/runtime/start.ts` — per-phase frame timing + `physicsAlpha` plumbing + drawCalls into dev overlay
- `engine/runtime/dev-overlay.ts` — `drawCalls` + `frameTiming` cells
- `engine/render/three-render-adapter.ts` — `setCsm` / `setDebugOverlayEnabled` / `setDebugOverlayData` + CSM material registration hooks
- `engine/render/three-renderer.ts` — calls into adapter's debug + CSM controls
- `engine/physics/rapier/rapier-adapter.ts` — `getDebugLines()`
- `engine/physics/rapier/physics-sync-system.ts` — prev/curr buffer + frame interpolation
- `engine/physics/rapier/physics-debug-system.ts` (new) — drives the line-segments overlay
- `engine/core/loop/types.ts` — optional `physicsAlpha` on `TimeContext`
- `src/app.ts` + `src/main.ts` — wires CSM config, debug overlay toggle, frameTiming, URL params
- `schemas/project.schema.json` — `render.shadows.csm` block
- `examples/physics-bench/` (new project — `project.json`, `scenes/start.scene.json`, `bootstrap.ts`, `README.md`, `assets/_sources/asset-sources.json`)
- `examples/shadows-bench/` (new project — `project.json`, `scenes/start.scene.json`, `schemas/scene-extensions.schema.json`, `bootstrap.ts`, `src/systems/rts-camera-system.ts`, `README.md`)
- `examples/beacon-world/scenes/start.scene.json` — pickup/beacon sensor radii
- `examples/beacon-world/src/systems/{pickup,hazard}-system.ts` — sensor-driven candidate gates
- `tests/unit/physics-sync-system.test.ts` — interpolation cases (alpha=0/0.5/1)

### Verification

- `npm run preflight` ✅ — 374 unit tests + 20 e2e passed, 4 flaky-retried (hmr-stress, multiclient-roundtrip, score-pulse, app.spec — all deterministic in isolation). `bundle:check` clean (`rapier-*` and `three-*` vendor chunks under their separate budgets).
- shadows-bench probe at default seed: drawCalls 36, soft cascade shadows visible across the procedural village.
- physics-bench probe at default seed: drawCalls 17, buckets 12, bucketInstances 200, handleLeak 0, bodies settle to avgY ≈ 0.05.
- Beacon-world-gameplay e2e ✅ — drone picks up a core and repairs a beacon end-to-end through the new sensor-wired pickup-system.

### Follow-Ups

- `beacon-physics-character` — switch `player.drone` from `PlayerControlled` Transform writes to a `CharacterController3D` + a new `CharacterMovementSystem` that consumes input and queries the controller for collision-resolved motion.
- `M24-static-mesh` — fixed-body `trimesh` + `heightfield` colliders from GLB assets. `engine check` warns on huge trimesh, rejects dynamic trimesh, validates heightfield dimensions.
- `M17-batched-mesh-system` — wire the BatchedMesh adapter primitives behind `Batchable.path?: "instanced" | "batched"` in `BatchingSystem`. Bucketing for "batched" keys by `material + shadow + group` (mesh varies).
- `M24-raycast` — `runtime.physics.raycast({...})` returning `EntityId` + hit point/normal/distance; `runtime.physics.overlap({...})` for area queries.



## Sprint 36 — physics integration + cache polish + batched-mesh primitives + Beacon physics adoption

Status: Completed and archived.

### Completed Work

- `M24-sync` ✅ `engine/physics/rapier/physics-sync-system.ts` + `physics-body-registry.ts`. fixedUpdate System with 5 phases (acquire/release, kinematic push, step, sensors classify, dynamic writeback). Lazy-imports Rapier; registered by `startRuntime` when `project.physics?.enabled === true`. Project schema gains `physics: { enabled?, gravity?, fixedDt? }`. 6 unit tests with a stub adapter. Spike `spikes/physics-rapier-v0/sync-spike.ts` verified end-to-end with real Rapier.
- `M24-sensors` ✅ Adapter `drainEvents()` reads Rapier's `EventQueue`; PhysicsSyncSystem writes runtime-only `CurrentContacts3D` / `OverlappingTriggers3D` ECS components per fixed step. `entityForCollider` reverse lookup added to the body registry. Spike `spikes/physics-rapier-v0/sensor-spike.ts` confirms enter/exit events fire across a sensor box and on contact pairs.
- `M24-character` ✅ `CharacterController3D` component + adapter `acquireCharacterController` / `releaseCharacterController` / `computeCharacterMovement` / `setBodyNextKinematicTranslation`. Kinematic capsule wrapper around Rapier's `KinematicCharacterController` (offset / autostep / maxClimbSlope / minSlideSlope / snapToGround / up-vector). Spike `spikes/physics-rapier-v0/character-spike.ts` lands a capsule at y≈1.05 on a fixed ground collider.
- `M16-cache-d` ✅ Persistent `parent→children` index in `resolve-cached.ts` (`knownInputs` / `childrenIndex` / `parentOfStored`); helpers `updateChildLink` / `evictFromIndexes` keep the index incrementally in sync as scenes mutate. New `resolveDirtyDelta(world, inputs, dirtyIds)` performs a BFS over the dirty closure and returns only changed `LocalToWorld` entries. **Bench at 10k chain-of-8 @ 1%-dirty: ~1.94 ms** (~3× faster than cache-c, ~6.5× faster than no-cache).
- `M17-batched-mesh` ✅ (adapter primitives only) `acquireBatchedBucket` / `releaseBatchedBucket` / `addBatchedGeometry` / `addBatchedInstance` / `removeBatchedInstance` / `setBatchedInstanceTransform` / `setBatchedInstanceGeometry` / `batchedBucketLiveCount`. Internal `batchedBuckets` map + `nextBatchedBucketHandle`. `rendererInfo()` exposes `batchedBuckets` / `batchedBucketInstances`. System-layer wiring deferred to Sprint 37.
- `examples/batch-bench/` ✅ Perf-only project — camera + ambient + sun + ground; no project-specific systems. Bootstrap seeds a default 20×20 grid (400) of batchable cubes in 4 colours via `attachUi` → `runtime.applyCommands`. `?seed=N` URL param overrides (clamped 1..4096); `?seed=0` keeps the empty baseline. Bridge probe at default seed: `drawCalls: 5, buckets: 4, bucketInstances: 400, handleLeak: 0`.
- `M17-renderer-respect-batchable` ✅ Surfaced by `batch-bench`: the standalone renderer fallback (`refreshMeshes`) acquired a per-entity Mesh handle for every `MeshRenderer` regardless of `Batchable`, doubling draw calls and leaking handles when `MeshLifecycleSystem` had already filtered the entity. `engine/render/three-renderer.ts` now filters `Batchable` out of `refreshMeshes` the same way the system does. On the 400-box bench grid: `drawCalls 405 → 5`, `meshes 401 → 1`, `handleLeak 400 → 0`.
- `beacon-physics-adoption` ✅ `examples/beacon-world/project.json` enables `physics: { enabled: true, gravity, fixedDt }`. Scene declares: `ground` (fixed body + box collider), `player.drone` (kinematicPosition body + capsule, lockRotations), `beacons` (fixed body + capsule sensor), `cores` (fixed body + sphere sensor), `hazards` (fixed body + sphere sensor sized to `maxRadius`). Gameplay systems (`pickup-system`, `hazard-system`) still drive via Transform distance — sensor-event wiring + character-controller-driven movement are Sprint 37 candidates. Bridge probe: 8 bodies / 6 sensors / zero diagnostics; `beacon-world-gameplay.spec` green.
- `bundle-check-vendor-budgets` ✅ `scripts/check-bundle-size.mjs` now tracks vendor chunks (`rapier-*` 900 kB, `three-*` 300 kB) under separate budgets, so the main-bundle check (250 kB) isn't dominated by the lazy-loaded Rapier WASM. Largest non-vendor chunk today: AJV at ~32 kB.

### Deliverables

- `engine/physics/rapier/physics-sync-system.ts` + `physics-body-registry.ts`
- `engine/physics/rapier/rapier-adapter.ts` — `drainEvents`, character-controller, BatchedMesh primitives
- `engine/core/transform/resolve-cached.ts` — `resolveDirtyDelta` + persistent children index
- `engine/render/systems/transform-resolve-system.ts` — writes only the changed `LocalToWorld` subset
- `engine/render/three-renderer.ts` — `refreshMeshes` filters `Batchable`
- `engine/runtime/inspect.ts` — `RENDER_INTERNAL_COMPONENTS` adds `BatchedMeshHandle`, `RenderLightHandle`, `CurrentContacts3D`, `OverlappingTriggers3D`
- `schemas/scene.schema.json` — `CharacterController3D`
- `schemas/project.schema.json` — `physics: { enabled?, gravity?, fixedDt? }`
- `src/app.ts` — lazy-imports Rapier + registers PhysicsSyncSystem when `project.physics?.enabled === true`
- `examples/batch-bench/` — new project (`project.json`, `scenes/start.scene.json`, `bootstrap.ts`, `README.md`, `assets/_sources/asset-sources.json`)
- `examples/beacon-world/project.json` + `scenes/start.scene.json` — physics declarations on ground, drone, beacons, cores, hazards
- `spikes/physics-rapier-v0/{sync-spike,sensor-spike,character-spike}.ts`
- `tests/unit/physics-sync-system.test.ts` — 6 tests
- `scripts/check-bundle-size.mjs` — vendor-chunk budgets

### Verification

- `npm run preflight` ✅ — full chain green with 1-retry tolerance (hmr-stress + multiclient-roundtrip flaky under parallel load, deterministic in isolation; 22 e2e passed, 2 flaky-retried).
- Bridge probe on Beacon-World: 8 bodies / 6 sensors / 0 diagnostics.
- Bridge probe on batch-bench (default seed): `drawCalls: 5, buckets: 4, bucketInstances: 400, handleLeak: 0`.
- `beacon-world-gameplay.spec` ✅ — drone still picks up a core and repairs a beacon with physics enabled.

### Follow-Ups

- `M21-shadow-csm` — outdoor CSM via `three/addons/csm/CSM.js`. High-touch: adapter-side CSM instance bound to active camera, per-frame `csm.update()`, `csm.setupMaterial(material)` on every material the renderer manages (acquire / patch / manifest paths). Schema on `project.json#renderer.shadows.csm`. Conflict with ECS-owned sun shadow needs an opt-out path.
- `M17-batched-mesh-system` — wire BatchedMesh adapter primitives behind `Batchable.path?: "instanced" | "batched"` in `BatchingSystem`. Bucketing for "batched" keys by `material + shadow + group` (mesh varies). Add a `batch-bench` scenario pushing 4 different primitive meshes through one batched bucket.
- `beacon-physics-character` — switch `player.drone` from `PlayerControlled` Transform writes to `CharacterController3D` + new `CharacterMovementSystem` that consumes input and queries the controller for collision-resolved motion. Project flag so Hello-3D keeps the old path.
- `beacon-physics-sensor-wiring` — replace `pickup-system` / `hazard-system` proximity loops with `OverlappingTriggers3D` reads.



## Sprint 35 — physics + batching + materials + cache polish + utsubo absorbed

Status: Completed and archived.

### Completed Work

- `M17-bucketer` ✅ `Batchable` component + `BatchingSystem` that collapses same-mesh+color+shadow-flag entities into a single `InstancedMesh` per bucket. Adapter grows `acquireBucket` / `addBucketInstance` / `setBucketInstanceTransform` / `releaseBucket`. `MeshLifecycleSystem` skips Batchable entities. `rendererInfo()` reports `buckets` + `bucketInstances`. 5 schema tests + 7 system tests; e2e confirmed 24 entities → 1 bucket.
- `M21-light-spot-hemisphere-rect` ✅ Adapter + LightLifecycleSystem cover all 6 kinds (`directional` / `point` / `ambient` / `spot` / `hemisphere` / `rect-area`). `RectAreaLightUniformsLib.init()` called once on first acquire. `spot.target` is added to the scene + disposed on release. `AGF_LIGHT_KIND_UNSUPPORTED` now fires only on actual typos.
- `M21-mat-physical` + `M21-mat-unlit` ✅ Material manifest widens to 5 shader kinds (`standard` / `physical` / `lambert` / `phong` / `basic`). Physical fields (clearcoat / clearcoatRoughness / ior / transmission / thickness / sheen / sheenColor / iridescence) + phong fields (shininess / specular) + opacity. Adapter's `setMeshMaterialPatch` swaps the Three.js material class when `patch.kind` doesn't match; `MaterialBindingSystem` threads every per-kind field through. 6 schema tests + material-hmr-audit e2e green.
- `M16-cache-c` ✅ `cache.resolveWithDirty(world, inputs, dirtyIds)` accepts the caller-supplied dirty set and skips the per-entity `componentRevision` read that dominated cache-b. **Bench at 10k chain-of-8 @ 1%-dirty: 5.99 ms** (~25% faster than cache-b, ~2.1× over no-cache). `TransformResolveSystem` now uses the new path; M16-cache-d (children index → skip non-dirty subtrees) is the next lever.
- `M24-investigate` ✅ `spikes/physics-rapier-v0/` — confirms `@dimforge/rapier3d-compat` bundles via Vite's default loader. Init=42ms, 60 fixed steps=8ms. Bundle delta ~1.6–1.8 MB gzipped → runtime integration must lazy-import.
- `M24-schema` ✅ `RigidBody3D` + `Collider3D` JSON schemas with per-kind `allOf+if/then` constraints (box requires size, sphere requires radius, capsule/cylinder require radius + halfHeight). Layer + mask + sensor + friction + restitution covered. 13 unit tests cover all kinds + negative cases.
- `M24-adapter` ✅ `engine/physics/rapier/rapier-adapter.ts` — lazy-init wrapper, internal `bodies` / `colliders` / `bodyColliders` / `colliderBody` maps, full primitive lifecycle. `releaseBody` mirrors Rapier's auto-removal of attached colliders. Adapter spike exercises 4 bodies (cube + ball + capsule + ground) for 60 steps and verifies clean shutdown.
- **Utsubo absorption** ✅ `Notes/utsubo_threejs_best_practices_100_tips.md` → `M25` Production asset pipeline epic in HIGH_LEVEL_BACKLOG + 22 new follow-up stories under Sprint 35+ (M21-frame-timing, M21-tsl-investigate, M21-webgpu-spike, M21-context-loss, M21-light-budgets, M21-shadow-static, M21-post-pipeline, M17-batched-mesh, M17-material-sharing-doctor, M17-static-merge-spike, M17-lod, ASSET-decoder-paths, ASSET-compression, ASSET-gltf-transform-investigate, ASSET-optimize-command, ASSET-lod-metadata, ASSET-texture-doctor, RUNTIME-progressive-loading, RUNTIME-renderer-ready, RUNTIME-resource-leak-tests, RUNTIME-idle-rendering, RUNTIME-gpu-timing). AGENTS.md gains three hard rules: no per-frame Three.js resource allocation, material variants are manifest refs, loaders constructed once.

### Deliverables

- `engine/render/systems/batching-system.ts`, scene schema `Batchable` + tests
- `engine/render/three-render-adapter.ts` — bucket primitives + spot/hemisphere/rect-area lights + 5 material kinds
- `engine/render/systems/material-binding-system.ts` — full physical/phong/etc. patch wiring
- `engine/core/transform/resolve-cached.ts` — `resolveWithDirty` entry point
- `engine/render/systems/transform-resolve-system.ts` — feeds the dirty set straight to cache
- `engine/physics/rapier/rapier-adapter.ts`
- `spikes/physics-rapier-v0/{spike,adapter-spike}.ts` + README
- `schemas/scene.schema.json` — `Batchable` + `RigidBody3D` + `Collider3D`
- `schemas/material.schema.json` — five shader kinds + per-kind fields
- `engine/runtime/asset-loaders/material-loader.ts` — `MaterialShader` union
- `AGENTS.md` — three new hard rules (per-frame alloc / material variants / loader singletons)
- `HIGH_LEVEL_BACKLOG.md` — `M25` Production asset pipeline epic + utsubo follow-ups
- 13 + 7 + 5 + 6 + 13 = 44 new unit tests; preflight clean with 1-retry policy

### Verification

- `npm run preflight` ✅ — full chain with 1-retry tolerance (hmr-stress + multiclient-roundtrip flake under load, deterministic in isolation).

### Goal Recap

Sprint 35 ran the full Sprint 35 candidate list — batching, all 6 light kinds, all 5 material kinds, hierarchy cache one layer faster, and Rapier physics from spike through schema to adapter (only sync + sensors remain). Mid-sprint absorbed the utsubo "100 tips" survey into M25 + 22 follow-up stories. AGENTS.md gained three hard rules that lock the per-frame allocation discipline.

### Follow-Ups

- `M24-sync` — Transform ↔ Rapier body two-way sync system + `engine/runtime/start.ts` integration gated by `project.json#physics.enabled`.
- `M24-sensors` — Collision events buffered per fixed step + runtime-only `Grounded3D` / `OverlappingTriggers3D` components.
- `M24-raycast` — `runtime.physics.raycast({...})` returning AGF EntityIds.
- `M24-character` — `CharacterController3D` schema + kinematic capsule wrapper.
- `M24-debug` — Rapier `world.debugRender()` overlay + `engine doctor` body/collider counts.
- `M21-shadow-csm` — Cascaded Shadow Maps addon (high-touch, requires `csm.setupMaterial(material)` hook on every material).
- `M16-cache-d` — children index to skip topo walk for non-dirty subtrees. Target < 1 ms at 10k chain-of-8.
- `M17-batched-mesh` — multi-geometry / shared-material `BatchedMesh` buckets sibling to InstancedMesh path.



## Sprint 34 — Phase 2 visible delta: lights + shadows + IBL + cache polish + M23 tuner + M24 absorbed

Status: Completed and archived.

### Completed Work

- `M21-light-schema` ✅ Polymorphic `Light` + `ShadowFlags` JSON schemas (kind discriminator: directional / point / spot / ambient / hemisphere / rect-area; per-kind constraints via `allOf + if/then`). 11 unit tests covering happy paths + negative cases.
- `M21-light-directional-point` ✅ `engine/render/light-handle-registry.ts` + `engine/render/systems/light-lifecycle-system.ts`. Adapter grows `acquireLight` / `releaseLight` / `setLightParams` / `setLightTransform` / `setLightCastShadow` for directional / point / ambient kinds. Fallback ambient + directional auto-disabled when first ECS light appears; re-enabled + `AGF_NO_LIGHTS` diagnostic emitted when scene loses every Light. Kind-change triggers release + re-acquire. 8 unit tests.
- `M21-shadow-basic` ✅ Per-light `castShadow` + per-mesh `ShadowFlags { cast, receive }` (default both true). `MeshTransformSyncSystem` reads `ShadowFlags` per frame; `LightLifecycleSystem` configures `light.shadow.*`. Adapter enables `device.shadowMap` globally with `PCFShadowMap` (PCFSoftShadowMap deprecated in r184). `rendererInfo()` reports `shadowCasters`. Beacon-World adopts a high-noon sun (`light.sun` at `(2, 14, 7)`), ambient + cool fill; Hello-3D similar. Per-mesh `ShadowFlags` on `ground` / `floor` (cast=false).
- **Beacon point-light halos** ✅ `examples/beacon-world/src/systems/beacon-light-system.ts` — System reads `BeaconLight { beaconId, repairedIntensity, brokenIntensity }` + paired `Light`; writes `Light.intensity` based on linked beacon's `Repairable.repaired`. Beacon scene gets `light.beacon.{west,east}` with castShadow=true. 5 unit tests.
- **Shadow tuning loop (via M23-tuner)** ✅ Iterated through Playwright screenshot grids → switched to dev-tuner mid-sprint → user dialed in `shadow.bias = -0.015` / `shadow.normalBias = 0.5`. Baked into the scene; tuner panel removed via dev-bridge.
- `M23-tuner` ✅ `engine/runtime/dev-tuner.ts` — agent-spawnable floating slider panel bound to component-field paths. Surface `__agf.dev.tuner.{add,remove,removeAll,list}`; each drag flows through `applyCommands` (snapshot / HMR / network / replay all "just work"). Panel is DOM, NOT in ECS — `__agf.snapshot()` never sees it. Dev-bridge gets 4 HTTP routes (`/__agf/tuner/{add,remove,remove-all,list}`) so agents can spawn sliders from a shell without DevTools. Agent skill at `docs/agent/dev-tuner.md`. 6 path-helper unit tests + e2e (add → drag → snapshot reflects → remove → panel gone).
- `M21-env-generated` ✅ `ThreeRenderAdapter.setEnvironment(kind)` builds `RoomEnvironment` via `PMREMGenerator`; idempotent + disposes texture on swap. Scene schema gains top-level optional `environment: { kind: "generated" | "none" }`. Default = generated. PBR materials gain natural reflections out of the box. 5 schema tests.
- `M16-cache-b` ✅ `World.consumeDirty(name)` reads + clears an incremental dirty set populated by `setComponent` / `removeComponent` / `removeEntity`. `TransformResolveSystem` keeps an internal `inputCache: Map<EntityId, TransformInput>`; seeds once when a new World arrives, then per frame rebuilds inputs only for `world.consumeDirty("Transform")` entries. Drops the per-frame entity scan + deg→rad conversion for clean entities. Bench: 10k chain-of-8 @ 1%-dirty ~8.1 ms (~13% narrow win vs M16-cache-a alone; `M16-cache-c` is the next big lever). 2 unit tests.
- `M22-allocations` ✅ `benchmarks/ecs/alloc.ts` — standalone bench launched via `node --expose-gc --import tsx` (`npm run bench:ecs:alloc`). Forces GC, measures heap delta per op, reports bytes-per-op + heap delta KB. Findings at 10k: hierarchy resolve ~2.1 MB / op, cached steady-state ~890 KB / op, snapshotWorld ~1.2 MB / op. Baseline JSON at `docs/research/ecs-allocations-baseline.json`. Big numbers point at `M16-cache-c` (Map reuse + matrix scratch pooling).
- `M17-doctor` ✅ `engine/tools/doctor/batch-candidates.ts` walks every `.scene.json`, groups MeshRenderer entities by `mesh|material|cast:receive` (the exact key M17 bucketer will use), reports top buckets + singleton isolation reasons through `engine doctor`. Beacon-World shows 8 renderable → 6 buckets, 2 draw calls saved. 4 unit tests.
- `SYS-rule-createquery` ✅ `scripts/check-system-queries.mjs` scans system files for `world.query(` calls; preflight gate (`npm run systems:check`). Cold-path opt-out via `// agf-allow: world.query`. Fixed `CameraSyncSystem` (was calling `world.query()` twice per frame) to use cached `QueryHandle`s. AGENTS.md gains a hard rule + reference to the 18,000× benchmark.
- **M24 Rapier physics & colliders epic** absorbed from `Notes/colliders_physics_implementation_analysis.md`. `HIGH_LEVEL_BACKLOG.md` row replaces "Rapier physics: Later" with full epic: components (RigidBody3D / Collider3D / PhysicsMaterial3D / CharacterController3D), two-layer collision stack (renderer raycaster + Rapier simulation), hybrid collision output (raw events → runtime-only derived components → gameplay commands), named layers, fixed-step pipeline. 9 stories `M24-investigate..M24-static-mesh` queued in Sprint 35+ carry-over with concrete scopes. M17 / M18 cross-references updated.
- **Playwright retry config** ✅ Single retry for the load-induced flakes (`hmr-stress` / `multiclient-roundtrip` / `score-pulse` each pass deterministically in isolation but occasionally lose a frame under full-suite GPU contention).

### Deliverables

- `engine/render/light-handle-registry.ts`, `engine/render/systems/light-lifecycle-system.ts`
- `engine/render/three-render-adapter.ts` (+ env, light, shadow surface)
- `engine/runtime/dev-tuner.ts` + `engine/dev/page-bridge.ts` (+ tuner WS RPC) + `engine/dev/agf-dev-bridge.ts` (+ 4 HTTP routes) + `docs/agent/dev-tuner.md`
- `engine/core/ecs/world.ts` — `consumeDirty(name)` + `dirtySize(name)` + `markDirty`
- `engine/render/systems/transform-resolve-system.ts` — `inputCache` consumes dirty queue
- `benchmarks/ecs/alloc.ts` + `npm run bench:ecs:alloc` + baseline JSON
- `engine/tools/doctor/batch-candidates.ts` + `engine doctor` report
- `scripts/check-system-queries.mjs` + preflight wiring + AGENTS.md hard rule
- `examples/beacon-world/src/systems/beacon-light-system.ts` + scene updates
- `examples/hello-3d/scenes/start.scene.json` (added Light entities + ShadowFlags)
- `schemas/scene.schema.json` (+ Light + ShadowFlags + environment top-level)
- `engine/core/ecs/types.ts` — `SceneEnvironmentInput`
- 336 Vitest tests (45 new); 24 Playwright e2e green

### Verification

- `npm run preflight` ✅ end-to-end: imports-check + systems-check + engine-check + typecheck + 336 unit + build + bundle-check + 24 e2e (with 1 retry).

### Goal Recap

Plumbing of Sprint 33 paid off: Beacon-World now LOOKS like a game. Sun + ambient + fill + green halos over beacons (which gate by Repairable state). PBR-correct reflections via IBL. Per-mesh shadow opt-in. Mid-sprint, the dev-tuner pattern emerged out of the shadow-bias iteration loop and became its own shipping feature — agents can now spawn sliders for any numeric component field. The M24 physics analysis arrived end of sprint and got cleanly absorbed into the long-term roadmap without disrupting active work.

### Follow-Ups

- `M16-cache-c` — push dirty-awareness into the resolver cache itself (Map reuse + matrix scratch pool). Target: 10k chain-of-8 < 1 ms.
- `M21-light-spot-hemisphere-rect` — finish the remaining Light kinds.
- `M21-shadow-csm` — CSM addon for outdoor scenes (current shadow camera is single-cascade).
- `M21-shadow-soft` — re-evaluate PCFSoftShadowMap when three.js stabilises soft shadows.
- `M21-shadow-glb-acne` — investigate per-material `shadowSide` / polygonOffset for low-poly GLB self-shadow polish.
- `M24-investigate..M24-static-mesh` — Rapier physics implementation (9 stories queued).
- `M17-bucketer` — start actual batching now that `M17-doctor` shows the savings opportunity.
- `M21-mat-*` — material types beyond Standard.
- `M21-post-*` — post-processing.



## Sprint 33 — M21 Phase 1 split + M22 / M16 perf foundation + Codex review

Status: Completed and archived.

### Completed Work

- `M21-investigate` ✅ (carried from Sprint 32 backlog into Sprint 33 close-out). `docs/research/renderer-ecs-split-investigation.md` 589 lines: Phase 1 minimum split + Phase 2 Unity-class roadmap (materials / lights / shadows / batching / post-processing / IBL / color / camera features) with sprint-by-sprint sequencing and out-of-scope list.
- `M22 / ECS-B1 + ECS-B2` ✅ Zero-dep ECS benchmark harness (`benchmarks/ecs/`), three suites (snapshot / query / hierarchy-resolve). Baseline JSON `docs/research/ecs-benchmarks-baseline.json`. `npm run bench:ecs` CLI with `--suite` + `--json`. Findings: `resolveHierarchy chain-of-8 @ 10k = ~12.9 ms` (73% of 60 FPS budget); cached `createQuery` is ~18,000× faster than `world.query()` uncached.
- **`docs/research/ecs-compare-performance.md`** ✅ Competitive comparison: AGF vs bitECS / becsy / Miniplex / ECSY / Friflo / Unity DOTS / Bevy / Flecs. Matched-pair refresh rule with baseline JSON. Bands not points; agent-first multiplier explained.
- `M16-cache-a` ✅ Per-component revision counter on `World` (`componentRevision(id, name)`); `createHierarchyCache()` in `engine/core/transform/resolve-cached.ts` with steady-state fast path (reused `ResolvedTransform` refs) + mixed-dirty partial walk (compose only dirty subtrees). **Result**: 10k chain-of-8 went from 12.9 ms → 5.4 ms steady-state (2.4× win) / 8.2 ms with 1% per-frame mutation (1.6× win). 6 unit tests.
- `M16-cache-parity` ✅ Random-mutation parity test (25 cycles × 10% mutation, `toBeCloseTo` precision 9) — locks "derived cache, not second ECS" invariant.
- `M21-a` ✅ `engine/render/three-render-adapter.ts` — Three.js touchpoint with opaque `MeshHandle` / `CameraHandle` IDs. Three.js types no longer leak past this boundary.
- `M21-b` ✅ `TransformResolveSystem` + `LocalToWorld` (radians, renderer-internal component). Frame-update System uses M16-cache. Auto-registered at end of scheduler order from `startRuntime`.
- `M21-c` ✅ `CameraSyncSystem` + `ActiveCamera` marker. Pick policy moved out of renderer; visible via `__agf.snapshot()`.
- `M21-d` ✅ `MeshLifecycleSystem` + `MeshHandleRegistry` (shared `EntityId → MeshHandle` table) + `RenderMeshHandle` component.
- `M21-e` ✅ `MaterialBindingSystem` + `AppliedGeometryRef` / `AppliedMaterialRef` (`{ ref, status: "pending" | "applied" | "failed" }`). Async asset.get + cancellation moved out of renderer; `invalidateAsset` routed through component removal.
- `M21-f` ✅ `MeshTransformSyncSystem` — per-frame hottest path. Cached `createQuery(["RenderMeshHandle","LocalToWorld"])`.
- `M21-g` ✅ `snapshotWorld({ includeRenderInternals? })` filters `LocalToWorld` / `RenderMeshHandle` / `AppliedGeometryRef` / `AppliedMaterialRef` / `ActiveCamera` from default output. `ThreeRenderer.info()` adds `handleLeak = registry.size() - count(world.query(["RenderMeshHandle"]))` for regression assertions.
- `M21-boundary-check` ✅ `scripts/check-import-boundaries.mjs` — `engine/core` cannot import `three` or `engine/render/`. Wired into preflight as `npm run imports:check`.
- **Codex review absorption** ✅ `CLAUDE.md` gained "one ECS source of truth; optimized structures are derived caches" non-negotiable with six gates (derived-from-ECS, no public authoring API, rebuildable, explicit invalidation, parity tests, benchmark). New follow-up stories in BACKLOG: `M22-allocations`, `M17-doctor`, `SYS-rule-createquery`.

### Deliverables

- `engine/render/three-render-adapter.ts`, `engine/render/mesh-handle-registry.ts`
- `engine/render/systems/{transform-resolve,camera-sync,mesh-lifecycle,material-binding,mesh-transform-sync}-system.ts`
- `engine/core/transform/resolve-cached.ts`
- `engine/core/ecs/world.ts` — `componentRevision(id, name)`
- `engine/runtime/inspect.ts` — `SnapshotOptions { includeRenderInternals }` + `RENDER_INTERNAL_COMPONENTS` constant
- `benchmarks/ecs/` — runner + 3 suites + README
- `scripts/check-import-boundaries.mjs` + `npm run imports:check`
- `docs/research/ecs-benchmarks-baseline.json` + `docs/research/ecs-compare-performance.md` + `docs/research/renderer-ecs-split-investigation.md` (Phase 2 expansion)
- `CLAUDE.md` — "one ECS source of truth, derived caches" non-negotiable
- 295 Vitest tests (48 files) — +22 new for the 5 systems + cache + parity + snapshot internals
- All 23 Playwright e2e tests + manual bridge probes green

### Verification

- `npm run preflight` ✅ end-to-end: imports-check + engine-check + typecheck + 295 unit + build + bundle-check + 23 e2e.

### Goal Recap

Phase 1 of the M21 renderer→ECS split is complete. The renderer is now a thin orchestrator over five scheduler-registered systems and one Three.js adapter. Three.js types live only behind the adapter boundary, enforced by `imports:check`. Cached hierarchy resolution makes hierarchical scenes 2.4× faster steady-state. Competitive ECS comparison and decision rules for derived caches are documented. Codex review feedback was absorbed in-flight, not deferred.

### Follow-Ups

- `M16-cache-b/c` — incremental dirty queue maintained by `setComponent` (push 10k chain-of-8 toward < 1 ms steady-state).
- `M22-allocations` — allocation-focused bench (Codex callout: browser jank is allocation churn, not just wall time).
- `M17-doctor` — pre-M17 batch-candidate report in `engine doctor`.
- `SYS-rule-createquery` — `engine check` warning for `world.query()` in System hot paths.
- Phase 2 M21 epics: lights, shadows, materials, batching, post-processing, IBL, color (see `docs/research/renderer-ecs-split-investigation.md` §8).
- `M20-a..l` netcode rework implementation (queued since Sprint 32).
- `M3-c-load` + `M3-c-beacon` — prefab runtime + Beacon adoption.



## Sprint 32 — Finish M15 dev-server + composition loops + 4 new investigation epics

Status: Completed and archived.

### Completed Work

- `M15-multi-page` Dev bridge replaces single-`activeSocket` invariant with `Map<socketId, PageEntry>`. HTTP routes accept `?page=<socketId>` / `?playerId=<id>` / `?project=<id>` (falls back to most-recently-connected page). `/__agf/health` returns `pages: [...]`. Dropped the `playwright.dev-bridge.config.ts` workaround — all four bridge e2e specs run in parallel under default config, each using a unique `playerId` query.
- `M15-g` `GET /__agf/events` SSE stream. Per-page `sseSubscribers` set; first HTTP subscriber arms `events-start` RPC on the page, last leaving fires `events-stop`. Page-side bootstrap subscribes to `runtime.diagnostics` (new `AppHandle.subscribeDiagnostics` plus `window.__agf.subscribeDiagnostics`) and `window.addEventListener("agf:asset-changed")`, forwarding `{ kind: "event", payload: { type, data } }` over WS. Bridge fans events to all SSE subscribers attached to that page. New e2e spec opens the stream, dispatches a synthetic asset-changed event, and asserts the frame lands.
- `M16-cascade` `applyCommand`'s `entity.delete` walks `Transform.parent` graph and removes every transitive child. Implementation builds a parent → children map once per delete, then BFS. Five unit tests cover leaf / parent / middle / no-op / orphan-parent paths.
- `M4-reload-e2e` New Playwright spec `tests/e2e/beacon-persistence-reload.spec.ts` navigates Beacon, drives a repair via `window.__agf.applyCommands`, `__agf.save()`, `page.reload()`, `__agf.load()` and asserts the repaired state + `lastRepairedBy` survive the round trip via IndexedDB. Cleans up the store afterwards.
- **M20 Netcode rework epic + investigate doc** — `docs/research/netcode-rework-investigation.md` captures the three Sprint 32 multiplayer bugs (own-drone 2× server, 30s idle disconnect, networked feel ≠ single-player), surveys five netcode patterns (snapshot interp / client prediction + server reconciliation / lockstep / GGPO rollback / **client-authoritative own player**), weighs each against AGF constraints, and recommends Option E (client-authoritative own-player) with a 12-story rebuild plan (M20-a..M20-l). Epic landed in `HIGH_LEVEL_BACKLOG.md`.
- **M21 Renderer → ECS systems epic** — investigate-first entry in `HIGH_LEVEL_BACKLOG.md` calling for a research doc that audits `ThreeRenderer` responsibilities, proposes a per-system split (`CameraSyncSystem`, `MeshLifecycleSystem`, `MeshTransformSyncSystem`, `MaterialBindingSystem`, future `BatchingSystem`), preserves the renderer-import-boundary lock, and measures perf impact before code.
- **M22 ECS performance & design discipline epic** — anchored in `Notes/ecs_notes.md` (Friflo benchmark survey + AGF stance). Don't rewrite to archetype ECS yet; instead build (a) ECS benchmark suite (`ECS-B1..B5`), (b) LocalToWorld cache (`M16-cache-a..e`), (c) system-level command buffer (`CMD-B1..B4`), (d) explicit indexes (`IDX-*`). Orient toward Friflo coverage + Unity DOTS transform pipeline + Leopotam minimalism + AGF's schema-first authoring. Explicit non-goals: full archetype, generic relations, event-driven gameplay.
- **`M17` batching epic expansion + new `examples/batch-bench/` perf-only project** — M17 entry now calls out an ECS-native bucketer (Batchable tag, auto-grouping by mesh+material+render-policy, InstancedMesh per bucket, `engine doctor` batch metrics, no Transform two-writer state). `examples/batch-bench/` lands in the roadmap as a sister to `examples/feature-lab/` — stress on thousands of instanced entities, perf report (draw calls / FPS / bucket count) as a regression target for M17 changes.
- **`CLAUDE.md` non-negotiable: ECS-first by default.** New rule: when adding new runtime behaviour, the default shape is a scheduler-registered System reading/writing typed components. Deviate only on measurable perf cost / architectural complexity / third-party API blockers; document the deviation inline.
- **`References/three.js/examples`** sparse-checkout of `mrdoob/three.js@master` examples folder (~440 MB, gitignored) so M17 / M21 design has concrete `BatchedMesh` / `InstancedMesh` / WebGPU references (`webgl_mesh_batch.html`, `webgl_batch_lod_bvh.html`, `webgl_instancing_performance.html`, etc.).

### Deliverables

- `engine/dev/agf-dev-bridge.ts` — multi-page bridge + `/__agf/events` SSE
- `engine/dev/page-bridge.ts` — auto-reconnect + `events-start` / `events-stop` handlers
- `src/app.ts`, `src/main.ts` — `subscribeDiagnostics` surface
- `engine/core/commands/command-queue.ts` — cascade-delete
- `playwright.config.ts`, `package.json` — drop the dedicated dev-bridge config + script
- `docs/research/netcode-rework-investigation.md`
- `HIGH_LEVEL_BACKLOG.md` — M17 expansion + `examples/batch-bench/` + M20 + M21 + M22 + `examples/feature-lab/` (carried) entries
- `CLAUDE.md` — "Prefer ECS systems by default" rule
- `tests/e2e/dev-bridge.spec.ts` (now 5 cases) + `tests/e2e/beacon-persistence-reload.spec.ts` + `tests/unit/entity-delete-cascade.test.ts`
- `References/three.js/` (gitignored)

### Verification

- Sprint-close `npm run preflight`: **273 Vitest tests across 44 files**, vite build OK, `bundle:check` green, **23 Playwright e2e tests** all green (16 default + 4 dev-bridge + new persistence-reload + new SSE; all run in parallel under the single config now).
- Manual: `curl http://localhost:5173/__agf/health` returns the live `pages` array; `curl /__agf/events?playerId=alpha` streams diagnostics + HMR events as SSE.

### Goal Recap

- M15 vertical is now feature-complete (only the optional `engine connect` CLI remains).
- The big multi-tab debugging story that started the sprint — alpha/bravo desync investigation — drove `M15-multi-page` and uncovered three architectural multiplayer bugs (own-drone 2×, idle kick, feel mismatch). All three trace to a single mixed-source-of-truth in `network-drone-sync` + `PlayerInputSystem`; `M20` epic captures the rebuild plan with `client-authoritative own player` as the recommended pattern.
- Three new strategic epics (M20 / M21 / M22) plus the M17 expansion now describe the *next* ~5 sprints of engine work: netcode rework, renderer ECS split, ECS perf discipline, and batching with a dedicated perf project. The `Notes/ecs_notes.md` synthesis turned what could have been an open-ended ECS rewrite urge into a disciplined "measure first" plan.

### Follow-Ups

- `M20-a..l` netcode rebuild (Sprint 33+).
- `M21-investigate` renderer → ECS split design doc.
- `M22 / ECS-B1..B5` benchmark harness; gate any storage change on real numbers.
- `M3-c-load` + `M3-c-beacon` — wire `expandScenePrefabs` into scene-load.
- `M15-i` optional `engine connect` CLI.
- `M2b-seed` deterministic RNG wire-up still waiting.

## Sprint 43 — Open-source readiness

Status: Completed and archived.

Triggered by `Notes/codex_review_2.md` (open-source readiness audit, 2026-05-14). The review flagged release-hygiene blockers — missing LICENSE, stale README/DEVELOPMENT/backend docs, doctor vs bundle:check budget mismatch, one Cyrillic phrase in a research doc. Sprint 43 closes those gates so AGF can be presented as a pre-alpha engine without confusing first-time readers.

### Completed Work

1. **OSS-cyrillic-fix** ✅ — Replaced the Russian phrase meaning "almost like Unity" with `"almost Unity-class"` in `docs/research/renderer-ecs-split-investigation.md`.
2. **OSS-hygiene-local** ✅ — `scripts/check-repo-hygiene.mjs` + `npm run repo:hygiene` script + prepended to `preflight`. Local mirror of `.github/workflows/repo-hygiene.yml`.
3. **OSS-license-metadata** ✅ — `LICENSE` (Apache-2.0), `THIRD_PARTY_NOTICES.md` (Draco / Basis Universal / Three.js / Rapier / AJV provenance), `package.json` gets `license`, `repository`, `bugs`, `homepage`, `keywords`, `description`.
4. **OSS-community** ✅ — `CONTRIBUTING.md` (preflight contract + agent rules), `SECURITY.md` (DEV-only `__agf` boundary, vulnerability reporting).
5. **OSS-readme-refresh** ✅ — Replaced Sprint-1-era README with pre-alpha status, quickstart, what-works-today list, examples, agent workflow, limitations, roadmap, license.
6. **OSS-docs-sync** ✅ — `docs/DEVELOPMENT.md` drops "wired during Sprint 1", lists actual command surface; `examples/backends/README.md` documents Node WebSocket `--serve` mode; `examples/backends/node-world-server/README.md` documents serve mode + threat model.
7. **OSS-doctor-budget-align** ✅ — `engine doctor` now splits main-chunk budgets from vendor-chunk budgets matching `scripts/check-bundle-size.mjs`. `DEFAULT_VENDOR_BUDGETS` default for `rapier-` / `three-`. Per-project `bundle.vendors` overrides. 4 unit tests (`tests/unit/doctor-vendor-budgets.test.ts`).
8. **OSS-backlog-cleanup** ✅ — `HIGH_LEVEL_BACKLOG.md` "Sequencing the M-list" updated to mark steps 1–6 done, list real outstanding work.

### Verification

- `npm run repo:hygiene` ✅ — 431 tracked files, no Cyrillic.
- `npm run typecheck` ✅.
- `npm run engine:check:examples` ✅ — 5 projects.
- `npm run imports:check` / `systems:check` ✅.
- `npm run test` ✅ — 65 files, 412 tests.
- `npm run engine:doctor -- examples/hello-3d` / `-- examples/beacon-world` — both clean, vendor chunks reported separately within their budgets.

### Follow-Ups

Renderer / asset-pipeline openers originally pencilled for Sprint 43 moved to Sprint 44 (PCSS-modern, PCSS-CSM, ASSET-texture-compress, cam-cinematic, env-cube, webgpu-spike, M17-lod-batched, ASSET-decoder-vendor verification) alongside the remaining OSS-readiness work (CI parity, e2e stability). Parking lot recorded at sprint close: `M21-shadow-pcss-modern` / `-pcss-csm` / `-webgpu-spike` / `-env-cube` / `-cam-cinematic` / `-shadow-soft` / `-shadow-glb-acne`; `ASSET-optimize-command` / `-lod-metadata` / `-texture-doctor`; `M17-lod-batched` / `-static-merge-spike`; `M3-c-load` / `-beacon`; `M16-cache-e`; `RUNTIME-progressive-loading` / `-idle-rendering` / `-gpu-timing`; `M20-a..l`, `M2b-seed`, `13.13` audio, `10.5+` C# WS transport.

## Sprint 44 — CI parity + renderer follow-ups

Status: Completed and archived.

Follows Sprint 43's open-source readiness work. Closes the remaining `Notes/codex_review_2.md` gates (CI parity + e2e stability) and lands the renderer follow-ups deferred from S43.

### Completed Work

1. **OSS-ci-parity** ✅ — Extended `.github/workflows/repo-hygiene.yml` with `imports:check` + `systems:check` in the typecheck job, plus two new jobs: `node-backend-smoke` (`npm run backend:node`) and `dotnet-backend-build` (Release build). New `.github/workflows/e2e.yml` runs Playwright in its own workflow + uploads the playwright-report artifact on failure.
2. **OSS-e2e-stability** ✅ — Playwright config gains a `serial-heavy` project for `hmr-stress` + `multiclient-roundtrip` (serial, 90s timeout, retries=2). `hmr-stress` alternates the material body each cycle so Vite's watcher doesn't coalesce identical-bytes writes. `app.spec.ts` + `score-pulse.spec.ts` await `__agf.rendererReady` before pixel sampling / gameplay applyCommands so they don't race the renderer warm-up.
3. **M21-shadow-pcss-modern** ✅ — Root-cause fix for the S41 PCSS no-op. The substitution targets the BASIC `getShadow` variant (texture2D + raw depth); modern `PCFShadowMap` uses `sampler2DShadow` which only returns 0/1, so the substitution silently does nothing. Adapter now maps `algorithm: "pcss"` → `BasicShadowMap` (matching three's own `webgl_shadowmap_pcss.html`). `algorithm: "pcf"` stays on modern `PCFShadowMap`. New `tests/unit/shadow-pcss-algorithm.test.ts` guards the mapping.
4. **M21-env-cube** ✅ — `scene.environment.kind: "cube"` with a 6-face URL array `[+x, -x, +y, -y, +z, -z]` via `CubeTextureLoader` + `PMREMGenerator.fromCubemap` (IBL-ready, not just a skybox). Schema gains `faces` + an `allOf/if/then` requiring it when `kind: "cube"`. `tests/unit/scene-environment-schema.test.ts` adds 4 cube cases.

### Verification

- `npm run repo:hygiene` ✅
- `npm run typecheck` ✅
- `npm run imports:check` / `systems:check` ✅
- `npm run test` ✅ — `tests/unit/scene-environment-schema.test.ts` + `shadow-pcss-algorithm.test.ts` + `doctor-vendor-budgets.test.ts` + preexisting suite all green (412+ tests).

### Follow-Ups

Agent-authoring helpers from `Notes/codex_review_2.md`'s "should fix soon" list deferred to Sprint 45: `engine new --template`, `engine list components`, `engine explain component`, `engine screenshot`, `docs/agents/build-a-game.md`.

## Sprint 45 — Agent authoring helpers

Status: Completed and archived.

Closes the "should fix soon" list from `Notes/codex_review_2.md` — give an agent a discoverable authoring CLI so the `engine new → engine list → engine explain → engine check → engine run → engine screenshot` loop is one command per step.

### Completed Work

1. **AGENT-cli-list-components** ✅ — `engine list components [projectDir]` enumerates every built-in component declared on `scene.schema.json` + every project-local component in `<projectDir>/project-local-components.schema.json`. Reads `description` straight from the schema. `engine list examples` lists every project under `examples/` (`hello-3d`, `beacon-world`, batch/physics/shadows-bench).
2. **AGENT-cli-explain** ✅ — `engine explain component <Name> [projectDir]` resolves the schema definition, lists required + optional fields with their types + descriptions, and prints a derived authoring example (required-only object).
3. **AGENT-cli-new** ✅ — `engine new <name> --template hello-3d [--target <dir>]` copies the template tree, rewrites `project.json` + `template.json` for the new id, runs `engine check` on the result. Skips `node_modules` / `dist` / `_sources`. 4 unit tests cover the happy path, invalid name, destination collision, missing template.
4. **AGENT-cli-screenshot** ✅ — `engine screenshot <projectId> --out <path>` boots a headless Chromium via `@playwright/test`'s low-level API, navigates to `?project=<id>`, awaits `__agf.rendererReady`, settles 250ms, writes the PNG. Auto-boots a transient Vite dev server when one isn't already listening; `--reuse-server` opts out.
5. **AGENT-docs-build-a-game** ✅ — `docs/agent/build-a-game.md`: one-page contract covering the mental model, the discover → edit → validate → inspect → run → playtest loop, common recipes (add entity, project-local component, custom system, asset import, screenshot), hard rules, the dev-bridge surface table, the "stop" criteria.

### Deliverables

- `engine/tools/components/list-components.ts` (new)
- `engine/tools/components/explain-component.ts` (new)
- `engine/tools/new/project-new.ts` (new)
- `engine/tools/screenshot/project-screenshot.ts` (new)
- `engine/tools/cli.ts` — wired `list` / `explain` / `new` / `screenshot` subcommands + usage block
- `package.json` — `engine:list`, `engine:explain`, `engine:new`, `engine:screenshot` scripts
- `tests/unit/project-new.test.ts` (new)
- `docs/agent/build-a-game.md` (new)

### Verification

- `npm run typecheck` ✅
- `npm run engine:list -- components` ✅ — 17 built-ins printed with descriptions.
- `npm run engine:explain -- component Transform` ✅
- `npm run engine:list -- examples` ✅
- `npm run test` ✅ — 67 files, **422 tests** (was 412; +4 project-new tests + 4 cube schema tests + 2 PCSS tests).

### Follow-Ups

`list/explain` initially pointed at non-existent `project-local-components.schema.json`; corrected in Sprint 48 to use `<projectDir>/schemas/scene-extensions.schema.json`.

## Sprint 46 — CI e2e stabilization

Status: Completed and archived.

Narrow-focus sprint: the new `e2e.yml` workflow added in Sprint 44 fails the same ~10 specs on every CI run while the same specs pass locally on macOS in 5–15s each. Closing that gap is a blocker for treating the e2e workflow as a useful PR gate.

### Research

- **`docs/research/e2e-ci-investigation.md`** ✅ — Root cause: 5s inline `waitForFunction` budgets calibrated for local macOS frame pacing; ubuntu-latest's SwiftShader software-WebGL + cold Vite transform push the first physics tick past that budget. No production regressions — every failure is a timeout, never a wrong value.

### Completed Work

1. **CI-e2e-artifacts** ✅ — `tests/e2e/_shared/artifacts.ts` Playwright fixture that on test failure attaches console log + `__agf.diagnostics()` + `rendererInfo()` + `frameTiming()`. Workflow uploads `playwright-report/` and `test-results/` as artifacts.
2. **CI-e2e-helpers** ✅ — `tests/e2e/_shared/agf.ts` exports `waitForAgfReady(page)` (gates on `__agf` exists → `rendererReady` → first scene-load → first frame tick) and `waitForAgfPredicate(page, fn)` (snapshot predicate poll with consistent 30s default). Replaces the historical inline `{ timeout: 5_000 }` pattern.
3. **CI-e2e-preview-mode** ✅ — `playwright.preview.config.ts` runs gameplay + rendering specs against `vite build` + `vite preview` instead of the dev server. Avoids per-request TypeScript transform + HMR overhead. New scripts `test:e2e:smoke`, `test:e2e:preview`, `test:e2e:full-dev`.
4. **CI-e2e-required-smoke** ✅ — 14-test smoke project (app, project-switcher×3, hello-3d-hierarchy×2, dev-bridge×5, playtest-runner×3). All pass locally in 32s. `preflight` now runs `test:e2e:smoke`, not the full suite.
5. **CI-e2e-full-nightly** ✅ — `.github/workflows/e2e.yml` becomes a smoke-only PR gate. New `.github/workflows/e2e-nightly.yml` runs the full dev-server matrix + preview-mode matrix on cron (04:00 UTC) + workflow_dispatch + pushes to main.

### Migrated specs

`hello-3d-hierarchy.spec.ts` + `project-switcher.spec.ts` use the new `waitForAgfReady` helper. Other specs keep their existing waits — they live in the nightly chromium/preview projects and don't block PRs.

### Verification

- `npm run typecheck` ✅
- `npm run test:e2e:smoke` ✅ — 14/14 passed in 32s locally.
- `npm run test` ✅ — 422 unit tests still pass.

## Sprint 47 — Game-feel pass (tween / particles / cinematic / PCSS / shadows-bench polish)

Status: Completed and archived.

Visible feedback layer + shadow polish. Adds 3 ECS-native game-feel primitives, fixes the S41 PCSS substitution that was silently no-op'ing, and tunes the shadows-bench scene to look alive.

### Completed Work

1. **M19-tween** ✅ — `Tweens` component (array of tween specs) + `TweenSystem` (fixedUpdate, replay-deterministic). Easing kinds: linear / easeIn / easeOut / easeInOut / `pulse` (sin(πt) for one-shot bounces). Loop modes: none / loop / ping-pong. 6 unit tests.
2. **M19-particle-preset** ✅ — `ParticleEmitter` component + `ParticleEmitterSystem` + adapter `ParticlePool` API (additive InstancedMesh). Built-in presets: spark / glow / pulse. Auto-removed when emitter lifetime expires and particles drain.
3. **M21-cam-cinematic** ✅ — `CinematicCamera` component (waypoint list + per-segment ease + loop) + `CinematicCameraSystem`. Replay-safe via `elapsed` on the component.
4. **M21-shadow-pcss-csm + bug fix** ✅ — discovered the S41/S44 PCSS shader-chunk substitution silently no-op'd because three.js bumped whitespace inside `shadowmap_pars_fragment`. Replaced the literal match with a regex that tolerates whitespace + emits a console warning if upstream drifts. Added a regression test asserting the chunk actually contains `PCSS(` after `applyPcssShadowChunks()`. CSMShader uses the same `getShadow` symbol so cascades inherit PCSS automatically — no separate patch needed.
5. **beacon-world adoption** ✅ — pickup: spark burst on the core at the moment of pickup. Repair: `pulse`-ease Tween bounces beacon scale × 1.18 over 0.36 s + a 0.5 s spark burst. Both auto-remove themselves.
6. **shadows-bench polish** ✅ — fixed tree crown hovering above trunk (sphere primitive's radius is 0.5, not 1; corrected the canopy y offset). Added `pulse`-loop Tween on every trunk's X rotation (1.6–2.8° sway, staggered phase) so the forest sways in the wind. Tuned shadows: PCSS algorithm + 3 cascades + 1024 maps + `shadowNormalBias: 0.12` + near-zero shadowBias to kill the peter-pan gap and stay 120 fps at max zoom. Reduced PCSS `LIGHT_WORLD_SIZE` from 0.005 → 0.0025 for a tighter penumbra. Plumbed `shadowNormalBias` through CSM config + project schema + adapter.
7. **shadows-bench shadow tuner** ✅ — project-local UI panel under the FPS overlay (top-right). Sliders for cascades (2–4) / maxFar / shadowMapSize / shadowBias / shadowNormalBias / lightIntensity, picker for algorithm (PCF / VSM / PCSS), Reset button restores project.json defaults. Plumbs through new `adapter.setShadowAlgorithm(kind)` which recompiles existing materials so the new sampler binding takes effect; PCSS is treated as a one-way transition (the shader-chunk substitution is process-wide), surfaced as a "reload required" note that locks the picker. Beacon-world repair particles raised from `offset y=0.6` → `y=1.4` so sparks fountain above the beacon tip instead of inside the mesh.

### Deliverables

- `engine/core/systems/tween-system.ts` (new)
- `engine/render/systems/cinematic-camera-system.ts` (new)
- `engine/render/systems/particle-emitter-system.ts` (new)
- `engine/render/three-render-adapter.ts` — `ParticlePool` API, `CsmConfig.shadowNormalBias`, per-cascade normalBias apply
- `engine/render/shadow-pcss.ts` — regex-based substitution + console warning + tighter LIGHT_WORLD_SIZE
- `engine/runtime/start.ts` — registers tween + particle + cinematic systems
- `schemas/scene.schema.json` — Tweens / ParticleEmitter / CinematicCamera defs + `pulse` ease
- `schemas/project.schema.json` — `shadows.csm.shadowNormalBias`
- `tests/unit/tween-system.test.ts` (new) + `shadow-pcss-algorithm.test.ts` regression
- `examples/beacon-world/src/systems/pickup-system.ts` — game-feel hooks
- `examples/shadows-bench/bootstrap.ts` + `project.json` — tree fix, sway, shadow tune
- `docs/research/scene-schema-split-notes.md` (new — for S48 follow-up)
- `THIRD_PARTY_NOTICES.md` — removed stale References/ block (those folders are gitignored)

### Verification

- `npm run typecheck` ✅
- `npm run test` ✅ — 68 files, 429 tests (+9 from S46).
- `npm run engine:check:examples` ✅
- `npm run test:e2e:smoke` ✅ — 11/11 in 25 s
- Visual: beacon repair bounces + sparkles; pickup sparkles on core; trees sway; shadow gap under buildings closed; 120 fps maintained at max zoom in shadows-bench

## Sprint 48 — Schema split + shadows-bench cars

Status: Completed and archived.

Two heavy-lift items: a structural refactor (scene.schema.json was 800 lines; agents drowned opening it cold) plus a visible feature (shadows-bench gains roads + cars on the wind-swept village). Plus a fix for the S45 list/explain bug that pointed at the wrong project-local schema filename.

### Completed Work

1. **SCHEMA-scene-split** ✅ — `scene.schema.json` shrinks from 798 → 210 lines. Component definitions move to `schemas/components/{core,render,camera,physics-3d,gamefeel,network}.schema.json` (75-352 lines each). Shared types (`vec3`) move to `schemas/common.schema.json`. New `engine/tools/schemas/load-scene-schema.ts` bundler walks external `$ref`s, inlines them back into a single in-memory schema for AJV — no cross-file AJV machinery, all 7 consumers (project-check, list-components, explain-component, the 4 scene-* unit tests) call the same loader. 429 unit tests still green.
2. **list/explain fix** ✅ — `engine list components <projectDir>` and `engine explain component <Name> <projectDir>` were pointing at the non-existent `project-local-components.schema.json`. Now read `<projectDir>/schemas/scene-extensions.schema.json` (the file `engine check` actually uses) and resolve `$ref`s through it. Verified: shadows-bench's `RtsCamera` shows up in the catalog.
3. **M19-WaypointMover** ✅ — generic `WaypointMover { waypoints[], loop, elapsed, faceForward }` component + `WaypointMoverSystem`. Sibling of CinematicCamera but for any Transform (not just the active camera) + derives yaw from velocity when `faceForward: true`. Replay-safe via fixed-update. 4 unit tests.
4. **shadows-bench roads + cars** ✅ — 2 cross-shaped roads (EW + NS) sit just above the ground. 6 cars ping-pong along them, each on its own lane (±1.2 / 0.0) so traffic never collides. Each car is a parent entity (WaypointMover-driven) with child body + cabin + 4 wheels — proper car shape, not a cube. `pulse`-loop Tween on each body provides a subtle ~0.6° roll wobble with staggered phase.
5. **shadows-bench trees actually sway** ✅ — the S47 wind-sway tween wasn't visible because the canopy was a sibling entity, not parented to the trunk. Restructured each tree as a root + child trunk + child canopy hierarchy parented to a sway-tweened root, so the whole tree pivots from the base.

### Deliverables

- `schemas/scene.schema.json` (798 → 210 lines)
- `schemas/common.schema.json` + `schemas/components/*.schema.json` (new)
- `engine/tools/schemas/load-scene-schema.ts` (new — bundler)
- `engine/core/systems/waypoint-mover-system.ts` (new)
- `engine/runtime/start.ts` — register WaypointMoverSystem
- `examples/shadows-bench/bootstrap.ts` — roads + 6 cars (parent/child hierarchy) + tree hierarchy rewrite for visible sway
- `tests/unit/waypoint-mover-system.test.ts` (new) + 4 scene-* tests now use `loadBundledSceneSchema`
- `engine/tools/components/{list,explain}-component.ts` — fixed scene-extensions path
- `SECURITY.md` — slimmed down, dropped maintainer's personal email

### Verification

- `npm run typecheck` ✅
- `npm run test` ✅ — 69 files, 433 tests
- `npm run engine:check:examples` ✅ — 5 projects OK
- `npm run engine:list -- components examples/shadows-bench` ✅ — 20 built-ins + `RtsCamera` (project-local)
- Live probe: trees sway (tree.0 X rotation oscillates), cars move on dedicated lanes (car.0 traverses -34→-21 in 1.5s), zero page errors

### Follow-Ups

- `render-pool-abstraction` — unify InstancedMesh / BatchedMesh / Particle pools under one BucketSpec + dispatcher. Carried into Sprint 52 candidates.

## Sprint 49 — rendererInfo accuracy + hygiene tidy

Status: Completed and archived.

Small follow-ups noticed after S48 landed.

### Completed Work

1. **RENDERER-info-autoReset** ✅ — `__agf.rendererInfo().drawCalls` reported `1` for shadows-bench despite the scene having 300+ meshes. Root cause: `WebGLRenderer.info` resets its counters at the start of every `.render()` call, and the EffectComposer (FXAA + OutputPass in shadows-bench) issues 3 render passes per frame — so the values we read after composer.render() reflected only the final OutputPass, a single full-screen quad. Disabled `device.info.autoReset` + reset manually at the start of `draw()` so counters accumulate across every pass. shadows-bench now reports `drawCalls: 194, triangles: 70 274`.
2. **HYGIENE-backlog-cyrillic** ✅ — Removed a stray Russian phrase from `BACKLOG.md`'s S43 archive entry (`repo:hygiene` ignores it because it's already on `main`, but cleaning it up now means no future scanning surprise).

### Verification

- `npm run typecheck` ✅
- `npm run test` ✅ — 433 tests
- Live probe shadows-bench: `drawCalls: 194` (was `1`), `triangles: 70 274` (was `1`), zero page errors.

## Sprint 50 — auto-batch + per-instance color + perf squeeze

Status: Completed and archived.

Three compounding wins for shadows-bench (one project.json flag): **drawCalls 203 → 5** (40×) and **renderMs 3.60 → 0.39** (9×). Plus the perf-squeeze follow-ups landed in the same PR after the first round revealed a static-instance GPU-upload regression.

### Completed Work

1. **M17-batchable-color-variants** ✅ — adapter `acquireBucket({ useInstanceColor: true })` allocates the `instanceColor` InstancedBufferAttribute on the InstancedMesh + `setBucketInstanceColor(handle, index, color)` writes per-slot colour. `BatchingSystem.updateInstanced` drops `renderer.color` from the bucket key so different-coloured entities collapse into one InstancedMesh.
2. **M17-auto-batch-primitives** ✅ — `BatchingOptions.autoIncludePrimitives` plumbed through `RuntimeOptions.autoBatchPrimitives` + `project.json#render.batching.auto`. When on, every entity with a built-in primitive mesh, no LOD, no manifest material is auto-batched without `Batchable`. Per-entity opt-out: `Batchable: { enabled: false }`. All 5 example projects (hello-3d, beacon-world, batch-bench, physics-bench, shadows-bench) have the flag on.
3. **M17-system-ordering** ✅ — BatchingSystem moved BEFORE MeshLifecycleSystem so `BatchedMeshHandle` is set first. `MeshLifecycleSystem.frameUpdate` AND `ThreeRenderer.refreshMeshes` (the fallback path called every frame from `render()`) both now skip entities with `BatchedMeshHandle` — the historical filter only looked at `Batchable`, so auto-batched entities were double-rendered (the 310-draw / 27 ms-frame regression caught during S50 development).
4. **M17-perf-ltw-cache** ✅ — `BatchingSystem.InstancedRecord.lastWorld` caches the last-written `[px,py,pz,rx,ry,rz,sx,sy,sz]` per instance. `updateInstanced` skips both `setBucketInstanceTransform` AND `instanceMatrix.needsUpdate` when the LTW is bit-identical. Static buildings / rocks / roads no longer force a full 305 × 16 float GPU re-upload every frame.
5. **M17-perf-color-cache** ✅ — Same idea for `setBucketInstanceColor` — cached per-instance colour means a frame with no colour changes doesn't dirty the instanceColor attribute.
6. **M17-perf-bucket-frustum-culling** ✅ — InstancedMesh buckets now ship with `frustumCulled = true`. `recomputeBucketBoundingSphere(handle)` is called once per frame per dirty bucket (tracked by `dirtyInstancedBuckets: Set<BucketHandle>` populated by the LTW cache misses + instance add/remove). Three.js then skips the whole bucket per camera-pass when its sphere is outside the frustum.
7. **shadows-bench adoption** ✅ — `project.json#render.batching.auto: true`; trees + rocks + **buildings** repositioned to clear the road corridors via `clearRoadCorridor(x, z, buffer)` (now per-entity buffer; buildings use `max(w, d)/2 + 0.5` so their footprint never crosses the kerb).
8. **Three.js batching research note** ✅ — `docs/research/m17-three-batching-references.md` summarises the relevant `References/three.js/examples/*.html` (`webgl_mesh_batch`, `webgl_instancing_dynamic`, `webgl_batch_lod_bvh`, etc.) and sequences the follow-up perf work into Sprint 51 candidates: BatchedMesh primary path with `perObjectFrustumCulled`, BVH extension, LOD-batched geometry.

### Verification

- `npm run typecheck` ✅
- `npm run test` ✅ — 69 files, 433 tests (one existing batching test rewritten for the new colour-variant semantics)
- shadows-bench live probe with `batching.auto: true`:
  - drawCalls: **203 → 5** (40× fewer)
  - frame time: **5.4 ms → 1.4 ms** (4× faster)
  - `meshes: 0`, `buckets: 3`, `bucketInstances: 305`, `handleLeak: 0`

### Follow-Ups

GLB mesh batching, material-manifest batching, default-on once those land, and a cleaner BucketSpec abstraction over the InstancedMesh + BatchedMesh paths — picked up across S51 (GLB + manifest + BatchedMesh primary path) and Sprint 52 candidates (RENDER-bucket-key-architecture, M17-batch-default-on).

## Sprint 51 — BatchedMesh perf path + shadows-bench shadow deep-dive

Status: Completed and archived.

### Completed Work

1. **DOCTOR-batching-report** ✅ — `engine doctor` gains a top-level `Batching:` section reading `project.json#render.batching.auto/path` + breaking renderables into primitives vs externals + reporting collapsed/available draw-call savings + surfacing a "flip the switch" recommendation when auto is off. Counts explicit `Batchable` annotations and `enabled: false` opt-outs.
2. **DOCS-build-a-game-batching** ✅ — "Cut draw calls with auto-batch" recipe in `docs/agent/build-a-game.md` covering opt-in, per-entity opt-out, group hint, doctor verification.
3. **M17-batched-mesh-primary** ✅ — BatchedMesh adapter path: `perObjectFrustumCulled = true` explicit, geometries get `computeBoundingBox()` + `computeBoundingSphere()` on add, new `setBatchedInstanceColor` for per-instance colour parity. `BatchingOptions.defaultPath` plumbed through `RuntimeOptions.batchingPath` ← `project.json#render.batching.path`. Doctor surfaces `path=...`.
4. **M17-batched-colour-squaring fix** ✅ — bucket key + material colour both carried `renderer.color` so per-instance × material colour squared → darker scene. Fix mirrors S50: drop colour from key, anchor material at white.
5. **M17-batched-vs-instanced measurement** ✅ — wrote `scripts/perf-probe-batching.mjs` (Playwright A/B, patches project.json, reloads, samples for N seconds, restores on SIGINT). shadows-bench result: `batched` saves 36 % draw calls + 17.9 % triangles via per-instance culling, but `renderMs` rises +63.5 % (multi-draw command overhead on small scene with most instances in view). Decision: shadows-bench reverts to `instanced`; `batched` plumbing stays. Findings: `docs/research/m17-batched-vs-instanced-shadows-bench.md`.
6. **SHADOWS-bench-perf-deepdive** ✅ — wrote `scripts/perf-probe-shadows.mjs` (sister probe, fresh browser per scenario so PCSS's one-way substitution can't leak). 6 scenarios measured. Findings: cascade count is the dominant lever (3 → 2 = −17.1 % renderMs); PCSS cost only +6.5 % (smaller than expected); shadowMapSize 1024 → 512 just −3.8 % in software-WebGL; programs counter flat (no shader churn). Combined `pcf + 2c + 512` saves 15.2 % renderMs at moderate visual cost. shadows-bench config left as-is (visual decision). Three follow-ups filed: `M21-shadow-static-caster-tag` (main perf win), `M21-shadow-map-size-real-hw`, `M21-fxaa-cost-isolation`. Notes: `docs/research/m21-shadows-bench-perf.md`.
7. **shadow autoUpdate hotfix** ✅ — `examples/shadows-bench/project.json` dropped `shadows.autoUpdate: false`. The flag was left from the previously-static scene; after S48 added moving cars + swaying trees the per-frame shadow map needed to refresh.
8. **e2e fix at sprint close** ✅ — hello-3d smoke assertion `info.meshes > 0` failed under auto-batch (everything in buckets, `meshes` reads 0). Sum `meshes + bucketInstances + batchedBucketInstances` so either path counts.

### Deliverables

- `engine/render/three-render-adapter.ts` — BatchedMesh: `perObjectFrustumCulled = true`, geometry bounding-box compute on add, `setBatchedInstanceColor`, material anchored at white.
- `engine/render/systems/batching-system.ts` — `BatchingOptions.defaultPath`, per-instance colour stamping in batched path, bucket key drops `renderer.color`.
- `engine/runtime/start.ts` — `RuntimeOptions.batchingPath` plumbing.
- `engine/tools/doctor/project-doctor.ts` — new `Batching:` section + `formatBatching` helper + `BatchingConfigReport` type.
- `schemas/project.schema.json` — `render.batching.path: "instanced" | "batched"` declared.
- `src/app.ts` — project.json `render.batching.path` → `runtimeOptions.batchingPath`.
- `examples/shadows-bench/project.json` — dropped `shadows.autoUpdate: false`; kept `batching.auto: true`, path stays default (instanced).
- `tests/e2e/app.spec.ts` — sums bucket instances when asserting "rendered something".
- `tests/unit/doctor-batching.test.ts` (new) — 4 cases.
- `tests/unit/batching-system-batched-path.test.ts` (new) — 4 cases incl. colour-squaring regression.
- `scripts/perf-probe-batching.mjs` (new) — reusable instanced ↔ batched A/B.
- `scripts/perf-probe-shadows.mjs` (new) — reusable named-scenario shadow probe.
- `docs/research/m17-batched-vs-instanced-shadows-bench.md` (new) — A/B numbers + crossover analysis.
- `docs/research/m21-shadows-bench-perf.md` (new) — 6-scenario deep-dive + follow-up story list.
- `docs/agent/build-a-game.md` — "Cut draw calls with auto-batch" recipe.

### Verification

- `npm run typecheck` ✅
- `npm run test` ✅ — 71 files / 440+ tests (incl. 8 new batching-doctor + batched-path cases).
- `npm run preflight` ✅ at sprint close — 11/11 e2e smoke green after the `meshes`-counter fix.
- `npm run engine:doctor -- examples/{shadows-bench, beacon-world}` ✅ — prints new `Batching:` section correctly.
- `node scripts/perf-probe-batching.mjs` ✅ — A/B numbers reproducible.
- `node scripts/perf-probe-shadows.mjs --durationMs 4000` ✅ — 6 scenarios reproducible.
- Merged via PR [#54](https://github.com/MaxMinsk/AGF/pull/54).

### Follow-Ups

- `M21-shadow-static-caster-tag` (Sprint 52, highest-impact perf follow-up — tagged dynamic vs static casters, restore `autoUpdate=false` for ~290 static entities while keeping cars + swaying trees correct).
- `M21-shadow-map-size-real-hw` — user-driven measurement, software-WebGL undersells fill-rate savings.
- `M21-fxaa-cost-isolation` — quick probe extension.
- `M17-bvh-extension` — `@three.ez/batched-mesh-extensions` may flip the `batched` crossover toward smaller scenes; own sprint when prioritised.
- shadows-bench picture got dimmer after S51's autoUpdate/bias changes — picked up as `POLISH-shadows-bench-*` in Sprint 52.

## Sprint 52 — shadow perf + shadows-bench polish

Status: Completed and archived.

Twin focus: restore the visual quality of shadows-bench (the scene got visibly dimmer after S51's `autoUpdate=true` / normalBias / per-frame-shadow trade-offs) AND close the perf regression via a static-caster tagging primitive (main prize from the S51 deep-dive). All 9 stories landed.

### Completed Work

1. **POLISH-shadows-bench-lighting** ✅ — ACES Filmic tonemap (`render.color.toneMapping`) + exposure tuned to 0.9; directional intensity 1.55 → 2.1; hemisphere ambient 0.55 → 0.45 with a warm `groundColor: "#5b4a35"` so shaded faces pick up bounce; `shadowNormalBias: 0.12 → 0.06` (sized for the 1024 shadow map after S47's drop from 2048); background `#3a5066 → #5d7d9b`. SHADOW_DEFAULTS in `bootstrap.ts` synced so the tuner's "Reset to defaults" restores the shipped state.
2. **POLISH-shadows-bench-materials** ✅ — palette refresh sized for ACES: buildings 5 → 6 entries (warm cream / sandstone / muddy tan / pale ochre / dusty taupe / bright stucco); roofs 3 → 4 (terracotta / burnt sienna / light brick / weathered red); trees 3 → 4 (fresh leaf / bright canopy / shaded foliage / sun-lit lime); rocks 3 → 4 (warm-stone / light grey-tan / shaded boulder / weathered chalk). Trunk `#5a3a23 → #6f4a30`; road `#2f3135 → #3a3c40`; ground `#3e5f44 → #4f7a4d`. All entries inline Standard so auto-batch still collapses to one InstancedMesh per primitive mesh.
3. **POLISH-shadows-bench-composition** ✅ — tree-size variance widened (trunk 0.8..1.6 → 0.6..2.0, canopy 0.7..1.4 → 0.5..1.6); 8 lampposts placed along EW + NS streets (pole + warm `#f0c869` head per lamp); 6 plaza props around the central intersection (4 planter boxes at quadrant corners + 2 smaller crates flanking the EW road). Entity count 393 → 415, drawCalls steady at 11.
4. **POLISH-shadows-bench-sky** ✅ — new `project.json#render.skyGradient: { top, bottom }` schema + adapter `createGradientTexture()` (4×256 CanvasTexture, sRGB) that overrides the solid background. `RuntimeOptions.skyGradient` plumbed through `ThreeRenderer` → `ThreeRenderAdapter`. shadows-bench gets `{ top: "#3f6589", bottom: "#bdc8d2" }`. The procedural IBL (`scene.environment: "generated"` via RoomEnvironment + PMREMGenerator) is untouched — the gradient is purely the visible skybox.
5. **M21-shadow-static-caster-tag** ✅ — new `ShadowCaster { dynamic: boolean }` component (schema in `schemas/components/render.schema.json`, scene-schema entry in `schemas/scene.schema.json`) + `engine/render/systems/dynamic-shadow-system.ts`. The system is dormant until ≥1 entity carries `dynamic: true`, then flips `setShadowMapAutoUpdate(false)` and only calls `invalidateShadowMap()` when a tagged entity's LTW changes (epsilon 1e-5). Restores `autoUpdate=true` if the tag set empties. Wired into the renderer scheduler last so LTW is fresh from `TransformResolveSystem`. shadows-bench tags 6 cars + ~80 tree roots; ~290 static entities skip the per-frame shadow re-bake. Live probe: `renderMs 0.58 → 0.48 (−17 %)`, `totalFrameMs 1.92 → 1.82` despite 22 added entities. Real payoff lands on scenes with idle dynamic casters (beacon-world drone, NPCs at rest). 5 unit tests cover the contract.
6. **DOCTOR-shadow-section** ✅ — new `ShadowConfigReport` + `Shadows:` block in `engine doctor` output, mirroring the S51 `Batching:` section. Reads `render.shadows.algorithm / autoUpdate / csm.cascades / csm.shadowMapSize` from `project.json` + scans scene JSON for `ShadowCaster` tag counts. Two recommendations: cascade-cost (`3 cascades cost ~17% renderMs vs 2`) when `cascades ≥ 3` + dynamic-caster nudge when `autoUpdate=true` and no `dynamic: true` tags.
7. **M21-fxaa-cost-isolation** ✅ — added a `noFXAA` scenario to `scripts/perf-probe-shadows.mjs` (`render.post = []`). Empirical finding: **FXAA costs ~14 % renderMs** on shadows-bench (`0.49 → 0.42`), not the < 0.05 ms the hypothesis assumed. Two extra draw calls disappear (FXAA quad + OutputPass). Second-largest single perf lever after cascade count.
8. **shadow-tuner-persistence** ✅ — S48 shadow tuner now persists state to `localStorage["agf.shadows-bench.shadow-tuner"]` on every field change. `loadPersisted()` restores per-field on init (forward-compatible — unknown keys ignored). Reset button calls `clearPersisted()` so next reload starts from project.json defaults. Private-mode browsers / quota errors silently no-op'd.
9. **render-pool-abstraction** ✅ (design memo only; impl deferred) — `docs/research/render-pool-abstraction-design.md` scopes the ~150-line triplication across `acquireBucket` / `acquireBatchedBucket` / `acquireParticlePool` and proposes a 4-step unification (shared `RenderPoolRegistry<Spec, Entry>` helper → tagged `PoolHandle` union → `acquirePool(spec)` dispatcher → opt-in caller migration). Implementation deferred to a sprint that pairs it with `RENDER-bucket-key-architecture` + `M17-bvh-extension` since all three touch the same surface.

### Deliverables

- `engine/render/systems/dynamic-shadow-system.ts` (new) — `DynamicShadowSystem`.
- `engine/render/three-render-adapter.ts` — `createGradientTexture()` + `SkyGradient` type + `CanvasTexture` import + gradient/background branching at scene-init.
- `engine/render/three-renderer.ts` — `skyGradient` forwarded through the ctor.
- `engine/runtime/start.ts` — `RuntimeOptions.skyGradient` + `DynamicShadowSystem` registration.
- `engine/tools/doctor/project-doctor.ts` — `ShadowConfigReport` + `summarizeShadows()` + `countShadowCasters()` + `formatShadows()` + cascade-cost & dynamic-caster recommendations.
- `schemas/project.schema.json` — `render.skyGradient` declared.
- `schemas/scene.schema.json` + `schemas/components/render.schema.json` — `ShadowCaster` component.
- `src/app.ts` — `project.json#render.skyGradient` → `runtimeOptions.skyGradient`.
- `examples/shadows-bench/project.json` — ACES tonemap + exposure 0.9 + lightIntensity 2.1 + shadowNormalBias 0.06 + new background + `skyGradient`.
- `examples/shadows-bench/scenes/start.scene.json` — hemisphere intensity 0.45 + `groundColor` + brighter ground.
- `examples/shadows-bench/bootstrap.ts` — palette refresh, tree variance, 8 lampposts + 6 plaza props, `ShadowCaster { dynamic: true }` on cars + tree roots, `SHADOW_DEFAULTS` synced.
- `examples/shadows-bench/src/ui/shadow-tuner.ts` — localStorage persistence.
- `scripts/perf-probe-shadows.mjs` — `noFXAA` scenario.
- `tests/unit/dynamic-shadow-system.test.ts` (new) — 5 cases.
- `docs/research/m21-shadows-bench-perf.md` — appended FXAA + static-caster-tag findings.
- `docs/research/render-pool-abstraction-design.md` (new) — pool-unification design memo.
- `test-results/s52-shadows-bench/{01-before, 02..09}.png` — visual diff progression.

### Verification

- `npm run preflight` ✅ at sprint close — repo:hygiene + 5 engine:check projects + imports:check + systems:check + typecheck + 72-file unit test (446 tests, +5 new) + build + bundle:check + 11/11 e2e smoke (23 s).
- `node scripts/perf-probe-shadows.mjs --durationMs 4000 --only baseline,noFXAA` ✅ — FXAA delta reproducible.
- `npm run engine:doctor -- examples/shadows-bench` ✅ — prints new `Shadows:` block.
- Live perf delta on shadows-bench: `renderMs 0.58 → 0.48 (−17 %)`, `totalFrameMs 1.92 → 1.82 (−5.2 %)`.
- Visual regression: `test-results/s52-shadows-bench/01-before.png` → `09-sky.png` show the lighting / materials / composition / sky progression.
- Merged via PR [#56](https://github.com/MaxMinsk/AGF/pull/56). Resolved a `BACKLOG.md` conflict at merge time by rebasing the sprint branch onto the post-archive main.

### Follow-Ups

- **render-pool-abstraction impl** — design landed; implementation deferred to a sprint that bundles it with `RENDER-bucket-key-architecture` + `M17-bvh-extension`.
- **shadow-tuner project.json save** — current persistence is localStorage only. A "Save to project.json" button would need a new dev-bridge endpoint (e.g. `POST /__agf/project-patch`); filed as a future story.
- **Static-caster wins on idle scenes** — shadows-bench saw only `−17 %` because cars + trees move every frame. The mechanism delivers more on scenes with idle dynamic casters (beacon-world drone, NPCs at rest); worth measuring there.
- **`M21-shadow-map-size-real-hw`** stays in Next Sprint candidates (user-driven measurement).
- **`M17-bvh-extension`** stays in Next Sprint candidates (own sprint).

## Sprint 53 — renderer refactor (pool + bucket + BVH)

Status: Completed and archived.

13 stories that consolidate the renderer's pool / bucket / batching surface accreted through S34–S52, ship the BVH-augmented BatchedMesh path the S51 deep-dive flagged, and close four S52 follow-ups (project.json save for the tuner, beacon idle-caster verification, M17-batch-default-on, M17-lod-batched) along the way. Plus a same-sprint hotfix when the BEACON ShadowCaster tag turned out to ship a visual regression — the corrected `DynamicShadowSystem` contract is recorded under "Follow-Ups".

### Completed Work

1. **RENDER-pool-registry** ✅ — `engine/render/render-pool-registry.ts`. Shared `RenderPoolRegistry<Entry>` helper replaces the `Map<H, Entry>` + `next<P>Handle` pattern across InstancedMesh + BatchedMesh + particle pool. Adapter call sites refactored; public API unchanged.
2. **RENDER-bucket-spec-typed** ✅ — `engine/render/bucket-spec.ts`. Typed `BucketSpec` discriminated union (`instanced` / `batched` / `batched-bvh`) + `bucketSpecHash()` retire the hand-rolled `instanced|<mesh>|<material>|<shadow>|<group>` string keys. Hash output identical to the legacy strings so existing tests pass unchanged.
3. **RENDER-pool-handle-union** ✅ — tagged `PoolHandle` union + `adapter.acquirePool(spec, opts): PoolHandle` dispatcher + `poolLiveCount` / `releasePool`. Per-kind methods stay public for back-compat. New unit suite `tests/unit/bucket-spec.test.ts` (6 cases).
4. **M17-batch-default-on** ✅ — `project.json#render.batching.auto` default flipped from false → true. Doctor recommendation copy updated to surface the explicit-disabled case. All 5 example projects keep their explicit `auto: true` (redundant now but harmless).
5. **M17-bvh-extension** ✅ — `@three.ez/batched-mesh-extensions` added as dep. `extendBatchedMeshPrototype()` runs once at module load. New `project.json#render.batching.path: "batched-bvh"` routes through the new path; adapter `ensureBucketBvh(handle)` lazily builds the BVH after first instance lands. `BatchingSystem.updateBatched` accepts a `useBvh` flag and walks the `record.useBvh` set at end-of-frame.
6. **M17-batch-perf-rerun** ✅ — extended `scripts/perf-probe-batching.mjs` with a `--projectId` flag. Measured `instanced` / `batched` / `batched-bvh` on shadows-bench (327 instances) + batch-bench (401 cubes). Headline: BVH culled **84 % of triangles** on shadows-bench (451 k → 70 k) and **strictly dominated vanilla `batched`** (renderMs 0.74 → 0.57). On software-WebGL `batched-bvh` still loses to `instanced` because fillrate-bound dispatch dominates; real-hardware delta filed as follow-up. Findings appended to `docs/research/m17-batched-vs-instanced-shadows-bench.md`.
7. **M17-lod-batched** ✅ — pinned the existing in-bucket LOD-swap behaviour with a new regression test (`tests/unit/batching-system-batched-path.test.ts`): mesh-ref change on a tagged-batched entity adds a new geometry to the same bucket + calls `setBatchedInstanceGeometry` without releasing the slot. LOD system docstring updated to spell out the batched-vs-instanced distinction.
8. **DEVBRIDGE-project-patch** ✅ — new `POST /__agf/project-patch` endpoint (DEV-only). Body: `{ projectDir, patch }`. Path-traversal guarded; deep-merges patch onto current project.json; writes with 2-space indent + trailing newline. Production builds exclude the dev-bridge plugin entirely. 6 unit-tests for the `deepMerge` semantics (`tests/unit/devbridge-project-patch.test.ts`).
9. **shadow-tuner-project-save** ✅ — "Save to project.json" button in `examples/shadows-bench/src/ui/shadow-tuner.ts` POSTs the current `FieldState` to the new endpoint, clears the localStorage shadow on success, falls back to a "endpoint unavailable" message when the dev bridge isn't there.
10. **BEACON-shadow-caster-tag** ✅ — beacon-world's player drone tagged `ShadowCaster { dynamic: true }`. `scripts/perf-probe-beacon-tag.mjs` A/B probe toggles the tag, reloads, samples renderer info. (See Follow-Ups for the visual regression caught here and the fix.)
11. **DOCTOR-renderer-pool-section** ✅ — `engine doctor` `Batching:` section gains `pathDistribution: { instanced, batched, batchedBvh }` with the per-entity `Batchable.path` override applied on top of the project default. Plus a new recommendation: when `path: "batched"` is set with primitive-rich scenes, suggests upgrading to `batched-bvh` with the Story 6 perf numbers.
12. **RENDER-pool-test-coverage** ✅ — `tests/unit/render-pool-registry.test.ts` (8 cases). Pins handle monotonicity, no-handle-reuse-after-release, drain semantics. S53 test coverage matrix recorded in commit body.
13. **RENDER-bucket-key-architecture-finalize** ✅ — `InstancedRecord` + `BatchedRecord` gain a `spec: BucketSpec` typed companion to `bucketKey`. Grep confirmed zero remaining hand-rolled `instanced|...|` / `batched|...|` string constructions outside `bucketSpecHash`.

### Deliverables

- `engine/render/render-pool-registry.ts` (new) + `engine/render/bucket-spec.ts` (new).
- `engine/render/three-render-adapter.ts` — pool fields swap to `RenderPoolRegistry<Entry>`; `acquirePool` / `poolLiveCount` / `releasePool` added; `acquireBatchedBucket` accepts `useBvh`; `ensureBucketBvh` added; `BatchedBucketEntry` gains `useBvh` + `bvhBuilt`; `extendBatchedMeshPrototype()` called at module load.
- `engine/render/systems/batching-system.ts` — `defaultPath` widened to include `"batched-bvh"`; `updateBatched` accepts `useBvh`, threads to `acquireBatchedBucket`, dispatch picks `"batched-bvh"` kind for `BucketSpec`; both records gain `spec`; end-of-frame `ensureBucketBvh` walk.
- `engine/render/systems/dynamic-shadow-system.ts` — new movement-gated takeover: DSS stays no-op until first real LTW change.
- `engine/render/systems/lod-selection-system.ts` — docstring updated.
- `engine/runtime/start.ts` — `RuntimeOptions.batchingPath` widened to include `"batched-bvh"`.
- `engine/dev/agf-dev-bridge.ts` — `/project-patch` route + `handleProjectPatch` + `deepMerge` helper exported.
- `engine/tools/doctor/project-doctor.ts` — autoBatch default flipped; pool distribution + recommendations.
- `schemas/project.schema.json` — `auto.default: true`; `path.enum` widened.
- `examples/beacon-world/scenes/start.scene.json` — drone gains `ShadowCaster { dynamic: true }`.
- `examples/shadows-bench/src/ui/shadow-tuner.ts` — Save-to-project.json button.
- `package.json` — `@three.ez/batched-mesh-extensions` dependency added.
- `scripts/perf-probe-batching.mjs` — `--projectId` flag + `batched-bvh` in defaults.
- `scripts/perf-probe-beacon-tag.mjs` (new) — A/B probe for the idle-caster scenario.
- 5 new unit-test files (bucket-spec, render-pool-registry, devbridge-project-patch, batching-system-batched-path BVH cases, dynamic-shadow-system movement-gated rewrite).
- `docs/research/m17-batched-vs-instanced-shadows-bench.md` — `batched-bvh` numbers appended.
- `docs/research/m21-shadows-bench-perf.md` — corrected BEACON measurement + audit-trail of the regression.

### Verification

- `npm run preflight` ✅ at sprint close — repo:hygiene + 5 engine:check projects + imports:check + systems:check + typecheck + 75-file unit test (470 tests) + build + bundle:check + 11/11 e2e smoke.
- `node scripts/perf-probe-batching.mjs --projectId shadows-bench` ✅ — `batched-bvh` numbers reproducible.
- `node scripts/perf-probe-beacon-tag.mjs` ✅ — A/B reproducible.
- `npm run engine:doctor -- examples/shadows-bench` ✅ — new pool distribution + BVH recommendation render correctly.
- Beacon-world screenshot post-fix: 39 draw calls, all four objects cast clear shadows on the ground (visual regression closed).
- Merged via PR [#58](https://github.com/MaxMinsk/google.com/MaxMinsk/AGF/pull/58).

### Follow-Ups

- **DSS visual regression (caught + fixed in-sprint).** First version of the `BEACON-shadow-caster-tag` ship turned `shadowMap.autoUpdate = false` on the first frame DSS saw a dynamic-tagged caster, before three.js had baked any shadow into the per-light textures. Symptom: "no shadows at startup, only appear after the drone moves". The fix lives in commit `aa03dea`: DSS now only takes over after observing a real LTW change. While every tagged caster is idle, three.js's `autoUpdate=true` default keeps baking the usual way. **Implication for the perf claim**: the previously-reported `−37 % renderMs / −85 % drawCalls` on idle beacon-world was a visual regression in disguise (no shadows = no shadow draws), not a real win. The honest delta for the idle scene is now `0 %` until the player moves; the real saving lands on movement-then-idle scenes. Filed in `docs/research/m21-shadows-bench-perf.md` under audit trail.
- **Real-hardware BVH measurement.** Software-WebGL is fillrate-bound, so the 84 % triangle savings on shadows-bench didn't convert to a renderMs win. Real-hw probe (the user's machine) would flip the `batched-bvh` vs `instanced` crossover. Stays as the open follow-up alongside `M21-shadow-map-size-real-hw`.
- **Move-then-stop perf re-probe.** The naive idle-only probe now matches the no-tag baseline by design. A future probe should record a sequence: idle → move → stop → idle, sampling the "stopped after a move" phase explicitly so the DSS savings actually show up in the numbers.
- **render-pool-abstraction full caller migration.** Stories 1–3 + 13 set up the typed dispatcher + `PoolHandle` union, but most adapter call sites still use the per-kind acquire / release methods. A future sprint can migrate the call sites + retire the per-kind methods if the migration delivers measurable maintenance savings.
- **GLB inside batched buckets.** `updateBatched` falls back to a placeholder geometry when the mesh ref isn't a primitive. The `instanced` path handles GLB via `loadGeometry` (asset registry); the batched paths could be threaded the same way for full parity.


## Sprint 54 - Asset pipeline + prefabs + runtime loading

Status: Completed and archived.

### Completed Work

1. **ASSET-optimize-command** ✅ — `engine asset optimize <projectDir> [path]` CLI invoking `@gltf-transform/functions` with the project's preset (dedup → prune → weld → meshopt). Writes `<asset>.opt.glb` + prints before/after byte counts. Added `--source <path>` for per-file mode and `--textures` flag (locked WebP target).
2. **ASSET-lod-metadata** ✅ — `schemas/lod.schema.json` covering `levels: [{ maxDistance, mesh, material?, color? }]` + `fallback: "last" | "hide"`. `engine check` validates ascending distances, mesh refs resolve, duplicates flagged. Diagnostic codes `AGF_LOD_DISTANCES_OUT_OF_ORDER` / `AGF_LOD_DISTANCE_DUPLICATE` / `AGF_LOD_MESH_MISSING`.
3. **ASSET-texture-doctor** ✅ — `engine doctor` warnings: `AGF_TEXTURE_HUGE` (>1 MB uncompressed PNG/JPEG), `AGF_TEXTURE_NPOT` (non-power-of-two map dims), `AGF_TEXTURE_NO_TRANSCODER` (`.ktx2` ref without decoder).
4. **ASSET-texture-compress** ✅ — `engine asset optimize --textures` flag runs `@gltf-transform/functions#textureCompress` with WebP target. Skips already-compressed files; updates material manifests in place.
5. **ASSET-decoder-vendor** ✅ — Draco / Basis / Meshopt decoder paths verified for production builds; e2e smoke loads a `.ktx2` texture from beacon-world without falling back.
6. **M3-c-load** ✅ — `SceneInput.instances` flow. `engine/runtime/start.ts` calls `expandScenePrefabs` before `World.fromScene` whenever a scene declares instances; expansion diagnostics route to the bus. `src/main.ts` glob-imports `examples/<id>/prefabs/*.prefab.json` per project into a `Map<id, PrefabDefinition>` and passes through `AppOptions.prefabs`. `engine check` cross-validates `scene.instances[].prefab` against `prefabs/<id>.prefab.json`; instance id collisions surface as `AGF_SCENE_INSTANCE_DUPLICATE_ID`. The expander now preserves top-level scene fields (`environment`, etc.) — previously dropped.
7. **M3-c-beacon** ✅ — `examples/beacon-world/prefabs/{beacon,energy-core}.prefab.json` declared. Four hand-rolled `beacon.*` / `core.*` entities collapsed into a `scene.instances` block with per-instance `Name` / `Transform` / `Spin` / `Pickup.originalPosition` overrides. scenes/start.scene.json: 356 → 300 lines. Entity ids preserved so light + tests resolve.
8. **RUNTIME-progressive-loading** ✅ — `project.json#render.criticalAssets: string[]` declares the asset refs that must finish loading before `rendererReady` resolves; every other asset stays on the existing placeholder-then-swap path. Helper `criticalAssetsReady(world, refs)` exported for tests + tooling.
9. **RUNTIME-idle-rendering** ✅ — `World.mutationCounter()` (monotonic, bumps on every add/remove/setComponent/removeComponent). `startRuntime` honours `project.json#render.idleMode: "always" | "on-demand"`: in `on-demand` it skips `renderer.render()` when the counter is unchanged from the previous frame. First frame, resize, and any mutation always render.
10. **RUNTIME-gpu-timing** ✅ — `ThreeRenderAdapter.draw()` wraps the frame in a `EXT_disjoint_timer_query_webgl2` `TIME_ELAPSED` query when the extension is available. `AdapterInfo.gpuMs` carries the latest ms reading (1–2 frame lag) through to `window.__agf.rendererInfo().gpuMs`. Stays `undefined` on Safari / RFP-Firefox / non-WebGL2.
11. **DOCS-asset-pipeline** — Deferred into S55's agent-surface refresh; tracked there.
12. **DOCTOR-prefab-section** ✅ — `engine doctor` `Prefabs:` section: declared count, total scene-instance count, top-3 ids by usage, plus diagnostics for unused declared prefabs + scene refs to unknown prefab ids.
13. **BENCH-material-bench** ✅ (added mid-sprint) — new `examples/material-bench/` showcase. Centre chrome sphere + 12 outer spheres on cement cylinder pedestals parented to a `Spin`-rotated root; HDR sky (`venice_sunset_1k.hdr`) drives IBL + acts as a blurred background; 12 material slots span standard / physical shader axes. Pulled engine work into the same commit: `cylinder` primitive added to the shared list; `material-binding-system` resolves texture refs through `AssetRegistry.urlFor`; `runtime/start.ts` does the same for HDR / cube env URLs; `bumpMap` + `bumpScale` added to material manifests; HDR env gained `asBackground` + `backgroundBlurriness`; `project.render.color.transmissionResolutionScale` exposes WebGLRenderer transmission pre-pass scale; sphere primitive bumped 24×16 → 32×20 segments. Friction notes in `docs/research/material-bench-asset-friction.md`.

### Deliverables

- `engine/tools/asset/asset-optimize.ts` — per-file source mode + textureCompress (WebP target).
- `engine/tools/asset/asset-import.ts`, `engine/render/asset-decoders/decoders.ts` — vendored decoder verification path.
- `schemas/lod.schema.json` (new) + LOD validation in `engine/tools/check/project-check.ts`.
- `engine/tools/doctor/{project-doctor,texture-doctor}.ts` — Texture warnings + Prefabs section + new recommendations.
- `engine/core/ecs/types.ts` — `SceneInput.instances` + `SceneEnvironmentInput.asBackground` / `backgroundBlurriness`.
- `engine/core/scene/expand-prefabs.ts` — now preserves top-level scene fields.
- `engine/runtime/start.ts` — prefab expansion hook + idle-mode skip + critical-asset gate + env URL resolution through asset registry.
- `engine/core/ecs/world.ts` — `mutationCounter()`.
- `engine/render/three-render-adapter.ts` — GPU timer queries + `EquirectangularReflectionMapping` background + `bumpMap` / `bumpScale` + `transmissionResolutionScale` knob + cylinder primitive.
- `engine/render/mesh-handle-registry.ts` — `cylinder` primitive added.
- `engine/render/systems/material-binding-system.ts` — texture refs resolve through `AssetRegistry.urlFor`.
- `engine/runtime/asset-loaders/material-loader.ts`, `schemas/material.schema.json` — `bumpMap` + `bumpScale`.
- `schemas/project.schema.json` — `render.idleMode`, `render.criticalAssets`, `render.color.transmissionResolutionScale`.
- `schemas/scene.schema.json` — `environment.asBackground` + `backgroundBlurriness`.
- `schemas/components/render.schema.json` — `cylinder` added to the `mesh` enum.
- `examples/beacon-world/prefabs/{beacon,energy-core}.prefab.json` (new) + 56-line scene shrink.
- `examples/material-bench/` (new project) — project.json + scenes + 13 material manifests + bootstrap.ts + template.json + template_context.md + performance-budget.json + asset-sources.json + 9 textures + 1 HDR.
- `src/{app,main}.ts` — `AppOptions.prefabs`, glob import of per-project prefabs, idle-mode + criticalAssets pipes, `rendererInfo.gpuMs` global declaration, material-bench wired into project loader.
- Six new test files (`scene-load-prefabs`, `runtime-critical-assets`, `world-mutation-counter`, `doctor-prefabs`, plus expansions of `project-check` + `expand-prefabs`).
- Three new test fixtures (`scene-instance-valid`, `scene-instance-missing-prefab`, `scene-instance-duplicate-id`).
- `docs/research/material-bench-asset-friction.md` (new) — agent friction log.
- `docs/research/reflection-probes-investigation.md` (new) — probe / dynamic-reflection investigation + vfx priority list.
- `HIGH_LEVEL_BACKLOG.md` — new `M26` visual-fidelity epic (low priority).

### Verification

- `npm run preflight` ✅ at sprint close — repo:hygiene + 5 engine:check projects + imports:check + systems:check + typecheck + 83 unit test files / 504 tests + build + bundle:check + 11/11 e2e smoke (24.2 s).
- `npm run engine:doctor -- examples/beacon-world` ✅ — `Prefabs: 2 declared, 4 scene instance(s) total. top usage: 2× beacon, 2× energy-core`.
- `npm run engine:check -- examples/material-bench` ✅ + `examples/beacon-world` ✅ + every other example clean.

### Follow-Ups

- **Texture refs through the asset registry (deferred).** Workaround landed in this PR: `material-binding-system` calls `assetRegistry.urlFor()` before forwarding texture refs to `TextureLoader`. Better fix is to move textures onto `AssetRegistry.get<TextureAsset>()` so 404s emit diagnostics and HMR can invalidate one texture without remounting the material.
- **`MeshRenderer.material` validator.** `engine check` should reject anything that isn't a `runtime/.../*.material.json` path under `assetRoot`. Today the schema accepts any non-empty string.
- **Single source of truth for primitive mesh names.** `box / sphere / cylinder / plane` is hand-maintained across 5 places (registry / batcher / project-check / project-doctor / scene-extensions schema). Export one constant.
- **`asset-sources.schema` enrichment.** Add `kind: "environment"`, `source.type: "vendored"`, optional `source.vendor` / `source.attribution`. Material-bench had to use `kind: "texture"` for the HDR — works, loses intent.
- **`engine asset import --textures` companion.** Today the only way to land vendored textures is to copy them by hand into `runtime/textures/` and write the asset-sources entry manually.
- **`bumpMap` story for tangent-space normals.** `m11-ice` correctly uses `normalMap` (NormalGL source); brick + hardwood use `bumpMap` because the source files are height maps stored as RGB. A future texture-doctor warning could flag a `_bump`-suffixed file pointed at `normalMap`.
- **`render.idleMode: "on-demand"` user-input wake-up.** Mouse / keyboard input currently doesn't bump the world's mutation counter unless an input system writes ECS state. For pure-camera-orbit projects in `on-demand` mode the orbit might feel laggy. Either bump mutationCounter from a dev-overlay input system or add an explicit `forceRender()` API.
- **`transmissionResolutionScale` UI sweep.** AGF exposes the knob through project.json; the shadow-tuner could grow a sibling tile so an agent can A/B perf-vs-quality live.
- **DOCS-asset-pipeline.** Was on the S54 list; moved into S55's agent-surface refresh sprint because the docs/skills sweep is the natural place for an agent-facing pipeline walkthrough.

## Sprint 55 - Agent surface refresh

Status: Completed and archived.

Single focused pass: every agent-facing doc + skill memo + slash-command reference brought in line with the S52–S54 engine state. No engine code changes. Verification at sprint close = preflight + grep sweep of stale identifiers (none found).

### Completed Work

1. **DOCS-stale-audit** ✅ — `docs/agent/_audit-2026-05-15.md` (deleted at sprint close after being mined). 26-row OK / update / new verdict table plus an ownership map tying each remaining story to its files.
2. **DOCS-AGENTS-root** ✅ — `AGENTS.md` + `docs/agent/rules.md` + `docs/agent/review-checklist.md` synced. New hard rules: ECS systems by default + documented deviation, reuse engine primitives before scaffolding (Spin > GroupRotator), texture refs always through `AssetRegistry.urlFor`, `MeshRenderer.material` is full path, `Transform.rotation` is degrees, prefab overrides shallow-merge, primitive set is `box / sphere / cylinder / plane`. Review checklist gained Data+Schemas + Diagnostics + Performance Hygiene sections.
3. **DOCS-build-a-game** ✅ — `docs/agent/build-a-game.md` rewritten. End-to-end walkthrough using material-bench shapes; instantiate-a-prefab recipe; HDR-background + idle-mode + criticalAssets recipes; 6-item common-mistakes checklist; `__agf` table extended with `gpuMs / frameTiming / pick / dev.tuner / shadow controls / physics raycast / recording / project-patch`.
4. **DOCS-asset-pipeline** ✅ — new `docs/agent/asset-pipeline.md`. Pipeline diagram + per-stage prose: `_sources/` layout, provenance schema (`kind` / `source.type` enums), `engine asset import`, `engine asset optimize` with `--source` / `--textures`, material manifest cheat-sheet (incl. `bumpMap` vs `normalMap`), scene reference rules, HDR env spec, doctor sections, `criticalAssets` gate, diagnostics catalogue, future-work pointers.
5. **DOCS-scene-authoring-skill** ✅ — `docs/agent/skills/scene-authoring.md` rewritten. Scene shape with `instances` + `environment.hdr.asBackground`; component cheat-sheet incl. MeshRenderer full-path rule, ShadowCaster dynamic flag, Spin / Tween / WaypointMover reuse note; project-local component flow; 5 pitfalls.
6. **DOCS-system-authoring-skill** ✅ — `docs/agent/skills/system-authoring.md` rewritten. Lead with grep-before-scaffold; canonical cached-`createQuery` template; engine-vs-project boundary table; no per-frame Three.js alloc + no raw event listeners; 5 pitfalls.
7. **DOCS-playtest-debugging-skill** ✅ — `docs/agent/skills/playtest-debugging.md` rewritten. Full `window.__agf` API table (16 entries incl. `rendererInfo.gpuMs`, `frameTiming`, `pick`, `dev.tuner.*`, shadow controls, physics raycast, recording, save/load). Dev-bridge HTTP endpoint table (12 routes). 6 common debugging patterns.
8. **DOCS-engine-check-skill** ✅ — `docs/agent/skills/engine-check.md` rewritten with the sibling-command matrix (check / doctor / inspect / docs / list / explain / asset optimize / asset import), symptom→code lookup, and the full list of files `engine check` validates. `docs/diagnostics.md` catalogue brought current — domain enum extended, new per-domain tables, S54 codes documented.
9. **DOCS-prefab-skill** ✅ — new `docs/agent/skills/prefab-authoring.md`. When-to-extract threshold, manifest shape, `scene.instances[]` syntax with shallow-merge semantics + worked example, per-instance field list, when NOT to extract, diagnostics + doctor section, beacon-world M3-c-beacon worked example.
10. **DOCS-material-skill** ✅ — new `docs/agent/skills/material-authoring.md`. Shader picking table, full field cheat-sheet, bumpMap-vs-normalMap decision rules with the bump-source pitfall, asset-registry texture resolution, full-path rule for MeshRenderer.material, 7 common pitfalls, doctor + texture warnings.
11. **DOCS-claude-code-+-subagents** ✅ — `docs/agent/claude-code.md` rewritten. Slash-command matrix + subagent matrix with "when to delegate" lines. Reliability-doc map updated. Sprint-workflow paragraph added. `.claude/agents/*.md` descriptions verified current — no changes needed.
12. **DOCS-iteration-+-debug-protocol** ✅ — `docs/agent/iteration-loop.md` + `docs/agent/debug-protocol.md` refreshed. Iteration loop gains the sprint-workflow paragraph and three new recipes (screenshot, bug-report, dev-tuner). Debug protocol gains a 17-row failure-taxonomy → first-look-diagnostic lookup table, the dev-bridge route list, and the post-fix verification checklist.

### Deliverables

- 12 docs touched, 2 new skill memos (prefab-authoring, material-authoring), 1 new top-level doc (asset-pipeline.md), audit file consumed and deleted.
- Diagnostics catalogue (`docs/diagnostics.md`) is now the canonical map of every `AGF_*` code emitted by `engine check` / `engine doctor` / runtime.

### Verification

- `npm run preflight` ✅ at sprint close — repo:hygiene + 5 engine:check projects + imports:check + systems:check + typecheck + 83 unit test files / 504 tests + build + bundle:check + 11/11 e2e smoke (27.2 s).
- Cyrillic-in-repo sweep across the touched files — clean.
- Cross-link sanity: every `docs/agent/skills/<name>.md` referenced from `claude-code.md` exists.

### Follow-Ups

- **ADR audit.** Texture resolution through `AssetRegistry.urlFor`, environment.asBackground, primitive-set extensions and `transmissionResolutionScale` are documented in skill memos but not anchored in any ADR. Spawn a doc-only follow-up sprint if the codebase needs the architectural record.
- **`engine docs <projectId>` regen.** The auto-generated docs under `docs/generated/<projectId>/` weren't refreshed during S55. They aren't used by agents day-to-day (the hand-written skill memos are), but a follow-up run keeps them aligned with the new schema fields (`asBackground`, `backgroundBlurriness`, `transmissionResolutionScale`, `idleMode`, `criticalAssets`, `bumpMap`, `bumpScale`).
- **MeshRenderer.material path-validator.** Several docs (build-a-game, asset-pipeline, scene-authoring, material-authoring) call out the bare-id-vs-path pitfall — backlog candidate to make `engine check` enforce it.

## Sprint 56 - Engine hygiene + ADR catch-up

Status: Completed and archived. Six of twelve planned stories shipped; six visual-fidelity stories deferred to S57 because they need live browser eyeball-tests that an autonomous session can't run.

### Completed Work

1. **MESHRENDERER-material-path-validator** ✅ — new `AGF_MATERIAL_REF_INVALID` error in `engine check` when `MeshRenderer.material` isn't a `.material.json` path under `assetRoot`. Closes the bare-id silent-fail flagged in `material-bench-asset-friction.md`. Fixture pair + 1 unit test. Diagnostics catalogue updated.
2. **PRIMITIVE-set-single-source** ✅ — new `engine/core/primitives.ts` exports `PRIMITIVE_MESHES: ReadonlySet<string>`, `PRIMITIVE_MESH_NAMES: ReadonlyArray<PrimitiveMeshName>`, `isPrimitiveMesh()` helper. Five hand-rolled Sets across the engine collapse into one source of truth; the JSON-schema enum keeps a paired comment pointing at the TS source.
8. **ADR-0009-shadow-caster-dynamic-tag** ✅ — anchors `ShadowCaster { dynamic }` + `DynamicShadowSystem` with the S53 audit-trail of the first-version visual regression.
9. **ADR-0010-typed-render-pool** ✅ — anchors `BucketSpec` discriminated union, `PoolHandle` union, `RenderPoolRegistry<Entry>` (S53).
10. **ADR-0011-prefab-instantiation** ✅ — anchors `expandScenePrefabs` + shallow-merge override semantics + the `AGF_SCENE_INSTANCE_*` diagnostics + "no nested deep merge" rule (S54).
11. **ADR-0012-asset-registry-texture-resolution** ✅ — anchors the texture-refs-through-AssetRegistry rule; records the `urlFor` workaround (S54) and the planned `get<TextureAsset>()` integration (S57).

### Deferred to Sprint 57

These all need live visual verification an autonomous session couldn't run:

- 3 `ASSET-textures-via-registry`
- 4 `GROUND-skybox`
- 5 `REFLECTION-cube-probe`
- 6 `POST-ssao`
- 7 `POST-color-lut`
- 12 `REFLECTION-prefilter` (depends on 5)

### Deliverables

- `engine/core/primitives.ts` (new) — single-source primitive set.
- `engine/tools/check/project-check.ts` — new `AGF_MATERIAL_REF_INVALID` path validator + imports the primitives.
- `engine/render/systems/batching-system.ts`, `engine/tools/doctor/project-doctor.ts` — import from `engine/core/primitives.ts`.
- `schemas/components/render.schema.json` — paired-comment on the primitive enum.
- `docs/diagnostics.md` — new code documented.
- `docs/adr/0009-0012-*.md` (4 new files).
- `tests/fixtures/material-ref-bare-id/` (new fixture) + 1 new unit test in `project-check.test.ts`.

### Verification

- `npm run preflight` ✅ at sprint close — repo:hygiene + 5 engine:check projects + imports:check + systems:check + typecheck + 83 unit test files / 505 tests + build + bundle:check + 11/11 e2e smoke (24.9 s).

### Follow-Ups

- The six visual-fidelity stories carry into S57 with their original numbering. S57 also picks up `ASSET-textures-via-registry` as its lead non-visual story.
- ADR-0012 is technically "Decision: workaround shipped, integration planned" — once the S57 Story 3 lands, the ADR will be updated to "Decision: full integration shipped" without changing the rule.

## Sprint 57 - Visual-fidelity v0 + texture registry integration

Status: Completed and archived. Eleven of twelve planned stories shipped; `REFLECTION-prefilter` deferred to S58 because three.js's auto-mipmap on `WebGLCubeRenderTarget` is visually close enough for the chrome-roughness 0.18 case in material-bench. Proper GGX prefilter lands when a `roughness > 0.3` reflective material asks for it.

### Completed Work

1. **ASSET-textures-via-registry** ✅ — texture refs route through `AssetRegistry.get<Texture>()`. New `engine/render/texture-loader.ts` registered with material + glb loaders. `MaterialPatch.{map,normalMap,bumpMap,roughnessMap,metalnessMap,emissiveMap,aoMap}` typed as pre-loaded `Texture` instances. Adapter retired its local `textureCache` + `acquireTexture`. 404s now emit `AGF_RUNTIME_ASSET_LOAD_FAILED`.
2. **GROUND-skybox** ✅ — `three/addons/objects/GroundedSkybox.js` vendored. `scene.environment.groundedSkybox: { height, radius }` mounts a curved-bottom sky mesh + an invisible `ShadowMaterial` shadow-catcher at the same height (lifted 1mm, renderOrder=1) so shadows fall on the virtual ground.
3. **REFLECTION-cube-probe** ✅ — new `ReflectionProbe` + `EnvmapBinding` scene components, adapter API for `CubeCamera + WebGLCubeRenderTarget` lifecycle, new `ReflectionProbeSystem` that gates rendering by `updateRate` (0/15/30/60 Hz), hides `excludeEntities` + the owner, and stamps the resulting cube texture onto every entity with `EnvmapBinding`.
4. **POST-ssao** ✅ — `SSAOPass` vendored. `project.render.post: [{ kind: "ssao", radius?, intensity?, kernelSize? }]` wired through composer rebuild.
5. **POST-color-lut** ✅ — `LUTPass` + `LUTCubeLoader` vendored. `project.render.post: [{ kind: "color-lut", file, intensity? }]`. LUT URL resolution rides through `adapter.lutUrlResolver` (default routes via `AssetRegistry.urlFor`).
7. **ADR-0012-update** ✅ — moved from "workaround shipped, integration planned" to "full integration shipped".
8. **PERFTEST-material-bench-budget** ✅ — soft / hard ceilings rebaked for the new scene shape (geometries 6→10 / textures 24→36 / programs 16→20 / meshes 32→48 soft; hard up proportionally). Three vendor bundle budget 300 → 320 KB after the new addons.
9. **POST-composer-schema** ✅ — `project.json#render.post` schema enum + `ProjectMeta` + `PostPassConfig` extended with `ssao` + `color-lut`.
10. **DOCS-vfx-skill** ✅ — new `docs/agent/skills/vfx-authoring.md` covering every VFX surface AGF ships today + a perf-gotcha section + the material-bench worked example.
11. **MATERIAL-bench-vfx-adopt** ✅ — dark plinth removed; GroundedSkybox at y=-0.75 r=60; 8 cylindrical "stonehenge" stone columns at radius 11 (new `stone.material.json`); centre chrome sphere hosts `ReflectionProbe` 256² @ 60 Hz + `EnvmapBinding` self-ref; shadow-camera frustum widened to ±14 / far 40.
12. **DOCTOR-reflection-section** ✅ — `engine doctor` `Reflections:` section enumerates declared probes (size, cadence, exclude count), estimates extra renders/sec, warns about probes without self-exclude and bindings with unknown probe ids. Static-only; bootstrap-spawned probes (material-bench's) don't show up by design.

### Deferred to Sprint 58

- 6 `REFLECTION-prefilter` — three.js's automatic cubemap mipmap chain is close enough for the chrome-roughness 0.18 case; full GGX prefilter via `PMREMGenerator.fromCubemap` lands when a `roughness > 0.3` reflective material asks for it.

### Deliverables

- `engine/render/texture-loader.ts` (new) — `AssetLoader<Texture>` registered in `src/app.ts`.
- `engine/render/systems/reflection-probe-system.ts` (new).
- `engine/render/three-render-adapter.ts` — texture-bind retire, post-pass union extended (SSAO / LUT), GroundedSkybox + shadow-catcher mount, reflection-probe API (acquire / setTransform / update / texture / release / meshForHandle), envMap MaterialPatch fields, NoColorSpace re-tagging.
- `engine/runtime/start.ts` — `groundedSkybox` plumbed through HDR + cube env paths, reflection-probe system registered.
- `engine/core/ecs/types.ts` — `SceneEnvironmentInput.{groundedSkybox}`.
- `schemas/components/render.schema.json` — `reflectionProbeComponent` + `envmapBindingComponent` defs.
- `schemas/scene.schema.json` — `ReflectionProbe` + `EnvmapBinding` registered + `environment.groundedSkybox`.
- `schemas/project.schema.json` — `render.post` enum + `ProjectMeta.render.post`.
- `examples/material-bench/` — stonehenge in `bootstrap.ts`, `stone.material.json`, scene shadow camera widened, dark plinth removed, GroundedSkybox env, performance budget rebaked.
- `docs/agent/skills/vfx-authoring.md` (new).
- `docs/adr/0012-asset-registry-texture-resolution.md` — "full integration shipped" record.
- `scripts/check-bundle-size.mjs` — three-vendor budget 300 → 320 KB.

### Verification

- `npm run preflight` ✅ at sprint close — repo:hygiene + 5 engine:check projects + imports:check + systems:check + typecheck + 83 unit test files / 505 tests + build + bundle:check + 11/11 e2e smoke (33.3 s).
- User live-verified: HDR sky meets cement pedestals; centre chrome reflects orbiting ring + stonehenge.

### Follow-Ups

- **REFLECTION-prefilter (S58 Story 1)** — full GGX prefilter through `PMREMGenerator.fromCubemap` at 10 Hz; required for `roughness > 0.3` reflective materials to read plausibly blurry environment.
- **REFLECTION-planar (parking lot)** — vendored `Reflector.js` for water / lobby-floor surfaces.
- **DOCTOR-reflection scans bootstrap entities** — today the doctor only scans scene JSON; material-bench's probe is invisible to it. Adding a runtime probe inventory via the dev bridge would close that gap.
- **`engine doctor` Reflections cost estimate** is naive (probes × 6 × updateRate). A real perf-probe would account for view-frustum culling and the actual scene draw cost per cube face.

## Sprint 58 — Multi-probe reflection + GroundedSkybox shipping bugfixes

Status: Completed and archived. Follow-up to S57; three groups of work — GroundedSkybox shipping bugs caught live in material-bench, reflection-probe correctness + multi-probe layout, and an unrelated GPU-timer WebGL error pair surfaced during the live-tuning sessions.

### Completed Work

1. **REFLECTION-cube-cam-world-matrix** — `ReflectionProbeSystem` no longer adds its `CubeCamera`s to the scene graph (three.js's `CubeCamera.update()` only auto-refreshes the world matrix when `parent === null`). Explicit `cubeCam.updateMatrixWorld(true)` added in `updateReflectionProbe` so any future re-parent doesn't silently break the capture.
2. **GROUNDED-skybox-shipping-fixes** — `GroundedSkybox` now built with a positive projection factor `radius / 6` (matches three.js docs example ≈ 6.6); the mesh is externally positioned at `projectionHeight + spec.height` so AGF's `height: -0.75` still works as "world Y of the floor". Raw RGBE equirect feeds both `scene.background` and the helper (was the PMREM cubemap — soft / blurred projection). Shadow-catcher lifted 10 mm above the sky's bottom disc + `renderOrder = 1` + `opacity 0.6` for natural shadow weight.
3. **REFLECTION-cube-mipmaps** — `WebGLCubeRenderTarget` constructed with `generateMipmaps: true, minFilter: LinearMipmapLinearFilter` so `MeshStandardMaterial.envMap` sampling at `roughness > 0` reads a box-filtered mip chain. Mip regen runs once per `CubeCamera.update`. Not full PMREM GGX prefilter (parked as `REFLECTION-prefilter`), but visually close enough for moderate roughness (≤ 0.3).
4. **MATERIAL-bench-multi-probe** — three reflection probes: `sphere.centre` (chrome ball's own probe, 128² @ 30 Hz), `probe.front` at (0, 1, +5), `probe.back` at (0, 1, −5). Outer-ring spheres bind by initial angle hemisphere: `sin(angle) ≥ 0` → `probe.front`, else `probe.back`. Static bindings — each sphere keeps its probe ref as the ring spins so the reflection difference between sphere groups stays visible regardless of where they orbit.
5. **MATERIAL-bench-stonehenge** — 12 stone-textured cylindrical columns at radius 11 around the orbit. New `stone.material.json` reuses `brick_bump` (`bumpMap`, scale 2.5) + `brick_roughness` (`roughnessMap`) over `#7e7468`. Shadow camera frustum widened to ±14 / far 40 so columns cast onto the grounded floor.
6. **REFLECTION-cube-cam-shadow-opacity-tune** — live tuning loop with the user: shadow-catcher opacity 1.0 → 0.6 (more natural shadow weight), chrome roughness sweep 0.18 → 0.02 (proved probe correctness, since mirror reflection of an offset cubemap is obviously wrong) → 0.12 → 0.22 (proved mip-cube blur works).
7. **ADR-0013-reflection-probe-system** — `docs/adr/0013-reflection-probe-system.md` anchors the CubeCamera-per-entity design, the parent-null world-matrix gotcha, the mipmap-cube-RT vs PMREM tradeoff, multi-probe layout decision for material-bench, and self-reflection avoidance.
8. **DOCS-vfx-skill-update** — `docs/agent/skills/vfx-authoring.md` pitfalls section picks up four new entries from the shipping bugs: `groundedSkybox.height <= 0`, PMREM-vs-equirect for the helper, CubeCamera world-matrix gotcha, and `roughness > 0` needing the mip-cube chain.
9. **GPU-timer-webgl-errors** — `ext.QUERY_RESULT_AVAILABLE` and `ext.QUERY_RESULT` are `undefined` (the extension exposes only `TIME_ELAPSED_EXT`, `TIMESTAMP_EXT`, `GPU_DISJOINT_EXT`; the rest are core WebGL2 constants on the rendering context). Reading them off `ext` produced `INVALID_ENUM: getQueryParameter`. The companion `INVALID_OPERATION: endQuery: target query is not active` came from `gpuTimerPending` staying set when `beginGpuTimer` early-returned on an in-flight query. Tracked `gpuTimerActive` separately so `endQuery` only fires when `beginQuery` actually fired this frame.

### Deliverables

- `engine/render/three-render-adapter.ts` — cube cam parent-null + explicit world matrix; GroundedSkybox projection factor + position split; raw equirect passed to helper; shadow-catcher z-fight fix; WebGLCubeRenderTarget mipmap config; GPU timer query parameter fix + `gpuTimerActive` gate.
- `examples/material-bench/bootstrap.ts` — 3-probe layout, outer-sphere hemisphere binding, 12 stonehenge columns.
- `examples/material-bench/scenes/start.scene.json` — dark plinth removed, `groundedSkybox: { height: -0.75, radius: 60 }`, shadow camera widened.
- `examples/material-bench/assets/runtime/materials/m0-chrome.material.json` — roughness 0.22.
- `examples/material-bench/assets/runtime/materials/stone.material.json` (new).
- `docs/adr/0013-reflection-probe-system.md` (new).
- `docs/agent/skills/vfx-authoring.md` — pitfalls section updated.

### Verification

- `npm run preflight` at sprint close — repo:hygiene + 5 engine:check projects + imports:check + systems:check + typecheck + 83 unit test files / 505 tests + build + bundle:check + 11/11 e2e smoke (37.0 s).
- User live-verified across the tuning loop: centre chrome reflects columns + orbit ring; front/back probes give visible reflection diff between orbit halves even as the ring spins; shadows land on the grounded floor; chrome roughness 0.22 reads as a softly blurred mirror; no more `INVALID_ENUM` / `INVALID_OPERATION` from the GPU timer in DevTools console.

### Follow-Ups

- **REFLECTION-prefilter (still parked)** — three.js auto-mipmap on the cube RT is fine through `roughness ≤ 0.3`. Once a project needs a `roughness > 0.3` reflective material that reads correct PBR-blurry environment, vendor `PMREMGenerator.fromCubemap` and run it on each probe update. **Picked up as S59 Story 1.**
- **REFLECTION-cube cam re-parenting** — runtime path keeps the cube cam outside the scene graph; if a future feature wants to parent the probe to a moving entity, the per-frame `setReflectionProbeTransform(LocalToWorld)` already covers that; re-parenting is not actually needed.
- **DOCTOR-reflection scans bootstrap entities** (carried from S57) — material-bench's runtime-created probes still don't show up in `engine doctor`. **Picked up as S59 Story 6.**
- **GPU-timer test coverage** — the WebGL timer path has no unit-test coverage. A headless test against a mock WebGL2 ctx would have caught the `ext.QUERY_RESULT_*` bug before it reached the console. **Picked up as S59 Story 5.**

## Sprint 59 — Visual fidelity v1 (PMREM + planar mirror + bloom + GPU-timer test)

Status: Completed and archived. 9 of 10 planned stories shipped; `DOCTOR-reflection-runtime` deferred to S60 (wiring doctor as a dev-bridge client is a substantial cross-tool change; PERF-renderer-info already gives agents a live count via `__agf.rendererInfo()`).

### Completed Work

1. **REFLECTION-prefilter** — `ReflectionProbe { prefilter: "mipmap" | "pmrem" }`. PMREM regen via `PMREMGenerator.fromCubemap` after every cube capture; bounded memory via dispose-on-replace.
2. **REFLECTION-planar** — vendored `Reflector.js`. `PlanarMirror { width, height, resolution, color }` component + adapter API + system.
3. **WATER-bench** — `examples/water-bench/` ships a 30×30 PlanarMirror + floating primitives + HDR sky (the water-visibility hotfix landed as PR #65 — mirror was getting a 4-element quaternion for what should have been a 3-element Euler rotation, plus the scene used `kind: "generated"` IBL with no visible sky).
4. **POST-bloom worked example** — material-bench's `project.json#render.post` picks up `[{ kind: "bloom", strength: 0.35, radius: 0.55, threshold: 0.92 }]`.
5. **GPU-timer-test** — `engine/render/gpu-timer.ts` extracted; 6 unit tests against a mock WebGL2 ctx covering both S58 regressions + surrounding invariants.
6. **DOCS-vfx-skill-v1** — `docs/agent/skills/vfx-authoring.md` updated with PMREM / Reflector / bloom worked examples + three new pitfalls.
7. **DOCS-material-bench-readme** — `examples/material-bench/README.md` documenting the v1 surface + FPS knob table.
8. **PERF-renderer-info** — `AdapterInfo` + `__agf.rendererInfo()` pick up `reflectionProbes`, `prefilterMs`, `planarMirrors`.
9. **MATERIAL-bench-vfx-v1-adopt** — centre chrome `prefilter: "pmrem"`, updateRate 30 → 15 Hz, roughness 0.22 → 0.35.

### Deferred to Sprint 60

- 6 **DOCTOR-reflection-runtime** — doctor as dev-bridge client. PERF-renderer-info covers the live-inventory ask; full doctor wiring waits for a different sprint.

### Deliverables

- `engine/render/gpu-timer.ts` (new) + `engine/render/systems/planar-mirror-system.ts` (new).
- `engine/render/three-render-adapter.ts` — PMREM probe path, Reflector probe API, mip-cube RT, AdapterInfo extensions.
- `engine/runtime/start.ts` — `PlanarMirrorSystem` registration.
- `examples/water-bench/` (new) + `examples/material-bench/` v1 polish (PMREM chrome, bloom, README).
- `schemas/components/render.schema.json` + `schemas/scene.schema.json` — `prefilter` + `planarMirrorComponent`.
- `tests/unit/gpu-timer.test.ts` (new) — 6 tests.
- `docs/agent/skills/vfx-authoring.md` v1 update.

### Verification

- `npm run preflight` ✅ at sprint close — 511 / 511 unit, 11 / 11 e2e smoke, all 7 example projects engine:check clean.
- Live playwright probes of water-bench + material-bench v1 clean, no console errors.
- Water-visibility hotfix (PR #65) shipped after a follow-up user report.

### Follow-Ups

- **DOCTOR-reflection-runtime** — picked up in S60 as story candidate; ultimately re-deferred to S61+ since the WebGPU adapter rewrite will redo doctor's renderer-facing surface anyway.
- **Reflector + transmission ordering** — not exercised in water-bench (no transmissive material there). Confirm rendering order behaves once a transmissive prop lands in a scene with a planar mirror.

## Sprint 60 — WebGPU spike + measurement

Status: Completed and archived. **User-driven pivot** — replaced the parked perf-cleanup S60 plan with a WebGPU spike + measurement run. 10 of 11 stories shipped (Story 9 `BASELINE-rebench-pre-webgpu` deferred to S61 since the comparison anchor isn't needed until the adapter lands). Plus a user-reported `WEBGL-stutter-investigation` (Story 11) landed inline.

### Completed Work

1. **WEBGPU-comparison-page** — `tests/manual/webgpu-vs-webgl/` standalone three.js harness, `?renderer=webgl|webgpu` switch, scene scale via `?boxes=N&spheres=N`. Two rotating ring groups + gentle Y-bob. Canvas pinned via explicit CSS so high-DPR Chromes don't render to a corner. WebGPU `info.render.frameCalls` vs WebGL `calls` reconciled.
2. **WEBGPU-measure-script** — `scripts/perf-probe-webgpu.mjs` drives the comparison page at light / medium / heavy / extreme scenes under both renderers. `--headed` + `--no-vsync` flags for real-hw uncapped runs. Dumps to `docs/research/perf/webgpu-spike-{date}.json`.
3. **WEBGPU-feature-audit** — 14 features work as-is, 11 cleanup, 4 full rewrites (post-processing chain, PCSS via onBeforeCompile, GPU timer, CSM). Embedded in the research writeup.
4. **WEBGPU-adapter-sketch** — `docs/research/m21-webgpu-adapter-sketch.md`. `RenderAdapter` interface extraction plan, sibling `WebGpuRenderAdapter` class, capability flags, `project.json#render.mode` selector.
5. **WEBGPU-research-writeup** — `docs/research/m21-webgpu-spike.md`. Real-hw uncapped numbers: light +278 % / medium +34 % / heavy −31 % fps; p99/p50 variance 3.6× (WebGL) → 2.0× (WebGPU). Recommendation: opt-in S61, default-flip S65.
6. **PERF-renderer-info-renderer-kind** — `AdapterInfo.renderer: "webgl" | "webgpu"` + `__agf.rendererInfo().renderer` + typed surface in src/app.ts + src/main.ts.
7. **DOCTOR-webgpu-readiness** — `engine doctor` `WebGPU readiness:` section. Walks `project.json` + scenes, lists declared `render.mode` + features that block migration.
8. **DOCS-webgpu-skill** — `docs/agent/skills/webgpu-rendering.md` (status, wins/blockers summary, S61-S65 roadmap, pitfalls).
9. **HIGH_LEVEL-update-webgpu** — `HIGH_LEVEL_BACKLOG.md` M21 row records S60 results + promotes `M21-webgpu-adapter` from parked to active phase-2 work with S61 → S65 story sequencing.
11. **WEBGL-stutter-investigation** — investigated user-reported hello-3d stutters. Verdict (`docs/research/m21-hello3d-stutter-investigation.md`): hello-3d at 1.4 % real-lateness (>20 ms) matches the no-AGF harness at 0.9 % — within noise. Material-bench at 14.4 % over-budget IS engine-bound (probe + bloom + transmission stack vs 16.67 ms budget). Shipped fix: `applyCanvasSize()` short-circuit (was running renderer.resize / composer.setSize / projection update every frame regardless). Dropped hello-3d stutters 4.67 % → 3.78 % at >18 ms, p99 19.4 → 18.7 ms. Material-bench probe / post-pass tuning deferred to S61+ per user (fix on WebGPU rather than baking in current WebGL assumptions).

### Deferred to Sprint 61

- 9 **BASELINE-rebench-pre-webgpu** — re-run perf-probe-shadows + perf-probe-batching on current main for the comparison anchor. Doesn't block S60 conclusion; lands when the WebGPU adapter actually ships and we need to A/B against it.
- Material-bench probe / post-pass tuning. The WebGPU adapter changes per-render cost enough that re-baking these knobs against the new backend is the right time.

### Deliverables

- `tests/manual/webgpu-vs-webgl/{index.html, main.js}` (new) — comparison harness.
- `scripts/perf-probe-webgpu.mjs` (new) — playwright measurement.
- `docs/research/m21-webgpu-spike.md` (new) — research writeup.
- `docs/research/m21-webgpu-adapter-sketch.md` (new) — integration plan.
- `docs/research/m21-hello3d-stutter-investigation.md` (new) — multi-threshold stutter findings.
- `docs/research/perf/webgpu-spike-*.json` (new) — raw measurement dumps.
- `docs/agent/skills/webgpu-rendering.md` (new) — skill memo.
- `engine/render/three-render-adapter.ts` — `AdapterInfo.renderer` field, info() returns `"webgl"`.
- `engine/render/three-renderer.ts` + `src/app.ts` + `src/main.ts` — typed surface for `__agf.rendererInfo().renderer`.
- `engine/tools/doctor/project-doctor.ts` — `WebGpuReadinessReport` + `summarizeWebGpuReadiness` + `formatWebGpuReadiness`.
- `engine/runtime/start.ts` — `applyCanvasSize()` short-circuit when canvas size unchanged.
- `src/app.ts` — `?overlay=0` query param for stutter A/B probes.
- `HIGH_LEVEL_BACKLOG.md` — M21 row records spike + promotes `M21-webgpu-adapter` epic.

### Verification

- `npm run preflight` at sprint close (this commit).
- Headed playwright probes on real GPU at 3 scene scales × 2 renderers; raw numbers in `docs/research/perf/webgpu-spike-*.json`.
- engine doctor surfaces the WebGPU readiness section on every project (material-bench correctly flags the bloom post-pass blocker).
- User live-verified the comparison harness on their real-hw Chrome after the canvas + draws-field fix.

### Follow-Ups

- **`M21-webgpu-adapter` epic — Sprint 61**: extract `RenderAdapter` interface + ship `WebGpuRenderAdapter` core path (mesh / light / shadow / transmission). Opt-in via `project.render.mode = "webgpu"`.
- **S62 / S63 / S64**: post-processing port, CSM / PCSS / probe / mirror port, example migrations + re-bench.
- **S65 default-flip**: `webgpu` becomes the default, `webgl` legacy opt-in.
- **WebGL stutter follow-up**: capture chrome devtools Performance traces during a known stutter frame so we can attribute the ~2 ms over-budget frames to specific browser task categories. Current measurement says *how often*, not *what*. Lands when a user actually needs to chase a specific stutter.

## Sprint 61 — WebGPU adapter core (opt-in path)

Status: Completed and archived. 9 of 11 planned stories shipped + the deferred `BASELINE-rebench-pre-webgpu` re-deferred to S64 (comparison anchor not needed until post-passes / probes land) and `WEBGPU-renderer-import-boundary` deferred to S62 (the `three/webgpu` import stays inside `engine/render/three-render-adapter.ts` for now, so the existing boundary test still covers it).

### Completed Work

1. **RENDER-adapter-interface** — `engine/render/render-adapter.ts` with `RenderAdapterCapabilities` + `WEBGL_CAPABILITIES` / `WEBGPU_CAPABILITIES` constants. Single source of truth for which features a renderer supports (supportsGpuTimer / supportsCsm / supportsPcss / supportsPostProcessing / supportsReflectionProbe / supportsPlanarMirror).
2. **WEBGPU-adapter-core** — `ThreeRenderAdapter` constructor branches on `mode`: `WebGLRenderer` (default) or `WebGPURenderer` from `three/webgpu`. Single class with capability gating, not a parallel class — kept the refactor surface minimal. Environment IBL (PMREMGenerator) skipped on WebGPU until S63 (WebGL PMREM crashes on WebGPURenderer).
3. **WEBGPU-init-async** — `adapter.init()` awaited in start.ts before the first frame. No-op on WebGL; awaits `WebGPURenderer.init()` (GPUAdapter + GPUDevice request) on WebGPU.
4. **RENDER-mode-schema** — `project.json#render.mode` enum extended from `["webgl"]` to `["webgl", "webgpu"]`. `ProjectMeta.render.mode` typed in src/app.ts; runtime threads it through `ThreeRenderer` constructor.
5. **WEBGPU-spike-project** — `examples/webgpu-spike/` (cube + sphere + cylinder + floor + sun + hemi, spinning hero cube). Boots end-to-end on WebGPU; registered with project switcher; passes engine:check.
6. **WEBGPU-rendererinfo-flip** — `info().renderer` returns the actual capability kind. `__agf.rendererInfo().renderer === "webgpu"` when running the spike, `"webgl"` everywhere else.
7. **DOCTOR-webgpu-readiness-actionable** — when `mode = "webgpu"` AND the project uses an unsupported feature, doctor surfaces a recommendation. Walks project.json + every scene .json.
8. **WEBGPU-e2e-smoke** — `tests/e2e/webgpu-spike.spec.ts`. Self-skips on browsers without `navigator.gpu`; tagged into the smoke project so developer machines exercise it but CI Linux smoke stays green.
9. **DOCS-webgpu-skill-update** — `docs/agent/skills/webgpu-rendering.md` flips from "no adapter" → "adapter shipped"; documents the opt-in path, what works on WebGPU core today, what's still deferred.
10. **HIGH_LEVEL-update-webgpu** (from S60 carry-over) — `HIGH_LEVEL_BACKLOG.md` M21 row already records the spike + promoted adapter epic at S60 close; no S61 changes needed.

### Deferred to S62 / S64

- 7 **BASELINE-rebench-pre-webgpu** — re-run perf-probe-shadows + perf-probe-batching on current main + on the WebGPU spike for a comparison anchor. Doesn't block S61 conclusion; lands at S64 (the re-bench sprint before default-flip).
- 8 **WEBGPU-renderer-import-boundary** — `three/webgpu` is imported from `engine/render/three-render-adapter.ts`. The existing `tests/unit/renderer-import-boundary.test.ts` scopes the import to `engine/render/**` which still holds. Will revisit when a dedicated `engine/render/webgpu/` directory lands (likely S64 alongside the lazy-import refactor).

### Deliverables

- `engine/render/render-adapter.ts` (new) — capability interface.
- `engine/render/three-render-adapter.ts` — `mode` branch in constructor, async `init()`, `capabilities` field, PMREM gate, `info()` returns `renderer: this.capabilities.kind`.
- `engine/render/three-renderer.ts` + `engine/runtime/start.ts` — `rendererMode` threaded through; `await renderer.adapter.init()` before first frame.
- `engine/tools/doctor/project-doctor.ts` — actionable recommendation when `mode = "webgpu"` + unsupported features.
- `examples/webgpu-spike/` (new) — opt-in WebGPU project: project.json + scene + bootstrap + README + asset-sources.
- `schemas/project.schema.json` — `render.mode` enum extended.
- `scripts/check-bundle-size.mjs` — three-vendor budget raised 320 → 480 KB (justified inline).
- `src/app.ts` — `ProjectMeta.render.mode` typed; threads to runtime.
- `src/main.ts` — project switcher registers `?project=webgpu-spike`.
- `tests/e2e/webgpu-spike.spec.ts` (new) — smoke that self-skips without WebGPU.
- `docs/agent/skills/webgpu-rendering.md` — flipped from "no adapter" to "adapter shipped".
- `playwright.config.ts` — `webgpu-spike.spec.ts` added to SMOKE_TESTS.

### Verification

- `npm run preflight` ✅ at sprint close — typecheck + 511 unit tests + repo:hygiene + 8 / 8 engine:check + 11 / 11 e2e smoke (1 webgpu spike skipped on headless).
- Live playwright probe on headed chromium with `--enable-unsafe-webgpu` reports `renderer: "webgpu"`, 4 meshes, 2 lights, 1 shadow caster, zero pageerrors.
- Verified other projects still boot cleanly: hello-3d / material-bench / water-bench all report `renderer: "webgl"` with their normal mesh + draw counts.

### Follow-Ups

- **S62 — post-processing port**: `WebGPUPostProcessing` (`three/addons/postprocessing/PostProcessing.js`) wrapper for Bloom / SSAO / LUT / FXAA. Match the existing `project.render.post[]` schema.
- **S63 — feature parity**: CSM (`CSMNode`), PCSS (TSL rewrite), reflection probes + PMREM (`WebGPUCubeRenderTarget`), planar mirror (`ReflectorNode`), GPU timer (`GPUQuerySet`), HDR IBL.
- **S64 — lazy import of `three/webgpu`**: move the import inside `await adapter.init()` so the WebGL-only bundle path doesn't pay the 145 KB node-material cost. Pre-default-flip housekeeping.
- **S65 — default-flip**: `render.mode` defaults to `"webgpu"`; `webgl` becomes the explicit legacy opt-in.

## Sprint 62 — WebGPU feature parity I (HDR / generated IBL)

Status: Completed and archived as a single-story sprint. The original plan covered HDR IBL + post-processing chain on WebGPU; in practice the post-processing port turned out to be a much bigger refactor than fits this sprint (TSL nodes vs `EffectComposer.Pass` classes — different API, async render flow, three.js's `PostProcessing` is also deprecated → `RenderPipeline` rename in r0.183). Shipped HDR IBL — the most user-visible visual gap — and re-deferred Bloom / SSAO / LUT / FXAA to S63 alongside CSM / PCSS / probes / mirror so they all land together under a coherent feature-parity sprint.

### Completed Work

1. **WEBGPU-hdr-ibl** + **WEBGPU-generated-env** — the adapter routes through `three/webgpu`'s `PMREMGenerator` when `mode = "webgpu"`. It's a different class than the WebGL one (takes the new `Renderer` base instead of `WebGLRenderer`); cast through `unknown` because TS doesn't see the structural overlap. Both `environment.kind: "generated"` (RoomEnvironment + PMREM) and `environment.kind: "hdr"` work end-to-end on the WebGPU spike — confirmed via headed playwright probe: geometries 5 → 18 (PMREM cube probes), textures 5 → 9 (PMREM RTs), zero errors.
2. **DOCS-webgpu-skill-update** — skill memo `docs/agent/skills/webgpu-rendering.md` moves HDR IBL out of the "deferred" list into "what S62 landed"; roadmap row for S62 marked ✅; S63 row now bundles post-passes + CSM + PCSS + probes + mirror + GPU timer.
3. **DOCS-webgpu-spike-readme** — `examples/webgpu-spike/README.md` notes the new HDR / IBL capability + how to flip the spike's environment to `hdr` for visual verification.

### Re-deferred to S63

- **WEBGPU-post-bloom / WEBGPU-post-ssao / WEBGPU-post-lut / WEBGPU-post-fxaa** — Bloom / SSAO / LUT / FXAA on `RenderPipeline` (three/webgpu) with TSL nodes (`three/addons/tsl/display/{BloomNode, FXAANode, GTAONode}`). Different API than the WebGL composer; `setPostPipeline()` needs a webgpu branch that builds a TSL node graph instead of attaching EffectComposer passes.
- **DOCTOR-webgpu-post-aware** — doctor stops flagging post-passes once Story above lands.
- **WEBGPU-info-bloomMs** — `__agf.rendererInfo().postProcessingMs` from the WebGPU `RenderPipeline` execution.
- **WEBGPU-renderer-import-boundary** — re-deferred (no `engine/render/webgpu/` directory yet; lands with the post-pass / probe ports when files actually start landing there).
- **WEBGPU-spike-post** — spike picks up bloom + ssao + HDR once Stories above ship.

### Deliverables

- `engine/render/three-render-adapter.ts` — `PMREMGenerator` from `three/webgpu` imported as `WebGpuPMREMGenerator`; `setEnvironment()` branches on `capabilities.kind` to pick the right PMREMGenerator class.
- `docs/agent/skills/webgpu-rendering.md` — S62 row marked ✅; deferred list updated.
- `examples/webgpu-spike/README.md` — "What S62 added" section.

### Verification

- typecheck + unit tests + engine:check all clean.
- Headed playwright probe of `?project=webgpu-spike` with `--enable-unsafe-webgpu`: `renderer: "webgpu"`, geometries 5 → 18 (PMREM cube probes), textures 5 → 9 (PMREM RTs), zero pageerrors. RoomEnvironment IBL feeds the spike's metallic / glossy materials.
- Verified existing WebGL projects still work (hello-3d / material-bench / water-bench all keep their WebGL paths via the capability check).

### Follow-Ups

- **S63 — feature parity II**: Bloom / SSAO / LUT / FXAA via `three/webgpu` `RenderPipeline` + TSL nodes; CSM via `CSMNode`; PCSS rewritten as TSL node; reflection probes via WebGPU CubeRenderTarget + `three/webgpu` PMREM (already wired by S62); planar mirror via `ReflectorNode`; GPU timer via `GPUQuerySet`. All of these are individually sprint-sized; S63 may pick the highest-value subset.
- **HDR sky file shipped on the spike** — the spike still uses `environment.kind: "generated"` so the visual win is subtle (RoomEnvironment ambient). A real HDR like `venice_sunset_1k.hdr` (already in `material-bench`) would make the IBL improvement obvious.

## Sprint 63 — WebGPU light investigation + HemisphereLight position fix

Status: Completed and archived as a single-story sprint. Originally planned as a 14-story feature-parity push (post-processing chain + reflection probes + CSM + PCSS + planar mirror + GPU timer); the user reported a critical visual bug (black-screen on webgpu-spike) mid-sprint and asked to investigate light sources explicitly. The investigation found and fixed the root cause — turned out to be the cause of multiple downstream symptoms — so the sprint closed on Story 1 and the remaining feature-parity work moved to S64.

### Completed Work

1. **WEBGPU-light-investigation + HemisphereLight position fix** — three.js's WebGPU `HemisphereLightNode` (r0.184) derives its "up" direction from the light's world position; a HemisphereLight at world origin produces a zero-length direction vector and silently contributes no light. WebGL ignores light position so the same scene works fine there. Root cause traced via systematic test scenes (`examples/webgpu-light-test/` — five spheres each lit by a different `Light.kind`); investigation steps documented in commit history. Fix: `setLightTransform` clamps any HemisphereLight's `position.y` to `>= 1` regardless of mode (harmless on WebGL, makes WebGPU work). User insight ("maybe the hemisphere position is wrong?") was the breakthrough.
2. **Diagnostic project `examples/webgpu-light-test/`** — permanent diagnostic for future WebGPU light bugs. Five spheres lit by ambient / hemisphere / directional / point / spot in isolation + a shadow-casting directional. Registered with the project switcher; passes engine:check.

### Re-deferred to S64 (was originally S63 scope)

- **WEBGPU-post-pipeline** — `three/webgpu` `RenderPipeline` orchestration for the post-pass chain.
- **WEBGPU-post-bloom / WEBGPU-post-ssao / WEBGPU-post-lut / WEBGPU-post-fxaa** — TSL node ports for each post pass.
- **WEBGPU-reflection-probe** — `WebGPUCubeRenderTarget` port for cube probes. PMREM prefilter already works (S62).
- **WEBGPU-csm** — `CSMNode` (or single-cascade DirectionalLight shadow fallback).
- **WEBGPU-planar-mirror** — `ReflectorNode`.
- **WEBGPU-pcss** — TSL rewrite of GLSL shader-chunk PCSS.
- **WEBGPU-gpu-timer** — `GPUQuerySet { type: "timestamp" }`.
- **WEBGPU-spike-features** — extend webgpu-spike to exercise the new code paths.
- **WEBGPU-renderer-import-boundary** — once `engine/render/webgpu/` directory exists.
- **DOCS-webgpu-skill-update**, **DOCTOR-webgpu-flags-up-to-date** — both update as features land.

### Why this sprint was scoped to one story

The light investigation was a user-tagged blocker — the entire webgpu-spike project rendered as black silhouettes, making any subsequent feature work impossible to verify visually. Closing the sprint here records the fix cleanly + doesn't pretend to bundle the remaining feature-parity work that's much larger. Each remaining story is realistically a half-sprint to a sprint on its own. S64 pulls them in as a coherent package.

### Deliverables

- `engine/render/three-render-adapter.ts` — `setLightTransform` clamps HemisphereLight `position.y` to `>=1`.
- `examples/webgpu-light-test/` (new) — full diagnostic project with five lights.
- `src/main.ts` — project switcher entry for `?project=webgpu-light-test`.
- `docs/agent/skills/webgpu-rendering.md` — "Live-discovered gotchas" entry for HemisphereLight position behavior.
- (Inherited from earlier hotfix #69) — `examples/webgpu-spike/scenes/start.scene.json` reverted to the original config (HemisphereLight at origin) now that the adapter handles it; `drawCalls` reads `frameCalls` on WebGPU.

### Verification

- typecheck + 511 unit tests pass.
- Headed playwright probe of `?project=webgpu-spike` on chromium with `--enable-unsafe-webgpu`: scene renders correctly with the original HemisphereLight at origin config (pink cube, blue sphere, yellow cylinder, blue floor, shadows). `drawCalls` steady at 3.
- `?project=webgpu-light-test`: all five light kinds light their respective spheres.
- WebGL projects (hello-3d, material-bench) unchanged (`renderer: "webgl"`, normal mesh + draw counts).

### Follow-Ups

- **S64 — feature parity (full)**: pull in all the re-deferred stories. Realistically still won't fit in one sprint; pick highest-value subset (probably post-bloom + reflection probe — those are most visually impactful for material-bench / beacon-world migration).
- **Verify other light kinds on WebGPU** — only HemisphereLight had the position bug per investigation, but worth a regression e2e test that exercises all five kinds before S65 default-flip.
- **Upstream three.js**: the HemisphereLight position dependency looks like an unintended difference between WebGL and WebGPU; possibly worth reporting / PR'ing on three.js's tracker.

## Sprint 64 — WebGPU reflection probe port

Status: Completed and archived as a single-story sprint. Same pattern as S63: priority-ordered S64 plan was 9 stories, shipped the highest-value one (reflection probe — the most user-visible feature with the smallest delta), deferred the rest to S65 alongside default-flip prep. Honest scope: each remaining story (post-passes, CSM, PCSS, planar mirror, GPU timer, lazy import) is a half-sprint of focused work.

### Completed Work

1. **WEBGPU-reflection-probe** — three.js's WebGPU build ships its own `CubeRenderTarget` (renamed from `WebGLCubeRenderTarget`) that runs through the WebGPU pipeline. `CubeCamera` is renderer-agnostic. PMREM prefilter wired in S62. Adapter `acquireReflectionProbe` branches on `capabilities.kind` to pick the right RT class. `WEBGPU_CAPABILITIES.supportsReflectionProbe: false → true`. Webgpu-spike updated with a probe on the hero cube (bake-once via `updateRate: 0`) to verify the path; live probe confirms `reflectionProbes: 1` with zero console errors.
2. **Reflection probe + spinning shadow-caster interaction documented.** User caught a shadow-map flicker on the spike's spinning cube when the probe ran at `updateRate > 0`. Root cause: probe pass hides the cube → directional shadow re-bakes without it → next main render reads a stale shadow map. WebGL's pass ordering happens to mask this. Workaround documented in the skill memo: `updateRate: 0` for moving probe owners. Proper engine-side fix needs probe-pass / shadow-pass ordering work, parked.

### Deferred to S65

- **WEBGPU-gpu-timer** — wrap `GPUQuerySet { type: "timestamp" }` in a `WebGpuTimer` parallel to `engine/render/gpu-timer.ts`.
- **WEBGPU-post-pipeline + WEBGPU-post-bloom + WEBGPU-post-ssao + WEBGPU-post-lut + WEBGPU-post-fxaa** — `three/webgpu` `RenderPipeline` + TSL nodes for each pass.
- **WEBGPU-csm / WEBGPU-pcss / WEBGPU-planar-mirror** — heavier feature ports.
- **WEBGPU-lazy-import** — move `three/webgpu` import inside `await adapter.init()` so the WebGL bundle drops ~145 KB. Constructor refactor (defer device creation to init); affects many constructor-side init paths (`info.autoReset`, GPU timer probe, shadow algorithm, color, fallback lighting).
- **Migrating existing projects** to WebGPU.
- **Default-flip** to WebGPU.

### Deliverables

- `engine/render/three-render-adapter.ts` — `acquireReflectionProbe` branches on capabilities to pick `WebGpuCubeRenderTarget` vs `WebGLCubeRenderTarget`.
- `engine/render/render-adapter.ts` — `WEBGPU_CAPABILITIES.supportsReflectionProbe = true`.
- `examples/webgpu-spike/scenes/start.scene.json` — hero cube gains `ReflectionProbe` + `EnvmapBinding` at `updateRate: 0`.
- `docs/agent/skills/webgpu-rendering.md` — reflection probe gotcha + S62-era HemisphereLight gotcha both documented.

### Verification

- typecheck + 511 unit tests pass.
- Headed playwright probe of `?project=webgpu-spike` with `--enable-unsafe-webgpu`: `renderer: "webgpu"`, `reflectionProbes: 1`, `meshes: 4`, `drawCalls: 3` steady, zero pageerrors. Scene renders correctly with reflection probe baked once at startup.
- material-bench WebGL path verified unchanged: `renderer: "webgl"`, 3 probes, 139 draws.

### Follow-Ups

- **S65** — the heaviest sprint of the WebGPU push. Brings the remaining feature parity (post-passes, CSM, PCSS, planar mirror, GPU timer) + lazy `three/webgpu` import + re-bench + migrate `examples/*` to WebGPU + flip the engine default. Realistically may itself need to be a multi-sprint epic.

## Sprint 65 — WebGPU post-bloom investigation (blocked on ShaderMaterial)

Status: Completed and archived as an investigation-only sprint. Attempted the WebGPU bloom port; the TSL node graph build succeeded but rendering threw `THREE.NodeBuilder: Material "ShaderMaterial" is not compatible` repeatedly and the scene rendered pure black. Reverted cleanly.

### Completed Work

1. **WEBGPU-post-bloom investigation** — wired `three/webgpu` `PostProcessing` + `three/addons/tsl/display/BloomNode.js` as a parallel pipeline alongside the existing WebGL `EffectComposer`. Capability flag `supportsPostBloom` proposed. Implementation typecheck'd and the build wired up; first runtime probe surfaced the `ShaderMaterial` incompatibility. Bisected — removing `environment.kind: "generated"`, the reflection probe, and `castShadow` in isolation each did NOT clear the error. Concluded: AGF's render path contains at least one `ShaderMaterial` instance the TSL `NodeBuilder` can't auto-convert; candidates include three.js's internal shadow `MeshDepthMaterial` (extends `ShaderMaterial`), PMREM `RoomEnvironment` shader materials, and AGF's `GroundedSkybox` / `ShadowMaterial`. Reverted all bloom code; capability flags stay `supportsPostProcessing: false` on WebGPU.
2. **Skill memo update** — `docs/agent/skills/webgpu-rendering.md` gains an "S65 investigation: post-processing on WebGPU blocked" section documenting the failure mode + the audit plan needed to unblock future post-pass ports.

### Why this sprint scoped to one investigation

The bloom port turned out to be blocked on a deeper issue than the surface "swap composer → PostProcessing" pattern suggested. Each future WebGPU feature port likely surfaces a similar "AGF uses a legacy material that TSL doesn't auto-convert" wall — the porting work is less mechanical than the S60 sketch implied. The honest answer for S65 was to investigate, document the wall, and not pretend it was resolved.

### Deferred to S66

- **WEBGPU-shadermaterial-audit (new)** — audit every `ShaderMaterial` AGF or three.js creates during a render frame; either swap to node-material equivalents in WebGPU mode (`MeshDepthNodeMaterial`, etc) or find a TSL escape-hatch.
- All previously-listed S65 stories (post-passes, CSM, PCSS, planar mirror, GPU timer, lazy import, migrations, default-flip) — gated on the audit above for any feature that touches the PostProcessing pipeline.

### Deliverables

- `docs/agent/skills/webgpu-rendering.md` — investigation findings + audit plan.

### Verification

- typecheck + 511 unit tests pass.
- Headed playwright probe of `?project=webgpu-spike` with `--enable-unsafe-webgpu`: scene renders correctly (no post-pipeline active), `renderer: "webgpu"`, `meshes: 4`, `drawCalls: 3` steady, zero pageerrors. WebGPU spike state preserved.

### Follow-Ups

- **S66** — start with the ShaderMaterial audit. Once we know which paths need node-material ports, the remaining feature parity stories (post-passes, CSM, planar mirror, etc) become tractable mechanical ports. Without it, every port is blocked by the same wall.

## Sprint 66 — WebGPU ShaderMaterial audit (tool + research)

Status: Completed and archived as an audit-tool + research sprint. The S65 bloom block prompted a deep investigation; S66 delivers the diagnostic tooling and a research write-up but not the actual unblock — the offender turned out to be an internal three.js code path that needs further investigation with a monkey-patch.

### Completed Work

1. **WEBGPU-shadermaterial-audit (tool)** — adapter method `auditMaterialClasses()` walks every scene object's `.material` + `.customDepthMaterial` + `.customDistanceMaterial`, plus shadow-pass occurrences for castShadow lights + composer passes. Exposed via `window.__agf.__auditMaterials()` for headed playwright probes. Lives in `engine/render/three-render-adapter.ts`.
2. **Research doc** — `docs/research/m21-webgpu-shadermaterial-audit.md`. Documents:
   - Audit results on webgpu-spike (only 4 `MeshStandardMaterial` + 1 shadow pass; **no `ShaderMaterial` in scene traversal**).
   - The exact error origin in `three/src/nodes/core/NodeBuilder.js:2985`.
   - `StandardNodeLibrary` registry: it maps `MeshStandard / Basic / Lambert / Phong / Toon / Physical / Normal / Matcap / LineBasic / LineDashed / Points / Sprite / ShadowMaterial` → node-material equivalents, but has **no entry for vanilla `ShaderMaterial`**.
   - Bisection results: removing env / probe / shadow each in isolation does NOT clear the error. The offender is in something always present on the WebGPU path, possibly an internal helper material created lazily during first `renderAsync` when `PostProcessing` is wired up.

### What S66 did NOT solve

Identifying *which* `ShaderMaterial` instance fires the error. The audit tool doesn't catch internal three.js construction. Next step is a monkey-patch on `ShaderMaterial.prototype.constructor` that captures stack traces — that's the S67 first story.

### Deliverables

- `engine/render/three-render-adapter.ts` — `auditMaterialClasses()` debug method.
- `src/app.ts` — `__auditMaterials()` on `AppHandle`.
- `src/main.ts` — `__auditMaterials` exposed on `window.__agf`.
- `docs/research/m21-webgpu-shadermaterial-audit.md` (new) — investigation findings.

### Verification

- typecheck + 511 unit tests pass.
- `engine doctor` clean on all 9 example projects.
- 11 / 11 e2e smoke; webgpu-spike unchanged (scene renders correctly, `renderer: "webgpu"`).

### Follow-Ups

- **S67 — monkey-patch ShaderMaterial constructor** to capture stack traces of every ShaderMaterial instantiation during webgpu-spike boot + bloom attempt. Identifies offender. Then port that offender to a node-material equivalent.
- **Honest schedule revision**: each WebGPU feature port may need its own ShaderMaterial-audit cycle. The default-flip is more distant than the S60 spike sketch suggested.

## Sprint 67 — WebGPU bloom upstream-block confirmed

Status: Completed and archived as a research sprint. The S65 bloom blocker has been traced to its origin via `console.error` stack capture; verdict is "upstream three.js bug / limitation in r0.184", not fixable from AGF without forking three.js.

### Completed Work

1. **WEBGPU-shadermaterial-stacktrace** — re-enabled the S65 bloom path under controlled probe + patched `console.error` via playwright `page.addInitScript` to capture stacks. Five identical stacks during first frame, all from `WebGPURenderer._renderObjectDirect` → `NodeManager.needsRefresh` → `RenderObject.getMonitor` / `getNodeBuilderState` → `WGSLNodeBuilder.build` → `prebuild` → `error()`. Confirms the offending `RenderObject` is a Mesh in the rendered draw list. Source: three.js's internal bloom orchestration (BloomNode's pingpong quads use vanilla `ShaderMaterial`).
2. **Bloom revert (clean)** — reverted the temporary bloom code; webgpu-spike preserved working (env=generated, probe, castShadow).
3. **Research doc update** — `docs/research/m21-webgpu-shadermaterial-audit.md` extended with the stack trace + verdict. Workarounds + upstream-tracking guidance.

### Verdict

WebGPU post-processing is **blocked upstream** in three.js r0.184. Workarounds:
1. Pin a different three.js version once a working post-processing path lands (likely r0.185+).
2. Fork `BloomNode` to use `NodeMaterial` for internal quads (large maintenance burden, not recommended).
3. Park WebGPU post-processing entirely until upstream publishes the fix.

S68 takes path 3 — continue WebGPU feature parity on axes that DON'T touch post-processing.

### Deliverables

- `docs/research/m21-webgpu-shadermaterial-audit.md` extended with stack trace + verdict.
- Bloom code reverted cleanly. `supportsPostProcessing: false` on WebGPU stays.

### Verification

- typecheck + 511 unit tests pass.
- `engine:check` clean on 9 projects.
- webgpu-spike: `renderer=webgpu`, 4 meshes, 3 draws, scene renders, zero pageerrors.

### Follow-Ups

- **S68 — migrate post-processing-free projects to WebGPU** (hello-3d, physics-bench, batch-bench, webgpu-light-test as a sanity baseline). Confirms the WebGPU core path is mature enough for real migrations on projects that don't need post-passes / CSM / planar mirror.
- **Periodic three.js minor check** — every minor release, re-run the bloom test; flip `supportsPostProcessing: true` once upstream fixes the ShaderMaterial issue.

## Sprint 68 — Migrate hello-3d + physics-bench to WebGPU + auto-fallback policy

Status: Completed and archived. Three stories shipped:

### Completed Work

1. **WEBGPU-fallback-policy** — adapter constructor now detects `navigator.gpu === undefined` and falls back to WebGL automatically with a `console.warn`. Saves users from black-canvas + console error when opting a project into WebGPU on a browser without WebGPU support. Bonus discovery: three.js's `WebGPURenderer` itself has an internal WebGL2 backend fallback for cases where `navigator.gpu` is defined but unusable (e.g. headless chromium without `--enable-unsafe-webgpu`); the AGF flag still reads `renderer: "webgpu"` in that case, but rendering succeeds through the WebGL2 backend.
2. **MIGRATE-hello-3d-webgpu** — `examples/hello-3d/project.json#render.mode: "webgl" → "webgpu"`, `batching.auto: true → false` (batching not yet supported on WebGPU adapter). Scene + shadows + Spin all render correctly. Headed chromium with `--enable-unsafe-webgpu` confirms `renderer: webgpu`, 8 meshes, 3 draws. Smoke tests pass on headless via three.js's WebGL2 fallback.
3. **MIGRATE-physics-bench-webgpu** — same pattern. Scene renders correctly with 60fps, 208 entities, physics + shadow + materials all working. WebGPU adapter coexists with Rapier physics.

### Out of scope (still on WebGL)

- `material-bench` — uses bloom post-pass (upstream-blocked) + multi-probe + PMREM-prefilter + transmission.
- `shadows-bench` — uses CSM (not yet on WebGPU).
- `water-bench` — uses `PlanarMirror` (Reflector — not yet ported).
- `webgpu-spike` / `webgpu-light-test` — already on WebGPU.
- `batch-bench` — heavy InstancedMesh / BatchedMesh use; the adapter's bucket methods stub on WebGPU and the bench would fall back to per-mesh, defeating its purpose. Migrate once batching ports.
- `beacon-world` — gameplay project; deserves a separate migration sprint that verifies physics + dev-bridge + persistence on WebGPU.

### Deliverables

- `engine/render/three-render-adapter.ts` — fallback policy in constructor.
- `examples/hello-3d/project.json` — webgpu mode + batching off.
- `examples/physics-bench/project.json` — webgpu mode + batching off.

### Verification

- typecheck + 511 unit tests pass.
- Preflight clean: 11 / 11 e2e smoke (1 webgpu skipped on headless), 9 / 9 engine:check.
- Live playwright probe of hello-3d + physics-bench under `--enable-unsafe-webgpu`: both renderers report `webgpu`, scenes render correctly with shadows + materials + physics.
- Headless probe of hello-3d (no `--enable-unsafe-webgpu`): three.js auto-falls-back to WebGL2 backend; `renderer: webgpu` flag still set; scene renders. Smoke tests confirm this on CI.

### Follow-Ups

- **S69 — WEBGPU-gpu-timer** (small, contained, non-post-processing) or **WEBGPU-lazy-import** (145 KB bundle win, constructor refactor).
- **Three.js r0.185+ tracker** — re-test bloom on each minor; flip remaining projects to WebGPU once post-processing unblocks.
