# Backlog

Date: 2026-05-15 (Sprint 56 archived)

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

## Current Sprint: Sprint 58 — Multi-probe reflection + GroundedSkybox shipping bugfixes

Follow-up sprint to S57. Three groups of work:

1. **GroundedSkybox shipping fixes** the user caught live in material-bench: the helper crashed silently on `height <= 0` (swallowed inside RGBELoader.onload, so sky + shadow-catcher never mounted), the constructor's `height` was being misused as world-Y instead of HDR projection factor, the PMREM cubemap was fed instead of the raw equirect, and the catcher z-fought the sky's flat-bottom disc.
2. **Reflection-probe correctness + multi-probe layout.** Initial cube cam was added to the scene graph (wrong — three.js `update()` skips `updateMatrixWorld()` when `parent !== null`), so the captured cubemap trailed our set-transform call by one frame; visually all probes looked like the centre. Fix: don't add to scene + explicit `updateMatrixWorld(true)`. Then expand from 1 probe → 7 (centre + 6 mid-ring) → 3 (centre + front + back) per user feedback. Cube RT now ships with `generateMipmaps: true, minFilter: LinearMipmapLinearFilter` so `roughness > 0` materials get box-filtered blur (close-enough stand-in for PMREM until the proper prefilter lands).
3. **ADR + skill memo** anchoring the reflection-probe + envmap-binding contract.

### Stories

1. **REFLECTION-cube-cam-world-matrix** — `ReflectionProbeSystem` no longer adds its `CubeCamera`s to the scene graph (parent === null lets three.js auto-refresh world matrix in update); added explicit `cubeCam.updateMatrixWorld(true)` in `updateReflectionProbe` so any future re-parent doesn't silently break. Status: Implemented.
2. **GROUNDED-skybox-shipping-fixes** — `three/addons/objects/GroundedSkybox.js` now passes a positive projection factor `radius/6` (per three.js docs); mesh externally positioned at `projectionHeight + spec.height`. Raw RGBE equirect is reused for both `scene.background` and the GroundedSkybox helper (was PMREM cubemap before — soft / distorted). Shadow-catcher lifted 10mm above sky's bottom disc, `renderOrder = 1`, opacity 0.6 to match the per-mesh shadow weight. Status: Implemented.
3. **REFLECTION-cube-mipmaps** — `WebGLCubeRenderTarget` constructed with `generateMipmaps: true, minFilter: LinearMipmapLinearFilter` so `MeshStandardMaterial.envMap` sampling at `roughness > 0` reads from a box-filtered mip chain (not full PMREM GGX prefilter — that's still parked as `REFLECTION-prefilter` — but visually close enough for moderate roughness ≤ 0.3). Status: Implemented.
4. **MATERIAL-bench-multi-probe** — material-bench now ships three reflection probes: `sphere.centre` (chrome ball's own probe, 128² @ 30 Hz), `probe.front` at (0, 1, +5), `probe.back` at (0, 1, −5). Outer-ring spheres bind by initial angle: `sin(angle) >= 0 → probe.front`, else `probe.back`. Visible reflection diff between sphere halves even as the ring spins. Bootstrap and probe sizes / cadence tuned for FPS. Status: Implemented.
5. **MATERIAL-bench-stonehenge** — 12 stone-textured cylindrical columns at radius 11; new `stone.material.json` reuses brick `bumpMap` + `roughnessMap` over a grey base colour. Shadow camera frustum widened to ±14 / far 40 so the columns actually cast. Status: Implemented.
6. **REFLECTION-cube-cam-shadow-opacity-tune** — material-bench tuning loop with the user: shadow-catcher opacity 1.0 → 0.6, chrome roughness sweep 0.18 → 0.02 (proved probe correctness) → 0.12 → 0.22 (proved mip-cube blur works). Status: Implemented.
7. **ADR-0013-reflection-probe-system** — new `docs/adr/0013-reflection-probe-system.md` anchors the CubeCamera-per-entity design, the not-in-scene-graph fix, the mipmap-cube-RT decision (vs PMREM), and the multi-probe layout used in material-bench. Status: Implemented.
8. **DOCS-vfx-skill-update** — `docs/agent/skills/vfx-authoring.md` pitfalls section gains: `groundedSkybox.height <= 0`, PMREM-vs-equirect for the helper, CubeCamera world-matrix gotcha, roughness > 0 mip-cube vs PMREM. Status: Implemented.
9. **GPU-timer-webgl-errors** — two console errors found live: `INVALID_ENUM: getQueryParameter` (`ext.QUERY_RESULT_AVAILABLE` / `ext.QUERY_RESULT` are `undefined` — those are core WebGL2 constants, not on the disjoint-timer extension object) and `INVALID_OPERATION: endQuery: target query is not active` (when a prior frame's query is still in-flight, `beginGpuTimer` early-returned without starting a new one but `gpuTimerPending` stayed set, so `endGpuTimer` closed nothing). Fix: read availability/result off `gl.QUERY_RESULT_AVAILABLE` / `gl.QUERY_RESULT`, track `gpuTimerActive` to gate `endQuery`. Status: Implemented.

### Out of scope (Sprint 58)

- `REFLECTION-prefilter` — full GGX PMREM filter per probe at 10 Hz. Mip-cube is a workable v0 for ≤ 0.3 roughness; PMREM lands when a high-roughness reflective material asks for it.
- All other VFX epics from `M26` — Reflector (planar mirror), SSR, BPCEM, LightProbeGrid, motion blur, DOF.

## Next Sprint (placeholder)

To be detailed at S58 close. Likely candidates: `REFLECTION-prefilter`, `REFLECTION-planar` + first water scene, `M17-batched-glb`, `BATCH-BENCH-bvh-stress`, `M16-cache-e`, render-pool-caller-migration.
