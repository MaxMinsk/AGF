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

## Current Sprint: Sprint 40 — TBD

Sprint 40 focus is picked at sprint start. Natural openers (in priority order based on Sprint 39 close):

1. **M21-post-pipeline** — schema-driven `project.json#renderer.post` chain (EffectComposer + Bloom + FXAA + Outline + tonemap). The remaining big-visual Phase 2 item.
2. **M21-mat-custom** — custom `ShaderMaterial` / `onBeforeCompile` material kind for the manifest. Unlocks per-project shader experimentation without forking the adapter.
3. **M25 / ASSET-compression** — flip Draco / KTX2 / Meshopt flags on `createGlbLoader` for a real project; route `M21-mat-textures`' texture cache through the shared KTX2Loader for `.ktx2` URLs. Decoder singletons + texture cache already in place.
4. **ASSET-gltf-transform-investigate** — decide tooling for the offline pipeline (dev dep vs external CLI vs agent skill). Anchors `ASSET-optimize-command`.
5. **RUNTIME-resource-leak-tests** — HMR + adapter lifecycle leak tests across 30 cycles; assert `renderer.info.memory` / `info.programs` / `info.textures` stay bounded.
6. **M17-lod** — `LOD { levels: [{ maxDistance, mesh }] }` component + integration with batching's per-instance LOD path.
7. **M21-shadow-algorithm** — PCSS / VSM exploration once CSM is stable. Compare visual + perf vs the PCF default.

Default sprint size is 8–12 stories per `feedback-sprint-size`.

### Parking lot

Open work that did not make the Sprint 40 opener list. Each entry stays here until promoted.

#### Renderer (Phase 2 tail)

- `M21-tsl-investigate` Three.js TSL / NodeMaterial spike — portable WebGL+WebGPU shader authoring without forcing agents into WGSL + GLSL forks.
- `M21-webgpu-spike` Async WebGPU renderer adapter behind a profile flag (`project.json#renderer.backend: "auto" | "webgl" | "webgpu"`).
- `M21-env-hdr` / `M21-env-cube` HDR / cubemap environment sources beyond the generated room.
- `M21-cam-*` Camera helpers (orbit / follow / cinematic) as ECS components.
- `M21-shadow-soft` Re-evaluate `PCFSoftShadowMap` vs `PCFShadowMap` vs `VSMShadowMap` once three.js stabilises soft shadows.
- `M21-shadow-glb-acne` Self-shadow polish on low-poly GLB meshes; investigate per-material `shadowSide = THREE.BackSide`, scale-aware bias, or polygonOffset overrides.

#### Asset pipeline (M25)

- `ASSET-optimize-command` `engine asset optimize <project> <asset>` CLI invoking gltf-transform with project presets.
- `ASSET-lod-metadata` LOD schema + `engine check` validation (distances strictly increasing, fallback declared).
- `ASSET-texture-doctor` Doctor warnings: huge uncompressed PNG/JPEG, NPOT mismatches, missing KTX2 transcoder path.

#### Batching / scene composition

- `M17-static-merge-spike` Static geometry merge with reverse `EntityId` lookup for picking. Strictly opt-in per-entity (`StaticMerge` tag).
- `M3-c-load` + `M3-c-beacon` Wire `expandScenePrefabs` into scene-load + Beacon adopts prefab instances.
- `M16-cache-e` Reusable matrices / pooled scratch buffers inside the cache layer.

#### Runtime + dev surface

- `RUNTIME-progressive-loading` Asset manifest `priority: "critical" | "deferred"` + placeholder primitive + scene phases.
- `RUNTIME-idle-rendering` Render-on-demand mode for static menus / inspector tools.
- `RUNTIME-gpu-timing` Feature-detected GPU timing queries in dev builds.

#### Pre-utsubo carry-overs

- `M20-a..l` Netcode rework (carried from Sprint 32).
- `M2b-seed`, `13.13` audio, `10.5+` C# WS transport.
