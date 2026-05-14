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

## Current Sprint: Sprint 43 — TBD

Sprint 43 focus is picked at sprint start. Natural openers (in priority order based on Sprint 42 close):

1. **M21-shadow-pcss-modern** — rewrite the PCSS substitution against the modern PCF chunk. Today's S41 implementation only hits the BASIC variant of `getShadow` (texture2D path); default `PCFShadowMap` uses Vogel disc + `sampler2DShadow` + `texture(...)`, so PCSS silently no-ops in every project that doesn't override `shadowMap.type`. Substitute against that chunk and verify on `shadows-bench` + `physics-bench`.
2. **M21-shadow-pcss-csm** — extend PCSS into `three/addons/csm/CSMShader.js` so cascade-shadow scenes (`shadows-bench`) get PCSS too. Today `applyPcssShadowChunks` only touches the standard `shadowmap_pars_fragment` chunk; CSM has its own.
3. **ASSET-texture-compress** — KTX2 / Basis texture compression behind a `--textures` flag on `engine asset optimize`. Needs `basisu` toolchain commitment + per-channel policy authoring + `sharp` runtime.
4. **M21-cam-cinematic** — scripted camera-track playback (sequence of `{ position, target, duration, ease }` waypoints). Useful for intro cinematics + replay tooling.
5. **M21-env-cube** — cubemap environment source (6-face cross or per-face URLs) via CubeTextureLoader, complementing the S42 HDR path.
6. **M21-webgpu-spike** — async WebGPU renderer adapter behind a profile flag (`project.json#renderer.backend: "auto" | "webgl" | "webgpu"`). Anchors the eventual TSL decision.
7. **M17-lod-batched** — wire `LodSelectionSystem` to BatchedMesh's per-instance geometry id so LOD swap doesn't drop the entity out of the bucket.
8. **ASSET-decoder-vendor** — vendor draco / basis libs into `public/decoders/` for offline / air-gapped builds (S40 vendored them but verify the decoder paths + add a CI guard against the CDN fallback).

Default sprint size is 8–12 stories per `feedback-sprint-size`.

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
