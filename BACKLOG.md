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

## Current Sprint: Sprint 39 — TBD

Sprint 39 focus is picked at sprint start. Natural openers (in priority order based on Sprint 38 close):

1. **M24-static-mesh** — fixed-body `trimesh` + `heightfield` colliders from GLB assets. `engine check` warns on huge trimesh, rejects dynamic trimesh, validates heightfield dimensions. Unlocks levels built from real geometry (terrain heightfields, art-pipeline meshes) instead of authored boxes.
2. **M25 / ASSET-compression** — wire the M24-decoder singletons (DRACO + KTX2 + Meshopt) into `createGlbLoader` for at least one project. Foundation for the ASSET pipeline epic — Beacon's GLBs become Draco-compressed and KTX2-textured.
3. **M21-mat-textures** — manifest texture maps (base colour / normal / roughness / metalness / emissive / AO) routed through the shared KTX2Loader.
4. **M21-color** — output color space + tonemap pipeline review. Verify Beacon + shadows-bench under correct sRGB → ACES filmic.
5. **M21-context-loss** — listen for `webglcontextlost` / `webglcontextrestored`; emit diagnostics + rebuild renderer resources on restore.
6. **M21-post-pipeline** — schema-driven post-processing chain (`project.json#renderer.post`) with selective Bloom + FXAA + tonemap at end.
7. **M21-mat-custom** — custom `ShaderMaterial` / `onBeforeCompile` material kind for the manifest.
8. **RUNTIME-renderer-ready** — async "renderer-ready" signal on `runtime.start()` for tests + dev bridge to await before screenshots / commands.

Default sprint size is 8–12 stories per `feedback-sprint-size`.

### Investigation candidates

- **DEV-server-test-coexist** — `playwright.config.ts` already declares `reuseExistingServer: true`, yet `preflight` (and ad-hoc `npx playwright test ...`) sometimes still conflict with a developer-launched `npm run dev` on 5173. Reproduce the failure mode, then either tighten the probe (HEAD `/__agf/health` before deciding to spawn) or pick a different port for headless test runs so the dev server stays untouched. Source: agent kept killing 5173 manually between commits — disruptive to the live dev loop.

### Parking lot (utsubo follow-ups + other carry-overs)

These remain in scope but did not make the Sprint 37 opener list.

#### Utsubo-driven follow-ups (`Notes/utsubo_threejs_best_practices_100_tips.md`)

- `M21-tsl-investigate` Spike: evaluate Three.js TSL / NodeMaterial for AGF custom-material manifest path. Output: research doc + a recommendation on whether to defer until WebGPU renderer or adopt early as a v1 material kind.
- `M21-webgpu-spike` Async WebGPU renderer adapter behind a profile flag (`project.json#renderer.backend: "auto" | "webgl" | "webgpu"`).
- `M21-context-loss` Listen for WebGL `webglcontextlost` / `webglcontextrestored`; emit `AGF_RENDER_CONTEXT_LOST` / `AGF_RENDER_CONTEXT_RESTORED` diagnostics; rebuild renderer resources on restore.
- `M21-light-budgets` `performance-budget.json#renderer.maxActiveLights` / `maxShadowCastingLights` / `maxShadowMapSize` + `engine doctor` warnings.
- `M21-shadow-static` `renderer.shadowMap.autoUpdate = false` for declared-static shadow casters with explicit invalidation API.
- `M21-post-pipeline` Schema-driven post-processing chain (`project.json#renderer.post: [...]`) with selective bloom + FXAA + tonemap at end.
- `M17-material-sharing-doctor` Doctor check: detect duplicate material signatures + report which manifests could be merged.
- `M17-static-merge-spike` Static geometry merge with reverse `EntityId` lookup for picking. Strictly opt-in per-entity (`StaticMerge` tag).
- `M17-lod` `LOD { levels: [{ maxDistance, mesh }] }` component + integration with batching's per-instance LOD path.
- `ASSET-decoder-paths` Single shared `DRACOLoader` + `KTX2Loader` constructed at adapter init; `KTX2Loader.detectSupport(renderer)` once.
- `ASSET-compression` Runtime support for KTX2 (UASTC normal + ETC1S diffuse) + Draco / Meshopt geometry.
- `ASSET-gltf-transform-investigate` Decide tooling: dev dep vs external CLI vs optional agent skill.
- `ASSET-optimize-command` `engine asset optimize <project> <asset>` CLI invoking gltf-transform with project presets.
- `ASSET-lod-metadata` LOD schema + `engine check` validation (distances strictly increasing, fallback declared).
- `ASSET-texture-doctor` Doctor warnings: huge uncompressed PNG/JPEG in production profile, NPOT mismatches, missing KTX2 transcoder path.
- `RUNTIME-progressive-loading` Asset manifest `priority: "critical" | "deferred"` + placeholder primitive + scene phases.
- `RUNTIME-renderer-ready` Async "renderer-ready" signal on `runtime.start()` for tests + dev bridge.
- `RUNTIME-resource-leak-tests` HMR + adapter lifecycle leak tests across 30 cycles; assert renderer.info counters stay bounded.
- `RUNTIME-idle-rendering` Render-on-demand mode for static menus / inspector tools. Optional `renderer.demand: true`.
- `RUNTIME-gpu-timing` Feature-detected GPU timing queries (`EXT_disjoint_timer_query_webgl2`) in dev builds.

#### Pre-utsubo carry-overs

- `M21-shadow-soft` Re-evaluate `PCFSoftShadowMap` vs `PCFShadowMap` vs `VSMShadowMap` when three.js stabilises soft shadows.
- `M21-shadow-glb-acne` Self-shadow polish on low-poly GLB meshes; investigate per-material `shadowSide = THREE.BackSide`, scale-aware bias, or polygonOffset overrides.
- `M21-shadow-algorithm` PCSS / VSM exploration once CSM lands.
- `M21-mat-custom` Custom shader / `onBeforeCompile` material kind.
- `M21-mat-textures` Manifest texture maps + KTX2 path.
- `M21-color` Output color space + tonemap pipeline review.
- `M21-env-hdr`, `M21-env-cube` HDR / cubemap environment sources beyond the generated room.
- `M21-cam-*` Camera helpers (orbit / follow / cinematic) as ECS components.
- `M20-a..l` Netcode rework (carried from Sprint 32).
- `M3-c-load` + `M3-c-beacon` Wire `expandScenePrefabs` into scene-load + Beacon adopts prefab instances.
- `M16-cache-e` Reusable matrices / pooled scratch buffers inside the cache layer.
- `M2b-seed`, `13.13` audio, `10.5+` C# WS transport.
