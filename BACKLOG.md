# Backlog

Date: 2026-05-16 (Sprint 65 archived)

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

## Current Sprint: Sprint 66 — WebGPU ShaderMaterial audit (unblocking post-passes)

S65 hit a hard wall on WebGPU post-passes — TSL `PostProcessing` rejected the scene with `Material "ShaderMaterial" is not compatible` even after isolating env / probe / shadow. AGF (or three.js internals AGF uses) keeps at least one `ShaderMaterial` in the render frame; until that's identified and ported to node-material, NONE of the post-pass / CSM / PCSS work on WebGPU. S66 is the unblock sprint.

### Stories

1. **WEBGPU-shadermaterial-audit** — instrument the renderer to log every distinct material class participating in each frame's render. Run on the webgpu-spike at minimum scene complexity (no env, no probe, no shadow); the offender(s) here are baseline. Repeat with env=generated → identifies RoomEnvironment's ShaderMaterial; with shadow=on → identifies MeshDepthMaterial; with reflection probe → identifies anything in the probe's render pass. Output: `docs/research/m21-webgpu-shadermaterial-audit.md` listing each ShaderMaterial source + the node-material equivalent + the porting cost. Status: Not yet implemented.
2. **WEBGPU-shadow-depth-material** — if shadow's `MeshDepthMaterial` is on the list (likely), swap to `MeshDepthNodeMaterial` (already exported from `three/webgpu`) on WebGPU mode via `renderer.overrideMaterial` or per-light override. Status: Not yet implemented.
3. **WEBGPU-pmrem-room-env** — if RoomEnvironment internals are on the list, either replace RoomEnvironment with a node-material-friendly equivalent or skip the room-env path entirely on WebGPU (fall back to a flat ambient env). Status: Not yet implemented.
4. **WEBGPU-post-bloom (re-attempt)** — after the audit + ports, retry the bloom path. Status: Not yet implemented.
5. **WEBGPU-spike-bloom** — once bloom renders cleanly, enable it in webgpu-spike for visual verification. Status: Not yet implemented.
6. **DOCS-webgpu-skill-update** — flip post-bloom from "blocked on ShaderMaterial" to "supported". Status: Not yet implemented.

### S65-deferred stories rolling into S67+

`WEBGPU-gpu-timer`, remaining post-passes (ssao / lut / fxaa), `WEBGPU-csm`, `WEBGPU-planar-mirror`, `WEBGPU-pcss`, `WEBGPU-lazy-import`, `MIGRATE-examples-to-webgpu`, `WEBGPU-default-flip`. None can ship cleanly until the ShaderMaterial audit closes — even features unrelated to post-passes may hit similar walls when they integrate.

### Honest scope note

The WebGPU push has consistently been one-story-per-sprint since S63. Continue that pattern. The audit (Story 1) alone is the right deliverable for S66; the ports (Stories 2–5) follow once findings are concrete. Don't bundle.

## Next Sprint (placeholder)

S67 — likely the bloom re-attempt + first post-pass shipping, after S66's audit unblocks the WebGPU post-pipeline path.
