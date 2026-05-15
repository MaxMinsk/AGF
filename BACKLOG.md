# Backlog

Date: 2026-05-15 (Sprint 55 archived)

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

## Next Sprint candidates

- **M21-shadow-map-size-real-hw** — `m21-shadows-bench-perf.md` measured shadowMapSize 1024 → 512 at only −3.8 % renderMs in headless software-WebGL. Real GPUs care a lot more about shadow-map fill rate + VRAM bandwidth. Re-run `scripts/perf-probe-shadows.mjs --only baseline,512map,2048map` on the user's machine. **User-driven** — agent doesn't run this.
- **DSS-move-then-stop-probe** — the S53 BEACON measurement showed 0 % saving in idle-only sampling because the fixed DSS only takes over after real movement. Write a probe that records idle → move → stop → idle and samples each phase; the "stopped after a move" phase is where the saving actually lands.
- **M17-static-merge-spike** — static geometry merge with reverse `EntityId` lookup for picking. Strictly opt-in per-entity (`StaticMerge` tag). Deferred until a 10k+ static-prop project asks (see `docs/research/m17-static-merge-investigation.md`).
- **M21-shadow-soft** — re-evaluate `PCFSoftShadowMap` vs `PCFShadowMap` vs `VSMShadowMap` once three.js stabilises soft shadows.
- **M21-shadow-glb-acne** — self-shadow polish on low-poly GLB meshes; investigate per-material `shadowSide = THREE.BackSide`, scale-aware bias, or polygonOffset overrides.
- **M21-webgpu-spike** — async WebGPU renderer adapter behind a profile flag (`project.json#renderer.backend: "auto" | "webgl" | "webgpu"`).
- **M16-cache-e** — reusable matrices / pooled scratch buffers inside the LTW cache layer. Defer until allocation profiling shows it matters.
- **render-pool-caller-migration** — S53 shipped the typed pool dispatcher + `PoolHandle` union but most call sites still use the per-kind acquire / release methods. A future sprint can migrate the call sites + retire the per-kind methods if the migration delivers measurable maintenance savings.
- **M17-batched-glb** — `updateBatched` falls back to placeholder geometry when the mesh ref isn't a primitive. Thread the AssetRegistry through so GLB references work inside batched buckets too (same way the instanced path does today).
- **BATCH-BENCH-bvh-stress** — `examples/batch-bench` is currently 400 in-view cubes (the case where `batched-bvh` doesn't win). Add a scenario knob that frames a narrow camera around a subset, so the BVH crossover can be measured live.
- **REFLECTION-prefilter** — re-PMREM each `ReflectionProbe` cubemap at a slower cadence (10 Hz) so `roughness > 0.1` materials get plausibly blurry dynamic reflections. Pairs with `REFLECTION-cube-probe` (lands in this sprint).
- **REFLECTION-planar** — `three/addons/objects/Reflector.js` vendored helper for planar mirrors (water, lobby floor, picture-frame glass). Pull when a project asks.
- **POST-bloom** — bloom post-pass is wired through the post pipeline but no project uses it yet. Add a worked example + tuner story when a beacon-world hero moment needs it.
- **M20-a..l** — netcode rework (carried from Sprint 32). Own sprint.
- **M2b-seed**, **13.13** audio, **10.5+** C# WS transport.

## Current Sprint: Sprint 56 — Engine hygiene + visual-fidelity v0

S52–S54 shipped the production-content layer; S55 brought the agent surface up to date. S56 mixes two threads:

1. Three carry-over engine-hygiene items the asset-pipeline friction note flagged (`MeshRenderer-material-path-validator`, `PRIMITIVE-set-single-source`, `ASSET-textures-via-registry`).
2. The high-ROI half of the `M26` visual-fidelity epic — GroundedSkybox + CubeCamera-based reflection probe + SSAO + LUT colour grade — plus an ADR audit catching up on the S53–S54 architectural decisions that never got an ADR.

12 stories — sized to the **10–15** floor per [[feedback-sprint-size]].

### Stories

1. **MESHRENDERER-material-path-validator** — `engine check` emits `AGF_MATERIAL_REF_INVALID` when `MeshRenderer.material` isn't a `.material.json` path under `assetRoot` (e.g. bare manifest ids like `"m1-brick"`). Suggestion points at the inferred full path. Fixture pair + 1 unit test. Every shipped example still validates clean. Diagnostics catalogue updated. Status: Implemented.
2. **PRIMITIVE-set-single-source** — `engine/core/primitives.ts` exports `PRIMITIVE_MESHES: ReadonlySet<string>` + `PRIMITIVE_MESH_NAMES: ReadonlyArray<PrimitiveMeshName>` + `isPrimitiveMesh()` helper. `batching-system.ts`, `project-check.ts`, `project-doctor.ts` import the constant; the JSON-schema enum in `render.schema.json` has a description pointing at the TS source to keep both in lockstep. `mesh-handle-registry.ts` retains its switch (the implementation) — adding a primitive remains a single-place add for callers + a paired switch case. Status: Implemented.
3. **ASSET-textures-via-registry** — texture refs inside material manifests resolve through `AssetRegistry.get<TextureAsset>()` instead of `assetRegistry.urlFor()` + raw `TextureLoader`. 404s emit `AGF_RUNTIME_ASSET_LOAD_FAILED`; HMR can invalidate one texture without remounting the material. Includes a dedicated `createTextureLoader()` that the registry registers like the existing material / glb loaders. Material-bench texture references survive unchanged.
4. **GROUND-skybox** — `three/addons/objects/GroundedSkybox.js` vendored helper added to the renderer adapter. New scene env shape: `environment.groundedSkybox: { height, radius }`. When set, the renderer mounts a GroundedSkybox mesh in place of (or alongside) the regular `scene.background`. Material-bench adopts it so the HDR meets the cement plinth instead of dropping straight to the horizon.
5. **REFLECTION-cube-probe** — new `engine/core/components/reflection-probe.ts` + `engine/runtime/components/envmap-binding.ts` schemas. New `ReflectionProbeSystem` runs before the main render: hides excluded entities, calls `cubeCam.update(renderer, scene)`, restores. `MaterialBindingSystem` reads `EnvmapBinding` and sets `material.envMap = probeRT.texture`. Material-bench centre chrome sphere adopts a 256² probe @ 60 Hz so it visibly reflects the orbiting outer ring.
6. **POST-ssao** — `three/addons/postprocessing/SSAOPass.js` vendored. Wired into the existing composer via `project.json#render.post: [{ kind: "ssao", radius?, intensity? }]`. Schema updated; one playtest screenshot guards the look.
7. **POST-color-lut** — `three/addons/postprocessing/LUTPass.js` + a vendored `.cube` loader. `project.json#render.post: [{ kind: "color-lut", file }]`. Schema updated. Material-bench gets one warm-ish LUT to demo.
8. **ADR-S52-shadow-static-caster** — `docs/adr/0009-shadow-caster-dynamic-tag.md` written. Anchors the `ShadowCaster { dynamic }` component + `DynamicShadowSystem` movement-gated takeover; records the S53 audit-trail of the first-version visual regression. Status: Implemented.
9. **ADR-S53-typed-render-pool** — `docs/adr/0010-typed-render-pool.md` written. Anchors `BucketSpec` discriminated union, `PoolHandle` union, `RenderPoolRegistry<Entry>`. Status: Implemented.
10. **ADR-S54-prefab-instantiation** — `docs/adr/0011-prefab-instantiation.md` written. Anchors `expandScenePrefabs`, shallow-merge override semantics, the three `AGF_SCENE_INSTANCE_*` diagnostics, and the "no nested deep merge" rule. Status: Implemented.
11. **ADR-S54-asset-registry-textures** — `docs/adr/0012-asset-registry-texture-resolution.md` written. Anchors the texture-refs-through-AssetRegistry rule and records both the urlFor workaround (S54) and the planned full `get<TextureAsset>()` integration (Story 3 of this sprint). Status: Implemented.
12. **REFLECTION-prefilter** — re-PMREM each `ReflectionProbe` cubemap at a 10 Hz cadence (instead of every frame) so `roughness > 0.1` materials get plausibly blurry dynamic reflections. Material-bench centre sphere keeps its slight roughness; the surrounding spheres in `m5-car-paint` / `m6-glass` actually see blurry environment colour from the probe. Acceptance: visible `roughness > 0.2` test in material-bench reflects the probe colour, not just mip 0.

### Out of scope (Sprint 56)

- Planar mirror (`REFLECTION-planar`) — wait for a water / lobby-floor scene.
- SSR — needs G-buffer rework, parked.
- BPCEM — WebGPU-only today.
- `LightProbeGrid` 3D irradiance volume — heavy bake, indoor-level epic.
- Motion blur / DOF — cinematics-specific, parked.
- `engine docs <projectId>` regen for `docs/generated/<id>/` — agents read the hand-written skill memos; defer until a doc consumer needs it.

## Next Sprint (placeholder)

To be detailed at S56 close. Likely candidates: `REFLECTION-planar` + first water scene, `M16-cache-e` allocation-bench polish, `M17-batched-glb` parity work, `BATCH-BENCH-bvh-stress`.
