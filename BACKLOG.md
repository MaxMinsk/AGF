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

## Current Sprint: Sprint 57 — Visual-fidelity v0 + texture registry integration

Carry-over of the six S56 stories that needed live browser eyeball-tests, plus one ADR follow-up (`ADR-0012` notes the workaround → integration transition once Story 1 lands). Sized to match the **10–15** floor.

### Stories

1. **ASSET-textures-via-registry** — texture refs go through `AssetRegistry.get<Texture>()`. New `engine/render/texture-loader.ts` `createTextureLoader()` registered alongside the existing material / glb loaders in `src/app.ts`. `MaterialPatch.{map,normalMap,bumpMap,roughnessMap,metalnessMap,emissiveMap,aoMap}` types changed from URL strings to pre-loaded `Texture` instances. Adapter retires the local `textureCache` + `acquireTexture` path; colorSpace re-tagged at bind time. 404s now emit `AGF_RUNTIME_ASSET_LOAD_FAILED` through the registry's standard path; `__agf.reloadAsset(ref)` invalidates one texture entry without remounting the whole material. Status: Implemented.
2. **GROUND-skybox** — `three/addons/objects/GroundedSkybox.js` vendored. New scene env field `environment.groundedSkybox: { height, radius }`. When set, the renderer mounts a GroundedSkybox mesh in place of (or alongside) the regular `scene.background`. Material-bench adopts it so the HDR meets the cement plinth instead of dropping straight to the horizon.
3. **REFLECTION-cube-probe** — new `engine/core/components/reflection-probe.ts` + `engine/runtime/components/envmap-binding.ts` schemas. New `ReflectionProbeSystem` runs before the main render: hides excluded entities, calls `cubeCam.update(renderer, scene)`, restores. `MaterialBindingSystem` reads `EnvmapBinding` and sets `material.envMap = probeRT.texture`. Material-bench centre chrome sphere adopts a 256² probe @ 60 Hz so it visibly reflects the orbiting outer ring.
4. **POST-ssao** — `three/addons/postprocessing/SSAOPass.js` vendored. Wired into the existing composer via `project.json#render.post: [{ kind: "ssao", radius?, intensity? }]`. Schema updated; one playtest screenshot guards the look.
5. **POST-color-lut** — `three/addons/postprocessing/LUTPass.js` + a vendored `.cube` loader. `project.json#render.post: [{ kind: "color-lut", file }]`. Schema updated. Material-bench gets one warm-ish LUT to demo.
6. **REFLECTION-prefilter** — re-PMREM each `ReflectionProbe` cubemap at 10 Hz (not every frame) so `roughness > 0.1` materials get plausibly blurry dynamic reflections. Material-bench centre sphere keeps its slight roughness; the surrounding spheres in `m5-car-paint` / `m6-glass` actually see blurry environment colour. Visible `roughness > 0.2` test reflects probe colour, not just mip 0.
7. **ADR-0012-update** — once Story 1 lands, amend ADR-0012 to record that the full `AssetRegistry.get<TextureAsset>()` integration shipped. The rule stays unchanged.
8. **PERFTEST-material-bench-budget** — `examples/material-bench/performance-budget.json` is currently soft (textures=24 / hard=40); after Story 3 lands the texture count should drop because the registry can dedupe shared textures. Rebake the budget and add a regression note.
9. **POST-composer-schema** — extend `schemas/project.schema.json#render.post` to cover the new `ssao` + `color-lut` kinds (today it only lists `bloom` + `fxaa`). Engine check rejects misspelled kinds.
10. **DOCS-vfx-skill** — new `docs/agent/skills/vfx-authoring.md`. When to add a reflection probe; SSAO + colour-grading + grounded-skybox usage; perf-budget guidance ("transmissive material + reflection probe + SSAO = full opaque-pre-pass twice — keep transmissionResolutionScale ≤ 0.5"); pitfalls ("probe sees itself if the owner isn't in `excludeEntities`").
11. **MATERIAL-bench-vfx-adopt** — material-bench scene + project.json updated to enable GroundedSkybox + a reflection probe at the centre + SSAO + a subtle warm LUT. Acts as the worked-example screenshot for the new skill memo. 120 FPS budget preserved on a desktop GPU.
12. **DOCTOR-reflection-section** — `engine doctor` reports declared reflection-probe count + per-probe cadence (Hz) + estimated cost in extra renders/frame. Warns when a probe's `excludeEntities` is empty (likely-self-reflection bug).

### Out of scope (Sprint 57)

- Planar mirror (`REFLECTION-planar`) — wait for water / lobby scene.
- SSR / BPCEM / LightProbeGrid — own epics, blocked on G-buffer / WebGPU / scene-bake infrastructure.
- Motion blur / DOF — cinematic-specific, parked.
- `engine docs <projectId>` regen for `docs/generated/<id>/` — agents read hand-written skill memos; defer until a doc consumer needs the regen.

## Next Sprint (placeholder)

To be detailed at S57 close. Likely candidates: `REFLECTION-planar` + first water scene, `M17-batched-glb`, `BATCH-BENCH-bvh-stress`, `M16-cache-e`, render-pool-caller-migration.
