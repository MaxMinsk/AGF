# Backlog

Date: 2026-05-15 (Sprint 52 archived)

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

- **M21-shadow-map-size-real-hw** — `m21-shadows-bench-perf.md` measured shadowMapSize 1024 → 512 at only −3.8 % renderMs in headless software-WebGL. Real GPUs care a lot more about shadow-map fill rate + VRAM bandwidth. Re-run `scripts/perf-probe-shadows.mjs --only baseline,512map,2048map` on the user's machine, write the numbers into the same research note. If real-hw savings are large, may justify dropping shadows-bench default to 512 or auto-scaling based on device perf hint. **User-driven** — agent doesn't run this.
- **M17-batch-default-on** — flip `autoBatchPrimitives` (renamed `autoBatch`) on by default once we're confident no project relies on single-Mesh semantics. All 5 example projects already opt in via `project.json#render.batching.auto: true`; this just makes new projects get it for free.
- **RENDER-bucket-key-architecture** — current bucket key is a hand-rolled string `instanced|<mesh>|<shadow>|<group>`. With GLB + manifests + the new BatchedMesh path the routing logic between paths gets messier. Investigate moving to a typed BucketSpec + Map<hash, BucketRecord>, and revisit the dispatch between bucketer and batched-mesh-system under a single abstraction. Pairs with **render-pool-abstraction** — both should land in the same sprint.
- **render-pool-abstraction** — extract a shared `RenderPoolRegistry<Spec, Entry>` helper to replace the ~150 lines triplicated across `acquireBucket` / `acquireBatchedBucket` / `acquireParticlePool` in `three-render-adapter.ts`. Then expose a tagged `PoolHandle` + `acquirePool(spec: BucketSpec)` dispatcher so future systems (LOD-driven pool migration, BVH-augmented variants) can pick the right pool without knowing the underlying allocator. Design memo at `docs/research/render-pool-abstraction-design.md` (carried from Sprint 48 task #34, design shipped in S52, implementation deferred). Pair with RENDER-bucket-key-architecture and M17-bvh-extension since they all touch the same surface.
- **M17-bvh-extension** — add `@three.ez/batched-mesh-extensions` (BVH-augmented BatchedMesh) and re-run `perf-probe-batching.mjs` on shadows-bench. The S51 deepdive showed BatchedMesh loses to InstancedMesh on small scenes because of multi-draw command overhead; BVH culling could collapse the per-instance loop and flip the crossover toward smaller scenes. Own sprint when prioritised.
- **M17-lod-batched** Wire LodSelectionSystem to BatchedMesh's per-instance geometry id so LOD swap doesn't drop the entity out of the bucket.
- **M17-static-merge-spike** Static geometry merge with reverse `EntityId` lookup for picking. Strictly opt-in per-entity (`StaticMerge` tag). Deferred until a 10k+ static-prop project asks (see `docs/research/m17-static-merge-investigation.md`).
- **M21-shadow-soft** Re-evaluate `PCFSoftShadowMap` vs `PCFShadowMap` vs `VSMShadowMap` once three.js stabilises soft shadows.
- **M21-shadow-glb-acne** Self-shadow polish on low-poly GLB meshes; investigate per-material `shadowSide = THREE.BackSide`, scale-aware bias, or polygonOffset overrides.
- **M21-webgpu-spike** Async WebGPU renderer adapter behind a profile flag (`project.json#renderer.backend: "auto" | "webgl" | "webgpu"`).
- **ASSET-optimize-command** `engine asset optimize <project> <asset>` CLI invoking gltf-transform with project presets.
- **ASSET-lod-metadata** LOD schema + `engine check` validation (distances strictly increasing, fallback declared).
- **ASSET-texture-doctor** Doctor warnings: huge uncompressed PNG/JPEG, NPOT mismatches, missing KTX2 transcoder path.
- **M3-c-load** + **M3-c-beacon** Wire `expandScenePrefabs` into scene-load + Beacon adopts prefab instances.
- **M16-cache-e** Reusable matrices / pooled scratch buffers inside the cache layer.
- **RUNTIME-progressive-loading** Asset manifest `priority: "critical" | "deferred"` + placeholder primitive + scene phases.
- **RUNTIME-idle-rendering** Render-on-demand mode for static menus / inspector tools.
- **RUNTIME-gpu-timing** Feature-detected GPU timing queries in dev builds.
- **M20-a..l** Netcode rework (carried from Sprint 32).
- **M2b-seed**, **13.13** audio, **10.5+** C# WS transport.

## Current Sprint: Sprint 53 — renderer refactor (pool + bucket + BVH)

Coherent renderer cleanup sprint. The pool / bucket / batching surface accreted through S34–S52 — three near-identical pool patterns, hand-rolled string bucket keys, and a `path: "batched"` lever that loses on small scenes because of multi-draw command overhead (per `docs/research/m17-batched-vs-instanced-shadows-bench.md`). Now consolidates: shared `RenderPoolRegistry` → typed `BucketSpec` → tagged `PoolHandle` dispatcher → BVH-augmented BatchedMesh path that's expected to flip the crossover for smaller scenes. Picks up four S52 follow-ups (project.json save for the tuner, beacon idle-caster measurement, `M17-batch-default-on`, `M17-lod-batched`) along the way.

13 stories — sized to the **10–15** floor recorded in [[feedback-sprint-size]] (Sprint 52 shipped 9; this one widens by ~25 %).

### Stories

1. **RENDER-pool-registry** — extract `RenderPoolRegistry<Spec, Entry>` per the [render-pool-abstraction design memo](docs/research/render-pool-abstraction-design.md). Replaces the triplicated bookkeeping (`nextHandle++`, live-slot Set, capacity Map, scene attach/detach, dispose) across `acquireBucket` / `acquireBatchedBucket` / `acquireParticlePool`. Net ≥ −100 lines in `three-render-adapter.ts`. No public-API or caller changes at land time; existing tests pass unchanged.
2. **RENDER-bucket-spec-typed** — replace the hand-rolled `instanced|<mesh>|<shadow>|<group>` string bucket keys with a `BucketSpec` discriminated union + a `bucketSpecHash()` helper that AGF/three.js share. Keeps BatchingSystem keying behaviour identical (verified by `tests/unit/batching-system.test.ts`); cleans the dispatch surface for stories 3 + 5 below.
3. **RENDER-pool-handle-union** — tagged `PoolHandle` (`{ kind: "instanced" | "batched" | "batched-bvh" | "particle"; handle: number }`) + `adapter.acquirePool(spec: BucketSpec): PoolHandle` dispatcher. Existing per-kind methods stay for back-compat; new dispatcher demonstrated by at least one call-site migration (BatchingSystem path-select) + a unit test.
4. **M17-batch-default-on** — flip `RuntimeOptions.autoBatchPrimitives` default to `true` so new projects get auto-batch without the explicit `project.json#render.batching.auto: true`. Audit all 5 examples to confirm none rely on single-Mesh semantics. Add a migration note + project-doctor recommendation update so agents inheriting an existing project know the flag is now opt-out.
5. **M17-bvh-extension** — add `@three.ez/batched-mesh-extensions` as a dep (BVH-augmented `BatchedMesh` subclass). New `project.json#render.batching.path: "batched-bvh"` enum value + adapter `acquireBatchedBucket` switch that selects the BVH-extended class. BVH replaces the O(N) per-instance frustum loop with a tree walk; expected to flip the `instanced`-vs-`batched` crossover toward smaller scenes.
6. **M17-batch-perf-rerun** — re-run `scripts/perf-probe-batching.mjs` with three scenarios (`instanced` baseline, `batched`, `batched-bvh`) on shadows-bench + batch-bench. Append findings to `docs/research/m17-batched-vs-instanced-shadows-bench.md`. Acceptance: `batched-bvh` matches or beats `instanced` on shadows-bench; `batch-bench` (400 cubes, mostly in view) shows the relative scaling.
7. **M17-lod-batched** — wire `LodSelectionSystem` to `BatchedMesh.setGeometryIdAt` so LOD swap stays within the bucket instead of dropping the entity to the single-Mesh path. Pairs with the new `BucketSpec` machinery from story 2. Acceptance: a hello-3d-derived `lod-bench` (or batch-bench-lod variant) shows an entity's LOD switch flipping geometryId without losing the bucket handle.
8. **DEVBRIDGE-project-patch** — new `POST /__agf/project-patch` endpoint, DEV-only (gated like the existing `__agf` surface; absent from production). Body: `{ jsonPointer, value }` or a small JSON-merge-patch. Writes back to `project.json` on disk via the Vite middleware. Diagnostics emit on success/failure. Schema-validates against `schemas/project.schema.json` before writing.
9. **shadow-tuner-project-save** — adopt the new endpoint in `examples/shadows-bench/src/ui/shadow-tuner.ts`. "Save to project.json" button POSTs the current `FieldState`. localStorage stays as session fallback when the endpoint is unavailable (e.g., a built preview). Closes the S52 deferred follow-up.
10. **BEACON-shadow-caster-tag** — tag the beacon-world drone (`Player`) entity as `ShadowCaster { dynamic: true }` in bootstrap. Run `perf-probe-shadows.mjs` against beacon-world (probe needs minor changes to point at a different project). Expectation: ≥ 25 % renderMs drop (the S52 deepdive's "idle-caster scene" hypothesis). Append findings to `docs/research/m21-shadows-bench-perf.md`.
11. **DOCTOR-renderer-pool-section** — extend `engine doctor` Shadows section + add an adjacent `Renderer pools:` section reporting bucket counts per path (instanced / batched / batched-bvh / particle), entity-pool fit, and detected typed-vs-string key migration state. Pairs with stories 1–3.
12. **RENDER-pool-test-coverage** — unit tests for `bucketSpecHash()` (stable + ordering-insensitive within tag set), `acquirePool` dispatch (each `spec.kind` routes correctly), and the BVH path adapter contract (frustum cull skips off-screen instances via the stub adapter pattern from `batching-system-batched-path.test.ts`).
13. **RENDER-bucket-key-architecture-finalize** — retire the legacy string bucket keys in `BatchingSystem` once stories 2 + 3 land. Map<string, BucketRecord> → Map<BucketSpecHash, BucketRecord>. Confirms no caller is still constructing the old key shape. Closes `RENDER-bucket-key-architecture`.

### Out of scope

- `M21-shadow-soft`, `M21-shadow-glb-acne` — different shadow epic; not gated by the refactor.
- `M21-webgpu-spike` — needs its own sprint (separate adapter backend).
- `M21-shadow-map-size-real-hw` — user-driven probe, stays in Next Sprint candidates.
- Asset pipeline polish (`ASSET-*`), `M3-c-load/beacon` prefabs, M20 netcode — separate sprints when prioritised.
