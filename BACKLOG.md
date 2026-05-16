# Backlog

Date: 2026-05-16 (Sprint 59 archived)

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

## Current Sprint: Sprint 60 — Perf + cleanup follow-ups (batching, pools, doctor-runtime)

Follow-up after two back-to-back visual-fidelity sprints (S58 + S59). Three themes:

1. **Perf cleanups long parked** — `M17-batched-glb` (thread AssetRegistry through `updateBatched`), `BATCH-BENCH-bvh-stress` (narrow-camera knob), `M16-cache-e` (pooled scratch buffers in LTW cache), `render-pool-caller-migration` (retire the per-kind adapter pool methods now that `acquirePool` dispatches uniformly).
2. **Doctor → runtime bridge** — `DOCTOR-reflection-runtime` (carried from S59): teach `engine doctor` to read live probe inventory from a running dev server when one is available, fall back to static scene-JSON scan otherwise. Also adds a Reflections+Mirrors runtime section to `__agf.rendererInfo()` summaries.
3. **Skill / docs catch-up** — write a `perf-tuning.md` skill memo that consolidates the FPS-knob references scattered across material-bench README, vfx-authoring, batching docs, and shadows-bench. Re-evaluate `M21-shadow-soft` (PCFSoft vs VSM vs PCF) on the current three.js version and write up the result.

### Stories

1. **DOCTOR-reflection-runtime** — `engine doctor` checks for a running `localhost:5173/__agf/renderer-info` endpoint; if present, supplements the scene-JSON probe list with the runtime inventory (handle, position, prefilter mode, prefilter ms). Fall-through to static when offline. Status: Not yet implemented.
2. **RENDERER-info-runtime-probes** — extend `engine/render/three-render-adapter.ts#info()` with `probeDetails: Array<{ handle, position, prefilter, ms }>` so dev-bridge clients see per-probe data, not just counts. Status: Not yet implemented.
3. **M17-batched-glb** — thread `AssetRegistry` through `BatchingSystem.updateBatched()` so GLB-mesh-keyed buckets resolve their geometry the same way M17 InstancedMesh buckets do. Unit test under `tests/unit/batching-system-batched-path.test.ts`. Status: Not yet implemented.
4. **BATCH-BENCH-bvh-stress** — add a narrow-camera knob (`?camera=narrow|wide`) to `examples/batch-bench/` so the BVH-vs-frustum-cull crossover can be measured live. Update `scripts/perf-probe-batching.mjs` accordingly. Status: Not yet implemented.
5. **M16-cache-e** — pool a small ring of `Matrix4` + `Vector3` + `Quaternion` scratch instances inside `transform-resolve-cached.ts`; profile against the current per-entity allocs (probably 5–10 % win at 1k+ entities). Status: Not yet implemented.
6. **render-pool-caller-migration** — retire the per-kind methods (`acquireInstancedBucket`, `acquireBatchedBucket`, `acquireParticleBucket`) in favour of the unified `acquirePool` dispatcher landed in S52. Update `BatchingSystem`, `ParticleEmitterSystem`, `MeshLifecycleSystem` callers; remove the dead methods. Status: Not yet implemented.
7. **M21-shadow-soft-reeval** — research-only story. Run shadows-bench with `BasicShadowMap` / `PCFShadowMap` / `PCFSoftShadowMap` / `VSMShadowMap` on the dev machine; capture screenshots + `gpuMs` for each. Write up findings under `docs/research/m21-shadow-soft-reeval.md`; pick a default per project profile if any clear winner emerges. Status: Not yet implemented.
8. **DOCS-perf-tuning-skill** — new `docs/agent/skills/perf-tuning.md` consolidating the FPS-knob references scattered across material-bench README, shadows-bench README, vfx-authoring, batching docs. Status: Not yet implemented.
9. **DOCS-water-bench-readme** — `examples/water-bench/README.md` mirroring the material-bench README shape (what it shows, FPS knobs, what to look at). Status: Not yet implemented.
10. **GPU-timer-test-extend** — additional cases for the GPU-timer state machine: createQuery returning null mid-stream, ext disappearing mid-frame (context loss), getQueryParameter throwing. Belt-and-suspenders since S59 only covered the happy paths + S58 regressions. Status: Not yet implemented.

### Out of scope (Sprint 60)

- SSR / BPCEM / LightProbeGrid — own epics. Same as S59 out-of-scope.
- M17-static-merge-spike — opt-in static merge with reverse EntityId lookup for picking. Deferred until a 10k+ static-prop project asks.
- M21-webgpu-spike — own sprint behind a profile flag.
- M20-* netcode rework — own sprint.

## Next Sprint (placeholder)

To be detailed at S60 close. Likely candidates: `M17-static-merge-spike`, `M20-*` netcode, `M21-webgpu-spike` if shadows-bench eval reveals a WebGL ceiling, beacon-world gameplay loop primitives.
