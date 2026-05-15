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

## Current Sprint

_(awaiting Sprint 53 plan — pull a candidate from the list above or open a new direction)_
