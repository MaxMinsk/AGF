# Backlog

Date: 2026-05-18 (Sprint 70 archived)

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
- **M17-static-merge-spike** — static geometry merge with reverse `EntityId` lookup for picking. Strictly opt-in per-entity (`StaticMerge` tag). Deferred until a 10k+ static-prop project asks.
- **M21-shadow-soft** — re-evaluate `PCFSoftShadowMap` vs `PCFShadowMap` vs `VSMShadowMap` once three.js stabilises soft shadows.
- **M21-shadow-glb-acne** — self-shadow polish on low-poly GLB meshes.
- **M21-webgpu-spike** — async WebGPU renderer adapter behind a profile flag.
- **M16-cache-e** — reusable matrices / pooled scratch buffers inside the LTW cache layer.
- **render-pool-caller-migration** — retire the per-kind adapter pool methods now that `acquirePool` dispatches uniformly.
- **M17-batched-glb** — thread AssetRegistry through `updateBatched` so GLB references work inside batched buckets too.
- **BATCH-BENCH-bvh-stress** — narrow-camera scenario knob for `batch-bench` so the BVH crossover can be measured live.
- **REFLECTION-planar** — `three/addons/objects/Reflector.js` vendored helper for planar mirrors (water, lobby floor).
- **POST-bloom** — worked example for bloom post-pass + tuner.
- **M20-a..l** — netcode rework (carried from Sprint 32). Own sprint.
- **M2b-seed**, **13.13** audio, **10.5+** C# WS transport.

## Current Sprint: Sprint 71 — TBD

S70 cleared the WebGPU carry list and migrated batch-bench. 6 of 9 example projects on WebGPU; remaining three (material-bench, shadows-bench, water-bench) are blocked upstream — no contained WebGPU stories left until either three.js minors lift the BloomNode `ShaderMaterial` issue or someone ports `CSMNode` / `ReflectorNode`. Pivot to a non-WebGPU sprint or pick up the carried S54 asset/runtime stories.

### Candidate sprint shapes (pick at session start)

- **Asset pipeline polish** — pick up the S54 carry list: `ASSET-prefab pipeline`, `DOCTOR-prefab section`, `RUNTIME-progressive-loading`, `DOCS-asset-pipeline`. Contained, agent-shaped, no upstream dependency.
- **Material-bench polish** — push more authored content through `material-bench` so the WebGL path is in a place where the WebGPU migration would be visibly net-positive once upstream unblocks (this front-loads the dogfood story for when post-processing unblocks).
- **Beacon-world gameplay** — back to the dogfood game; whatever the next gameplay slice is.
- **WebGPU CSMNode spike** — multi-sprint port of CSM to TSL. Big lift; only do this if shadows-bench is high-priority and the team is OK with a feature-by-feature WebGPU forward push instead of waiting for upstream.

### Stories

To be picked when S71 starts.

## Next Sprint (placeholder)

S72 — TBD based on what S71 turns out to be.
