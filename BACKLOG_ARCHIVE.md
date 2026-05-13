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

