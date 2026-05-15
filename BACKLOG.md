# Backlog

Date: 2026-05-16 (Sprint 58 archived)

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

## Current Sprint: Sprint 59 — Visual fidelity v1 (PMREM, planar mirror, bloom, agent-surface tightening)

Follow-up to S58's reflection-probe correctness sprint. Two themes:

1. **Visual fidelity v1** — close the obvious gaps S58 left open: full PMREM prefilter so high-roughness reflective materials read plausibly blurry; vendor `Reflector.js` so we can ship a planar mirror / water surface; add a bloom worked example with HDR-driven sub-pixel sparkles.
2. **Agent-surface tightening** — the live debugging session for S58 made three gaps obvious: GPU timer had no test coverage (would have caught the `QUERY_RESULT_*` typo before it reached the console); `engine doctor` Reflections section misses runtime-spawned probes; vfx skill needs PMREM + Reflector + bloom worked examples once those land.

### Stories

1. **REFLECTION-prefilter** — full GGX PMREM prefilter per probe via `PMREMGenerator.fromCubemap`, gated by an opt-in `prefilter: "pmrem"` field on `ReflectionProbe` (default `"mipmap"` keeps S58's cheap mip-cube). Material-bench centre chrome opted into PMREM at `roughness: 0.35` so the difference is visible. Status: Not yet implemented.
2. **REFLECTION-planar** — vendor `three/addons/objects/Reflector.js`. New `PlanarMirror { resolution, near, far, intensity }` component + adapter API parallel to ReflectionProbe. Doctor section reports planar mirrors alongside probes. Status: Not yet implemented.
3. **WATER-bench** — new `examples/water-bench/` project: HDR sky + a single planar `Reflector` surface + 3 floating geometric props above to show reflection. Scene + project schemas wired; build, engine:check, smoke clean. Status: Not yet implemented.
4. **POST-bloom** — worked example. `project.render.post: [{ kind: "bloom", strength?, radius?, threshold? }]`. Schema enum + `PostPassConfig` extended. Material-bench picks up a modest bloom on the chrome highlights. Status: Not yet implemented.
5. **GPU-timer-test** — unit test against a mock WebGL2 ctx covering the three states (no prior query, prior pending, prior ready) so the `QUERY_RESULT_*` regression and the `endQuery` balance regression can't sneak back. Status: Not yet implemented.
6. **DOCTOR-reflection-runtime** — `engine doctor` Reflections section reads the runtime probe inventory through the dev-bridge `__agf/snapshot` path so bootstrap-spawned probes (material-bench) show up; falls back to scene JSON when the project isn't running. Status: Not yet implemented.
7. **DOCS-vfx-skill-v1** — `docs/agent/skills/vfx-authoring.md` adds PMREM-prefilter worked example, Reflector planar-mirror worked example, bloom worked example. Common pitfalls expands with `prefilter: "pmrem"` cost-per-update, Reflector + transmission render-order, bloom needing an HDR-bright source. Status: Not yet implemented.
8. **DOCS-material-bench-readme** — `examples/material-bench/README.md` covers the v1 surface (3 probes + prefilter / mirror feed, bloom, FPS knobs). Status: Not yet implemented.
9. **PERF-renderer-info** — `__agf.rendererInfo()` now reports `probeCount`, `prefilterMs` (when a PMREM regen ran this frame), `planarMirrorCount`, `bloomMs`. Existing `gpuMs` numbers stay; the WebGL2 query path is now under test. Status: Not yet implemented.
10. **MATERIAL-bench-vfx-v1-adopt** — material-bench picks up PMREM prefilter on the centre chrome (`roughness 0.35` to actually show the diff), one Reflector mirror tile to one side of the ring (visible-from-camera) showing the orbiting ring reflected, modest bloom on the HDR. Performance budget rebaked. Status: Not yet implemented.

### Out of scope (Sprint 59)

- SSR / BPCEM / LightProbeGrid — own epics. SSR especially is parked behind G-buffer work; BPCEM needs WebGPU node-material path.
- Motion blur / DOF — cinematic-specific, parked.
- `M17-batched-glb` — thread AssetRegistry through `updateBatched` so GLB references work inside batched buckets; carries to S60 (a batching / perf-focused sprint).
- `BATCH-BENCH-bvh-stress` — same.
- `M16-cache-e` — pooled scratch buffers in LTW cache; same.

## Next Sprint (placeholder)

To be detailed at S59 close. Likely candidates: `M17-batched-glb`, `BATCH-BENCH-bvh-stress`, `M16-cache-e`, `render-pool-caller-migration`, `M21-shadow-soft` re-eval. A batching / perf-focused sprint following the visual-fidelity track.
