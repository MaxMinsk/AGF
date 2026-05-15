# Backlog

Date: 2026-05-15 (Sprint 54 archived)

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
- **M17-static-merge-spike** — static geometry merge with reverse `EntityId` lookup for picking. Strictly opt-in per-entity (`StaticMerge` tag). Deferred until a 10k+ static-prop project asks (see `docs/research/m17-static-merge-investigation.md`).
- **M21-shadow-soft** — re-evaluate `PCFSoftShadowMap` vs `PCFShadowMap` vs `VSMShadowMap` once three.js stabilises soft shadows.
- **M21-shadow-glb-acne** — self-shadow polish on low-poly GLB meshes; investigate per-material `shadowSide = THREE.BackSide`, scale-aware bias, or polygonOffset overrides.
- **M21-webgpu-spike** — async WebGPU renderer adapter behind a profile flag (`project.json#renderer.backend: "auto" | "webgl" | "webgpu"`).
- **M16-cache-e** — reusable matrices / pooled scratch buffers inside the LTW cache layer. Defer until allocation profiling shows it matters.
- **render-pool-caller-migration** — S53 shipped the typed pool dispatcher + `PoolHandle` union but most call sites still use the per-kind acquire / release methods. A future sprint can migrate the call sites + retire the per-kind methods if the migration delivers measurable maintenance savings.
- **M17-batched-glb** — `updateBatched` falls back to placeholder geometry when the mesh ref isn't a primitive. Thread the AssetRegistry through so GLB references work inside batched buckets too (same way the instanced path does today).
- **BATCH-BENCH-bvh-stress** — `examples/batch-bench` is currently 400 in-view cubes (the case where `batched-bvh` doesn't win). Add a scenario knob that frames a narrow camera around a subset, so the BVH crossover can be measured live.
- **MeshRenderer-material-path-validator** — `engine check` should reject any `MeshRenderer.material` value that doesn't resolve to a real `runtime/.../*.material.json` under `assetRoot`. Surfaced as friction in S54's `material-bench-asset-friction.md`.
- **PRIMITIVE-set-single-source** — the `box / sphere / cylinder / plane` list lives in 5 places (registry / batcher / project-check / project-doctor / scene-extensions schema). Export one constant; codegen the schema enum.
- **ASSET-textures-via-registry** — move material-manifest texture refs onto `AssetRegistry.get<TextureAsset>()` so 404s emit `AGF_RUNTIME_ASSET_LOAD_FAILED` and HMR can invalidate one texture without remounting the whole material. Workaround landed in S54 (`assetRegistry.urlFor` resolution).
- **M26** visual-fidelity polish — see `HIGH_LEVEL_BACKLOG.md`. Low priority; pull only after `M3` runtime work completes.
- **M20-a..l** — netcode rework (carried from Sprint 32). Own sprint.
- **M2b-seed**, **13.13** audio, **10.5+** C# WS transport.

## Current Sprint: Sprint 55 — Agent surface refresh

The engine moved a lot in S52–S54 (typed render pools, BVH-augmented BatchedMesh, ShadowCaster tagging, asset-optimize CLI + texture-doctor, prefab instantiation pipeline, material-bench with HDR-as-background + transmission pre-pass + bumpMap, AssetRegistry-resolved texture refs, `cylinder` primitive, …). The agent-facing docs + slash commands + subagent prompts under `docs/agent/`, `.claude/commands/` and `.claude/agents/` haven't kept up — most were last touched around 2026-05-13 and pre-date the asset pipeline + prefabs + material surfaces shipped this fortnight.

S55 is a single focused pass: bring every agent surface in line with the current engine. No new engine features land here. Verification at sprint close = `engine docs <projectId>` regen + grep sweep of stale identifiers (`createPrimitiveGeometry` enum, deprecated material fields, removed APIs).

12 stories — sized to the **10–15** floor per [[feedback-sprint-size]].

### Stories

1. **DOCS-stale-audit** — single-pass sweep of every `docs/agent/*.md`, `docs/agent/skills/*.md`, `AGENTS.md`, `docs/agent/claude-code.md`, `docs/ARCHITECTURE.md`, `docs/STRUCTURE.md`, `docs/DEVELOPMENT.md`, `docs/QUALITY_AXES.md`, `docs/diagnostics.md`, `docs/GLOSSARY.md`. Output: a single ordered list in this story's verification section — per file, the verdict is `OK` / `update` / `delete` / `merge into <other>` plus the concrete drift (named API, missing diagnostic code, stale command, etc.). All later stories cite this list as their input. Cap each row at one sentence so the audit stays scannable.
2. **DOCS-AGENTS-root** — refresh the three rule-level documents together so they don't drift apart: `AGENTS.md` (root, loaded by every agent), `docs/agent/rules.md`, `docs/agent/review-checklist.md`. Cover the rules added in S52–S54: prefer ECS systems by default (deviation must be documented inline); reuse engine primitives before writing project-local clones (`Spin` over `GroupRotator` lesson); texture refs always go through `AssetRegistry.urlFor`; `Transform.rotation` is degrees; prefab instances merge shallow; primitive set is `box / sphere / cylinder / plane`. Update commit / branch / PR policy if drifted from [[feedback-workflow]].
3. **DOCS-build-a-game** — `docs/agent/build-a-game.md` recipe collection rewrite. New end-to-end walkthrough using material-bench shapes: drop CC0 asset → `engine asset optimize --textures` → material manifest with `bumpMap` + `roughnessMap` → reference from `MeshRenderer.material` (full path, not id). Add a "common mistakes" checklist (raw-string material id without path, custom system when engine has it, transmissive material with `auto: true` batching, HDR without `asBackground`).
4. **DOCS-asset-pipeline** *(carried over from S54)* — `docs/agent/asset-pipeline.md`. Full loop: `_sources/` layout → `engine asset import` → `engine asset optimize <path> [--textures]` → `asset-sources.json` provenance → runtime `<asset>.material.json` / `<mesh>.glb` → `MeshRenderer.mesh` + `MeshRenderer.material`. Document the `_sources/asset-sources.json` schema's `kind` and `source.type` enums (the material-bench friction note flagged that "environment" / "third-party" aren't accepted). Reference `material-bench-asset-friction.md` for the failure modes.
5. **DOCS-scene-authoring-skill** — `docs/agent/skills/scene-authoring.md` refresh. Cover scene `instances` + prefab refs (S54 M3-c-load), `Transform.parent` hierarchy (S30 M16), `environment: { kind: "hdr", asBackground, backgroundBlurriness }` (S54), shadow config + `ShadowCaster { dynamic }` tag (S52), `Spin` for orbit / rotation behaviours (don't author a custom system).
6. **DOCS-system-authoring-skill** — `docs/agent/skills/system-authoring.md` refresh. Lead with **reuse before new** (grep `engine/core/systems/` + `schemas/components/` first); cached `createQuery` handles, not raw `world.query()`; profile-gated registration; project-local vs engine systems boundary; deviation rule for the "prefer ECS" non-negotiable.
7. **DOCS-playtest-debugging-skill** — `docs/agent/skills/playtest-debugging.md` refresh. Document the current `window.__agf` surface in full: `snapshot` / `applyCommands` / `diagnostics` / `clearDiagnostics` / `copyDiagnostics` / `rendererInfo` / `frameTiming` / `pick` / `physics.{setDebugOverlay,raycast}` / `renderer.{invalidateShadowMap,setShadowMapAutoUpdate}` / `dev.tuner.{add,remove,list}` / `save` / `load`. Pair with the dev-bridge endpoints in `engine/dev/` (project-patch, recording, asset-invalidate).
8. **DOCS-engine-check-skill** — `docs/agent/skills/engine-check.md` refresh. Updated diagnostic table: every `AGF_*` code currently emitted by `engine check` / `engine doctor` / runtime. Include `AGF_LOD_*` (S54), `AGF_TEXTURE_HUGE / _NPOT / _NO_TRANSCODER` (S54), `AGF_SCENE_INSTANCE_PREFAB_MISSING / _DUPLICATE_ID` (S54), `AGF_SHADOW_CSM_DIRECTIONAL_CONFLICT` (S47), `AGF_RUNTIME_ASSET_LOAD_FAILED / _NO_LOADER` (S5+).
9. **DOCS-prefab-skill** *(new)* — `docs/agent/skills/prefab-authoring.md`. When to extract a prefab (≥2 entities sharing ≥3 components); `prefabs/<id>.prefab.json` schema; `scene.instances` overrides shallow-merge rules; `AGF_SCENE_INSTANCE_*` diagnostics; the beacon-world M3-c-beacon adoption as worked example.
10. **DOCS-material-skill** *(new)* — `docs/agent/skills/material-authoring.md`. Standard vs Physical shader; clearcoat / transmission / sheen / iridescence ranges; `bumpMap` vs `normalMap` (height-map vs tangent-space) decision; `normalScale` / `bumpScale` typical values; `AssetRegistry.urlFor` texture resolution; common pitfalls (raw string id without path; texture file in repo but not registered in `asset-sources.json`; `transmission > 0` with `batching.auto: true`).
11. **DOCS-claude-code-+-subagents** — `docs/agent/claude-code.md` refresh against current `.claude/commands/*.md` (`adr-new`, `archive-sprint`, `asset-pipeline`, `check-docs`, `implement-story`, `review-agent`, `sample-game`, `start-next`) and current `.claude/agents/*.md` (`asset-pipeline`, `backend-planner`, `engine-architect`, `playtest-runner`, `schema-guardian`). Verify each subagent description still matches its current responsibilities; correct tool lists.
12. **DOCS-iteration-+-debug-protocol** — `docs/agent/iteration-loop.md` + `docs/agent/debug-protocol.md` refresh. Iteration loop covers preflight gates, branch+PR policy, /implement-story → /archive-sprint flow. Debug protocol covers the dev bridge endpoints, recording start/stop, diagnostics bus, `__agf.copyDiagnostics()`, project-patch.

### Out of scope (Sprint 55)

- ADR-level changes (texture-resolution, asBackground, primitive set, transmission scale) — separate ADR audit story, parked in Next Sprint candidates after S55 if needed.
- `docs/generated/<projectId>/` rebuilds — verification step inside DOCS-engine-check-skill, not a story of its own.
- New skills under `.claude/skills/` (none today). Promote a memo only if it's invoked routinely — explicit non-goal for this sprint.
- The `M26` visual fidelity epic — parked low-priority; not pulled forward.

## Next Sprint (placeholder)

To be detailed at S55 close. Likely candidates: ADR audit, `MeshRenderer.material` path validator, `PRIMITIVE-set-single-source` consolidation, `ASSET-textures-via-registry`, and pulling forward one or two of the `M26` visual-fidelity stories if perf budgets allow.
