# Backlog

Date: 2026-05-16 (Sprint 66 archived)

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

## Current Sprint: Sprint 67 — WebGPU ShaderMaterial stack-trace + port

S66 shipped the audit tool + research; the offender is somewhere inside three.js (`StandardNodeLibrary` has no entry for vanilla `ShaderMaterial`; the error originates in `NodeBuilder.js:2985`). Audit on webgpu-spike shows zero ShaderMaterials in our scene traversal, so the offender must be internal three.js code lazily creating one. S67 traces it and ports it.

### Stories

1. **WEBGPU-shadermaterial-stacktrace** — monkey-patch `THREE.ShaderMaterial.prototype.constructor` (via an opt-in adapter flag, e.g. `?debug-shadermaterial=1` URL param) to capture a stack trace at every instantiation. Run webgpu-spike + bloom-enabled config. Output: identified offender + stack pointing at the three.js internal that triggers it. Status: Not yet implemented.
2. **WEBGPU-shadermaterial-port** — port the offender to a node-material equivalent OR replace it with an alternative API that doesn't construct `ShaderMaterial`. Possible flavors depending on what Story 1 reveals:
   - If PMREM equirect pingpong: skip on WebGPU (already done in S62), audit the helper paths.
   - If shadow internal: use `renderer.shadowMap.type = ShadowMaterial` override or set `customDepthMaterial: MeshDepthNodeMaterial` on every shadow caster.
   - If a `Pass`-derived class: skip on WebGPU path (verify removed).
   - If three.js internal lazy helper: file an upstream issue + pin a workaround. Status: Not yet implemented.
3. **WEBGPU-post-bloom (re-attempt)** — retry the S65 bloom code after Story 2 lands. Capability flag `supportsPostProcessing` flips true (for bloom only initially). Status: Not yet implemented.
4. **WEBGPU-spike-bloom** — enable bloom on webgpu-spike for visual verification once Story 3 lands. Status: Not yet implemented.
5. **DOCS-webgpu-skill-update** — flip "post-bloom blocked" → "supported" in the skill memo. Status: Not yet implemented.

### Honest scope note

S66 found the ShaderMaterial offender lives in three.js internals (not AGF code). S67 needs to identify exactly which one via monkey-patch trace. If it turns out to be unfixable from the AGF side (e.g. a three.js bug), the WebGPU post-pipeline path is genuinely blocked until three.js publishes a fix — and we should pin a known-working version OR work around with a custom pass that doesn't use `PostProcessing`.

## Next Sprint (placeholder)

S68 — depends on S67 outcome. If S67 unblocks bloom: ship remaining post-passes (ssao / lut / fxaa) + start CSM / PCSS port. If S67 reveals an upstream block: pivot to non-post-processing work (GPU timer, planar mirror via Reflector audit, migrations of feature-light examples to webgpu).
