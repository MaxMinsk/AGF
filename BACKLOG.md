# Backlog

Date: 2026-05-18 (Sprint 72 archived)

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
- **M16-cache-e** — reusable matrices / pooled scratch buffers inside the LTW cache layer.
- **render-pool-caller-migration** — retire the per-kind adapter pool methods now that `acquirePool` dispatches uniformly.
- **M17-batched-glb** — thread AssetRegistry through `updateBatched` so GLB references work inside batched buckets too.
- **BATCH-BENCH-bvh-stress** — narrow-camera scenario knob for `batch-bench` so the BVH crossover can be measured live.
- **POST-bloom** — worked example for bloom post-pass + tuner (gated on upstream three.js BloomNode ShaderMaterial fix).
- **WEBGPU-csm-port** — TSL `CSMNode` port for shadows-bench. Multi-sprint spike; the last project still on WebGL.
- **WEBGPU-reflection-tint** — wire the WebGL `Reflector.color` / `acquireReflectionProbe.color` parameters into the WebGPU TSL paths (`mix(reflector, color, factor)` colorNode + light tint on probe envmaps).
- **M20-a..l** — netcode rework (carried from Sprint 32). Own sprint.
- **M2b-seed**, **13.13** audio, **10.5+** C# WS transport.

## Current Sprint: Sprint 73 — TBD (polish / docs / carry list)

8 of 9 example projects are on WebGPU after S71 (material-bench) and S72 (water-bench). Only **shadows-bench** remains — its three blockers (CSM, PCSS, FXAA) all need real TSL ports or wait for an upstream three.js fix; none of them are contained inside a single sprint.

After two heavy WebGPU sprints back-to-back the next session is a polish / docs / carry-list pass. Candidate shapes:

- **WebGPU docs refresh** — sync `docs/agent/skills/webgpu-rendering.md` with the actual 8/9 state, document the per-feature WebGPU surface (`supportsPlanarMirror: true`, GPU timer, lazy import, PMREM-per-purpose split, no-visibility-toggle probe bake), and refresh the comparison page at `tests/manual/webgpu-vs-webgl/` so it boots both modes cleanly under the new code paths.
- **engine doctor — WebGPU readiness** — refresh the doctor's `WebGPU readiness:` block per project so it reflects 8/9 (only shadows-bench still flagged), and surface the specific blocking features (CSM / PCSS / FXAA) per remaining project.
- **Asset pipeline polish** — pick up the S54 carry list: `ASSET-prefab pipeline`, `DOCTOR-prefab section`, `RUNTIME-progressive-loading`, `DOCS-asset-pipeline`. Contained, agent-shaped, no upstream dependency.
- **WEBGPU-reflection-tint** — small follow-up: wire the `color` parameter through to the WebGPU TSL planar mirror + cube probe paths via `mix(reflector, color, factor)` colorNode. Single-session.

### Stories

To be picked when S73 starts.

## Next Sprint (placeholder)

S74 — likely the WEBGPU-csm spike if shadows-bench becomes priority, OR the next gameplay slice for beacon-world. Decide after the S73 polish pass.
