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
6. **M3-c-load** — `SceneInput.instances` flow now lands. `engine/runtime/start.ts` calls `expandScenePrefabs` before `World.fromScene` whenever the scene declares instances; expansion diagnostics (`AGF_SCENE_INSTANCE_PREFAB_MISSING` / `_DUPLICATE_ID`) route to the project's diagnostics bus. `src/main.ts` glob-imports `examples/<id>/prefabs/*.prefab.json` per project into a `Map<id, PrefabDefinition>` and passes it through `AppOptions.prefabs`. `engine check` gained a cross-validation pass: scene instance refs must resolve to a real `prefabs/<id>.prefab.json`; same-named instance + entity ids surface as `AGF_SCENE_INSTANCE_DUPLICATE_ID`. The expander now preserves `environment` + other top-level scene fields (previously dropped). Status: Implemented.
7. **M3-c-beacon** — beacon-world now ships `prefabs/beacon.prefab.json` + `prefabs/energy-core.prefab.json`. The four hand-rolled `beacon.west` / `beacon.east` / `core.north` / `core.south` entities collapse into a `scene.instances` block with per-instance `Name` / `Transform` / `Spin` / `Pickup.originalPosition` overrides. Scene JSON dropped from 356 → 300 lines, entity ids preserved so `BeaconLight.beaconId` + diagnostics / tests resolve unchanged. Status: Implemented.
8. **RUNTIME-progressive-loading** — asset manifest gains a `priority: "critical" | "deferred"` field. Critical assets block the first render; deferred ones get a placeholder primitive (box / sphere) and stream in later via `AssetRegistry.get()`. Lets large beacon-world levels boot interactively while the heavy GLBs land in the background.
9. **RUNTIME-idle-rendering** — render-on-demand mode toggled by `project.json#render.idleMode: "always" | "on-demand"`. In on-demand mode, the runtime skips `renderer.render()` when no system reported state changes that frame (no Transform updates, no Material updates, no Light updates). Useful for inspector / menu scenes where the camera is parked and nothing animates.
10. **RUNTIME-gpu-timing** — `ThreeRenderAdapter.draw()` now wraps the per-frame render in a `EXT_disjoint_timer_query_webgl2` `TIME_ELAPSED` query when the extension is available. One outstanding query at a time; results land 1–2 frames behind. `AdapterInfo.gpuMs` exposes the latest ms reading (undefined on Safari / RFP-Firefox / non-WebGL2 contexts). Wired through `ThreeRenderer.info()` → `RuntimeHandle.rendererInfo()` → `AppHandle.rendererInfo()` → `window.__agf.rendererInfo()`. Status: Implemented.
11. **DOCS-asset-pipeline** — short agent-facing doc `docs/agent/asset-pipeline.md` covering the full loop: drop GLB into `_sources/` → run `engine asset import` → run `engine asset optimize` → declare in `runtime/<asset>.material.json` → reference from a `MeshRenderer.mesh` field. Pairs with the existing `build-a-game.md` recipe collection.
12. **DOCTOR-prefab-section** — `engine doctor` gained a `Prefabs:` section: declared count, total scene-instance count across `scenes/**/*.scene.json`, top-3 prefab ids by usage, plus diagnostics for unused declared prefabs + scene refs to unknown prefab ids. Backed by three unit tests under `tests/unit/doctor-prefabs.test.ts`. Status: Implemented.
13. **BENCH-material-bench** *(added mid-sprint)* — new `examples/material-bench/` showcase. Centre chrome sphere + 12 outer spheres on cement cylinder pedestals, all parented to a `Spin`-rotated root; HDR sky (`venice_sunset_1k.hdr`) drives IBL + acts as the (blurred) background; 12 material slots span the standard/physical shader axes (rough plastic, glossy plastic, brushed steel, polished gold, car-paint clearcoat, glass transmission, velvet sheen, iridescent, textured hardwood / brick / ice, copper). Pulled the engine work it surfaced into the same commit: `cylinder` primitive added to the shared list (registry / batcher / check / doctor / scene-extensions); `material-binding-system` now resolves texture refs through `AssetRegistry.urlFor`; `runtime/start.ts` does the same for HDR / cube env URLs; `bumpMap` + `bumpScale` added to the material manifest (height-map path the previous tangent-space normalMap couldn't express); HDR scene environment gained `asBackground` + `backgroundBlurriness`; `project.render.color` gained `transmissionResolutionScale` so the WebGLRenderer transmission pre-pass can run at half-res to claw back perf when transmissive materials are on stage. Friction notes in `docs/research/material-bench-asset-friction.md`. Status: Implemented.

### Out of scope

- `M17-static-merge-spike` — 10k+ static-prop project hasn't materialised yet; stays in Next Sprint candidates.
- `M16-cache-e` — pooled scratch buffers in the LTW cache. Defer until allocation profiling shows it matters.
- `M21-webgpu-spike`, `M21-shadow-soft`, `M21-shadow-glb-acne` — different shadow / backend epics.
- `M20-a..l` netcode — own sprint.
- Move-then-stop beacon shadow perf re-probe — recorded in S53 follow-ups; runs on the user's machine, not in this sprint.

## Next Sprint: Sprint 55 — Agent surface refresh

The engine moved a lot in S52–S54 (typed render pools, BVH-augmented BatchedMesh, ShadowCaster tagging, asset-optimize CLI + texture-doctor, prefab instantiation pipeline, material-bench with HDR-as-background + transmission pre-pass + bumpMap, AssetRegistry-resolved texture refs, `cylinder` primitive, …). The agent-facing docs + slash commands + subagent prompts under `docs/agent/`, `.claude/commands/` and `.claude/agents/` haven't kept up — most were last touched around 2026-05-13 and pre-date the asset pipeline + prefabs + material surfaces shipped this fortnight.

S55 is a single focused pass: bring every agent surface in line with the current engine. No new engine features land here. Verification at sprint close = `engine docs <projectId>` regen + grep sweep of stale identifiers (`createPrimitiveGeometry` enum, deprecated material fields, removed APIs).

12 stories — sized to the **10–15** floor per [[feedback-sprint-size]].

### Stories

1. **DOCS-stale-audit** — single-pass sweep of every `docs/agent/*.md`, `docs/agent/skills/*.md`, `AGENTS.md`, `docs/agent/claude-code.md`, `docs/ARCHITECTURE.md`, `docs/STRUCTURE.md`, `docs/DEVELOPMENT.md`, `docs/QUALITY_AXES.md`, `docs/diagnostics.md`, `docs/GLOSSARY.md`. Output: a single ordered list in this story's verification section — per file, the verdict is `OK` / `update` / `delete` / `merge into <other>` plus the concrete drift (named API, missing diagnostic code, stale command, etc.). All later stories cite this list as their input. Cap each row at one sentence so the audit stays scannable.
2. **DOCS-AGENTS-root** — refresh the three rule-level documents together so they don't drift apart: `AGENTS.md` (root, loaded by every agent), `docs/agent/rules.md`, `docs/agent/review-checklist.md`. Cover the rules added in S52–S54: prefer ECS systems by default (deviation must be documented inline); reuse engine primitives before writing project-local clones (`Spin` over `GroupRotator` lesson); texture refs always go through `AssetRegistry.urlFor`; `Transform.rotation` is degrees; prefab instances merge shallow; primitive set is `box / sphere / cylinder / plane`. Update commit / branch / PR policy if drifted from [[feedback-workflow]].
3. **DOCS-build-a-game** — `docs/agent/build-a-game.md` recipe collection rewrite. New end-to-end walkthrough using material-bench shapes: drop CC0 asset → `engine asset optimize --textures` → material manifest with `bumpMap` + `roughnessMap` → reference from `MeshRenderer.material` (full path, not id). Add a "common mistakes" checklist (raw-string material id without path, custom system when engine has it, transmissive material with `auto: true` batching, HDR without `asBackground`).
4. **DOCS-asset-pipeline** *(carried over from S54)* — `docs/agent/asset-pipeline.md`. Full loop: `_sources/` layout → `engine asset import` → `engine asset optimize <path> [--textures]` → `asset-sources.json` provenance → runtime `<asset>.material.json` / `<mesh>.glb` → `MeshRenderer.mesh` + `MeshRenderer.material`. Document the `_sources/asset-sources.json` schema's `kind` and `source.type` enums (the material-bench friction note flagged that "environment" / "third-party" aren't accepted). Reference `material-bench-asset-friction.md` for the failure modes.
5. **DOCS-scene-authoring-skill** — `docs/agent/skills/scene-authoring.md` refresh. Cover scene `instances` + prefab refs (S54 M3-c-load), `Transform.parent` hierarchy (S30 M16), `environment: { kind: "hdr", asBackground, backgroundBlurriness }` (S54), shadow config + `ShadowCaster { dynamic }` tag (S52), `Spin` for orbit / rotation behaviours (don't author a custom system).
6. **DOCS-system-authoring-skill** — `docs/agent/skills/system-authoring.md` refresh. Lead with **reuse before new** (grep `engine/core/systems/` + `schemas/components/` first); cached `createQuery` handles, not raw `world.query()`; profile-gated registration; project-local vs engine systems boundary; deviation rule for the "prefer ECS" non-negotiable.
7. **DOCS-playtest-debugging-skill** — `docs/agent/skills/playtest-debugging.md` refresh. Document the current `window.__agf` surface in full: `snapshot` / `applyCommands` / `diagnostics` / `clearDiagnostics` / `copyDiagnostics` / `rendererInfo` / `frameTiming` / `pick` / `physics.{setDebugOverlay,raycast}` / `renderer.{invalidateShadowMap,setShadowMapAutoUpdate}` / `dev.tuner.{add,remove,list}` / `save` / `load`. Pair with the dev-bridge endpoints in `engine/dev/` (project-patch, recording, asset-invalidate).
8. **DOCS-engine-check-skill** — `docs/agent/skills/engine-check.md` refresh. Updated diagnostic table: every `AGF_*` code currently emitted by `engine check` / `engine doctor` / runtime. Include `AGF_LOD_*` (S54), `AGF_TEXTURE_HUGE / _NPOT / _NO_TRANSCODER` (S54), `AGF_SCENE_INSTANCE_PREFAB_MISSING / _DUPLICATE_ID` (S54), `AGF_SHADOW_CSM_DIRECTIONAL_CONFLICT` (S47), `AGF_RUNTIME_ASSET_LOAD_FAILED / _NO_LOADER` (S5+).
9. **DOCS-prefab-skill** *(new)* — `docs/agent/skills/prefab-authoring.md`. When to extract a prefab (≥2 entities sharing ≥3 components); `prefabs/<id>.prefab.json` schema; `scene.instances` overrides shallow-merge rules; `AGF_SCENE_INSTANCE_*` diagnostics; the beacon-world M3-c-beacon adoption as worked example.
10. **DOCS-material-skill** *(new)* — `docs/agent/skills/material-authoring.md`. Standard vs Physical shader; clearcoat / transmission / sheen / iridescence ranges; `bumpMap` vs `normalMap` (height-map vs tangent-space) decision; `normalScale` / `bumpScale` typical values; `AssetRegistry.urlFor` texture resolution; common pitfalls (raw string id without path; texture file in repo but not registered in `asset-sources.json`; `transmission > 0` with `batching.auto: true`).
11. **DOCS-claude-code-+-subagents** — `docs/agent/claude-code.md` refresh against current `.claude/commands/*.md` (`adr-new`, `archive-sprint`, `asset-pipeline`, `check-docs`, `implement-story`, `review-agent`, `sample-game`, `start-next`) and current `.claude/agents/*.md` (`asset-pipeline`, `backend-planner`, `engine-architect`, `playtest-runner`, `schema-guardian`). Verify each subagent description still matches its current responsibilities; correct tool lists.
12. **DOCS-iteration-+-debug-protocol** — `docs/agent/iteration-loop.md` + `docs/agent/debug-protocol.md` refresh. Iteration loop covers preflight gates, branch+PR policy, /implement-story → /archive-sprint flow. Debug protocol covers the dev bridge endpoints, recording start/stop, diagnostics bus, `__agf.copyDiagnostics()`, project-patch.

### Out of scope (Sprint 55)

- ADR-level changes (texture-resolution, asBackground, primitive set, transmission scale) — separate ADR audit story, parked in Next Sprint candidates after S55 if needed.
- `docs/generated/<projectId>/` rebuilds — verification step inside DOCS-engine-check-skill, not a story of its own.
- New skills under `.claude/skills/` (none today). Promote a memo only if it's invoked routinely — explicit non-goal for this sprint.
- The `M26` visual fidelity epic — parked low-priority; not pulled forward.
