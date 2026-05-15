# Backlog

Date: 2026-05-15 (Sprint 53 archived)

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
- **M20-a..l** — netcode rework (carried from Sprint 32). Own sprint.
- **M2b-seed**, **13.13** audio, **10.5+** C# WS transport.

## Current Sprint: Sprint 54 — asset pipeline + prefabs + runtime loading

Production-content sprint. The renderer is in great shape after S53 (typed pool surface, BVH-augmented BatchedMesh, doctor pool-section, tuner project.json save). Next layer that's been gathering dust: the **asset pipeline** (M25 — texture compression, gltf-transform optimize, doctor warnings) and **prefab instantiation** (M3-c — `expandScenePrefabs` exists in code but isn't wired into scene-load yet, beacon-world hand-rolls beacons + cores instead of templating them). This sprint fills that gap, plus three runtime-side loading-experience stories (progressive loading priorities, render-on-demand for idle scenes, GPU timing in dev builds).

12 stories — sized to the **10–15** floor per [[feedback-sprint-size]].

### Stories

1. **ASSET-optimize-command** — `engine asset optimize <projectDir> <assetPath>` CLI invoking `@gltf-transform/functions` with the project's preset (dedup → prune → weld → meshopt). Writes a sibling `<asset>.opt.glb` + prints before/after byte counts. Pairs with the existing `ASSET-decoder-paths` work from S40 (decoders are already vendored; this just wires the optimize pass behind a CLI).
2. **ASSET-lod-metadata** — LOD JSON schema (`schemas/lod.schema.json`) covering `levels: [{ maxDistance, mesh, material?, color? }]` + `fallback: "last" | "hide"`. `engine check` validates: distances strictly ascending, `mesh` ref points at a real asset, no duplicate distances. Diagnostic codes `AGF_LOD_DISTANCES_OUT_OF_ORDER` / `AGF_LOD_MESH_MISSING`.
3. **ASSET-texture-doctor** — new doctor warnings: uncompressed PNG/JPEG > 1 MB → `WARN AGF_TEXTURE_HUGE`; non-power-of-two dimensions on a texture used as a material map → `WARN AGF_TEXTURE_NPOT`; KTX2 transcoder path missing when a `.ktx2` ref exists → `ERR AGF_TEXTURE_NO_TRANSCODER`. Surfaces in the existing doctor output between Material sharing and Renderer pools.
4. **ASSET-texture-compress** — extend `engine asset optimize` with a `--textures` flag that runs basisu / ktx2 compression on every texture referenced by the project's material manifests. Writes `<texture>.ktx2` alongside the originals; updates material manifests to point at the compressed versions when the flag is on. Skips already-compressed files. Pairs with `ASSET-decoder-vendor` below.
5. **ASSET-decoder-vendor** — verify the Draco / Basis decoder paths in `engine/render/asset-decoders/decoders.ts` resolve correctly in production builds. Add an e2e smoke that loads a `.ktx2` texture from beacon-world without falling back to JSON-only material, captures the texture URL in `__agf.diagnostics()` to confirm the transcoder fired.
6. **M3-c-load** — wire `expandScenePrefabs` into the scene-load command (`engine/runtime/scene-loader.ts`). When a scene file declares `prefabs: { "<id>": { ...component-bag } }`, instantiate each prefab as an entity with the right components + child links. `engine check` validates `Prefab` refs point at declared prefab ids.
7. **M3-c-beacon** — beacon-world adopts a `beacon` prefab and a `core` prefab. The 4 hand-rolled `beacon.*` + `core.*` entities in `examples/beacon-world/scenes/start.scene.json` collapse into `Prefab` instances + per-entity overrides (position, group). Confirms the prefab roundtrip actually shrinks scene JSON and stays semantically identical.
8. **RUNTIME-progressive-loading** — asset manifest gains a `priority: "critical" | "deferred"` field. Critical assets block the first render; deferred ones get a placeholder primitive (box / sphere) and stream in later via `AssetRegistry.get()`. Lets large beacon-world levels boot interactively while the heavy GLBs land in the background.
9. **RUNTIME-idle-rendering** — render-on-demand mode toggled by `project.json#render.idleMode: "always" | "on-demand"`. In on-demand mode, the runtime skips `renderer.render()` when no system reported state changes that frame (no Transform updates, no Material updates, no Light updates). Useful for inspector / menu scenes where the camera is parked and nothing animates.
10. **RUNTIME-gpu-timing** — feature-detected `EXT_disjoint_timer_query_webgl2` GPU timing queries in dev builds. Adds `__agf.rendererInfo().gpuMs` (or marks it `undefined` when the extension isn't there). Lets agents measure actual GPU frame time instead of CPU dispatch time.
11. **DOCS-asset-pipeline** — short agent-facing doc `docs/agent/asset-pipeline.md` covering the full loop: drop GLB into `_sources/` → run `engine asset import` → run `engine asset optimize` → declare in `runtime/<asset>.material.json` → reference from a `MeshRenderer.mesh` field. Pairs with the existing `build-a-game.md` recipe collection.
12. **DOCTOR-prefab-section** — `engine doctor` gains a `Prefabs:` section reporting declared prefab count, total entities expanded from prefabs across all scenes, and the top-3 most-used prefab ids. Helps agents reason about whether a scene's complexity comes from inline entities or from prefab instantiation.
13. **BENCH-material-bench** *(added mid-sprint)* — new `examples/material-bench/` showcase. Centre chrome sphere + 12 outer spheres on cement cylinder pedestals, all parented to a `Spin`-rotated root; HDR sky (`venice_sunset_1k.hdr`) drives IBL + acts as the (blurred) background; 12 material slots span the standard/physical shader axes (rough plastic, glossy plastic, brushed steel, polished gold, car-paint clearcoat, glass transmission, velvet sheen, iridescent, textured hardwood / brick / ice, copper). Pulled the engine work it surfaced into the same commit: `cylinder` primitive added to the shared list (registry / batcher / check / doctor / scene-extensions); `material-binding-system` now resolves texture refs through `AssetRegistry.urlFor`; `runtime/start.ts` does the same for HDR / cube env URLs; `bumpMap` + `bumpScale` added to the material manifest (height-map path the previous tangent-space normalMap couldn't express); HDR scene environment gained `asBackground` + `backgroundBlurriness`; `project.render.color` gained `transmissionResolutionScale` so the WebGLRenderer transmission pre-pass can run at half-res to claw back perf when transmissive materials are on stage. Friction notes in `docs/research/material-bench-asset-friction.md`. Status: Implemented.

### Out of scope

- `M17-static-merge-spike` — 10k+ static-prop project hasn't materialised yet; stays in Next Sprint candidates.
- `M16-cache-e` — pooled scratch buffers in the LTW cache. Defer until allocation profiling shows it matters.
- `M21-webgpu-spike`, `M21-shadow-soft`, `M21-shadow-glb-acne` — different shadow / backend epics.
- `M20-a..l` netcode — own sprint.
- Move-then-stop beacon shadow perf re-probe — recorded in S53 follow-ups; runs on the user's machine, not in this sprint.
