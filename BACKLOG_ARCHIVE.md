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

