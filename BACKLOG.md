# Backlog

Date: 2026-05-14

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

## Current Sprint: Sprint 47 — Game-feel pass (tween / particles / cinematic / PCSS / shadows-bench polish)

Visible feedback layer + shadow polish. Adds 3 ECS-native game-feel primitives, fixes the S41 PCSS substitution that was silently no-op'ing, and tunes the shadows-bench scene to look alive.

### Stories

1. **M19-tween** ✅ — `Tweens` component (array of tween specs) + `TweenSystem` (fixedUpdate, replay-deterministic). Easing kinds: linear / easeIn / easeOut / easeInOut / `pulse` (sin(πt) for one-shot bounces). Loop modes: none / loop / ping-pong. 6 unit tests.
2. **M19-particle-preset** ✅ — `ParticleEmitter` component + `ParticleEmitterSystem` + adapter `ParticlePool` API (additive InstancedMesh). Built-in presets: spark / glow / pulse. Auto-removed when emitter lifetime expires and particles drain.
3. **M21-cam-cinematic** ✅ — `CinematicCamera` component (waypoint list + per-segment ease + loop) + `CinematicCameraSystem`. Replay-safe via `elapsed` on the component.
4. **M21-shadow-pcss-csm + bug fix** ✅ — discovered the S41/S44 PCSS shader-chunk substitution silently no-op'd because three.js bumped whitespace inside `shadowmap_pars_fragment`. Replaced the literal match with a regex that tolerates whitespace + emits a console warning if upstream drifts. Added a regression test asserting the chunk actually contains `PCSS(` after `applyPcssShadowChunks()`. CSMShader uses the same `getShadow` symbol so cascades inherit PCSS automatically — no separate patch needed.
5. **beacon-world adoption** ✅ — pickup: spark burst on the core at the moment of pickup. Repair: `pulse`-ease Tween bounces beacon scale × 1.18 over 0.36 s + a 0.5 s spark burst. Both auto-remove themselves.
6. **shadows-bench polish** ✅ — fixed tree crown hovering above trunk (sphere primitive's radius is 0.5, not 1; corrected the canopy y offset). Added `pulse`-loop Tween on every trunk's X rotation (1.6–2.8° sway, staggered phase) so the forest sways in the wind. Tuned shadows: PCSS algorithm + 3 cascades + 1024 maps + `shadowNormalBias: 0.12` + near-zero shadowBias to kill the peter-pan gap and stay 120 fps at max zoom. Reduced PCSS `LIGHT_WORLD_SIZE` from 0.005 → 0.0025 for a tighter penumbra. Plumbed `shadowNormalBias` through CSM config + project schema + adapter.

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

## Archived: Sprint 46 — CI e2e stabilization

Narrow-focus sprint: the new `e2e.yml` workflow added in Sprint 44 fails the same ~10 specs on every CI run while the same specs pass locally on macOS in 5–15s each. Closing that gap is a blocker for treating the e2e workflow as a useful PR gate.

### Research

- **`docs/research/e2e-ci-investigation.md`** ✅ — Root cause: 5s inline `waitForFunction` budgets calibrated for local macOS frame pacing; ubuntu-latest's SwiftShader software-WebGL + cold Vite transform push the first physics tick past that budget. No production regressions — every failure is a timeout, never a wrong value.

### Stories

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

## Archived: Sprint 45 — Agent authoring helpers

Closes the "should fix soon" list from `Notes/codex_review_2.md` — give an agent a discoverable authoring CLI so the `engine new → engine list → engine explain → engine check → engine run → engine screenshot` loop is one command per step.

### Stories

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

## Archived: Sprint 44 — CI parity + renderer follow-ups

Follows Sprint 43's open-source readiness work. Closes the remaining `Notes/codex_review_2.md` gates (CI parity + e2e stability) and lands the renderer follow-ups deferred from S43.

### Stories

1. **OSS-ci-parity** ✅ — Extended `.github/workflows/repo-hygiene.yml` with `imports:check` + `systems:check` in the typecheck job, plus two new jobs: `node-backend-smoke` (`npm run backend:node`) and `dotnet-backend-build` (Release build). New `.github/workflows/e2e.yml` runs Playwright in its own workflow + uploads the playwright-report artifact on failure.
2. **OSS-e2e-stability** ✅ — Playwright config gains a `serial-heavy` project for `hmr-stress` + `multiclient-roundtrip` (serial, 90s timeout, retries=2). `hmr-stress` alternates the material body each cycle so Vite's watcher doesn't coalesce identical-bytes writes. `app.spec.ts` + `score-pulse.spec.ts` await `__agf.rendererReady` before pixel sampling / gameplay applyCommands so they don't race the renderer warm-up.
3. **M21-shadow-pcss-modern** ✅ — Root-cause fix for the S41 PCSS no-op. The substitution targets the BASIC `getShadow` variant (texture2D + raw depth); modern `PCFShadowMap` uses `sampler2DShadow` which only returns 0/1, so the substitution silently does nothing. Adapter now maps `algorithm: "pcss"` → `BasicShadowMap` (matching three's own `webgl_shadowmap_pcss.html`). `algorithm: "pcf"` stays on modern `PCFShadowMap`. New `tests/unit/shadow-pcss-algorithm.test.ts` guards the mapping.
4. **M21-env-cube** ✅ — `scene.environment.kind: "cube"` with a 6-face URL array `[+x, -x, +y, -y, +z, -z]` via `CubeTextureLoader` + `PMREMGenerator.fromCubemap` (IBL-ready, not just a skybox). Schema gains `faces` + an `allOf/if/then` requiring it when `kind: "cube"`. `tests/unit/scene-environment-schema.test.ts` adds 4 cube cases.

### Verification

- `npm run repo:hygiene` ✅
- `npm run typecheck` ✅
- `npm run imports:check` / `systems:check` ✅
- `npm run test` ✅ — `tests/unit/scene-environment-schema.test.ts` + `shadow-pcss-algorithm.test.ts` + `doctor-vendor-budgets.test.ts` + preexisting suite all green (412+ tests).

### Deferred to Sprint 45

Agent-authoring helpers from `Notes/codex_review_2.md`'s "should fix soon" list: `engine new --template`, `engine list components`, `engine explain component`, `engine screenshot`, `docs/agents/build-a-game.md`.

## Archived: Sprint 43 — Open-source readiness

Triggered by `Notes/codex_review_2.md` (open-source readiness audit, 2026-05-14). The review flagged release-hygiene blockers — missing LICENSE, stale README/DEVELOPMENT/backend docs, doctor vs bundle:check budget mismatch, one Cyrillic phrase in a research doc. Sprint 43 closes those gates so AGF can be presented as a pre-alpha engine without confusing first-time readers.

### Stories

1. **OSS-cyrillic-fix** ✅ — Replaced `"почти как в Unity"` → `"almost Unity-class"` in `docs/research/renderer-ecs-split-investigation.md`.
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

### Deferred to Sprint 44

The renderer / asset-pipeline openers that were originally pencilled for Sprint 43 (PCSS-modern, PCSS-CSM, ASSET-texture-compress, cam-cinematic, env-cube, webgpu-spike, M17-lod-batched, ASSET-decoder-vendor verification) move to Sprint 44 alongside the remaining OSS-readiness work (CI parity, e2e stability).

Default sprint size is 8–12 stories per `feedback-sprint-size`. Sprint 43 lands 8 stories.

### Parking lot

Open work that did not make the Sprint 43 opener list. Each entry stays here until promoted.

#### Renderer (Phase 2 tail)

- `M21-shadow-pcss-modern` Rewrite PCSS substitution against the modern PCF chunk (Vogel + `sampler2DShadow`). S41 only touched the BASIC variant.
- `M21-shadow-pcss-csm` Extend PCSS substitution into `CSMShader.js`.
- `M21-webgpu-spike` Async WebGPU renderer adapter behind a profile flag (`project.json#renderer.backend: "auto" | "webgl" | "webgpu"`).
- `M21-env-cube` Cubemap environment source (6-face cross or per-face URLs) via CubeTextureLoader.
- `M21-cam-cinematic` Scripted camera-track playback (`{ position, target, duration, ease }` waypoints).
- `M21-shadow-soft` Re-evaluate `PCFSoftShadowMap` vs `PCFShadowMap` vs `VSMShadowMap` once three.js stabilises soft shadows.
- `M21-shadow-glb-acne` Self-shadow polish on low-poly GLB meshes; investigate per-material `shadowSide = THREE.BackSide`, scale-aware bias, or polygonOffset overrides.

#### Asset pipeline (M25)

- `ASSET-optimize-command` `engine asset optimize <project> <asset>` CLI invoking gltf-transform with project presets.
- `ASSET-lod-metadata` LOD schema + `engine check` validation (distances strictly increasing, fallback declared).
- `ASSET-texture-doctor` Doctor warnings: huge uncompressed PNG/JPEG, NPOT mismatches, missing KTX2 transcoder path.

#### Batching / scene composition

- `M17-lod-batched` Wire LodSelectionSystem to BatchedMesh's per-instance geometry id so LOD swap doesn't drop the entity out of the bucket.
- `M17-static-merge-spike` Static geometry merge with reverse `EntityId` lookup for picking. Strictly opt-in per-entity (`StaticMerge` tag). Deferred until a 10k+ static-prop project asks (see `docs/research/m17-static-merge-investigation.md`).
- `M3-c-load` + `M3-c-beacon` Wire `expandScenePrefabs` into scene-load + Beacon adopts prefab instances.
- `M16-cache-e` Reusable matrices / pooled scratch buffers inside the cache layer.

#### Runtime + dev surface

- `RUNTIME-progressive-loading` Asset manifest `priority: "critical" | "deferred"` + placeholder primitive + scene phases.
- `RUNTIME-idle-rendering` Render-on-demand mode for static menus / inspector tools.
- `RUNTIME-gpu-timing` Feature-detected GPU timing queries in dev builds.

#### Pre-utsubo carry-overs

- `M20-a..l` Netcode rework (carried from Sprint 32).
- `M2b-seed`, `13.13` audio, `10.5+` C# WS transport.
