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

1. **DOCS-stale-audit** — single-pass sweep of every `docs/agent/*.md`, `docs/agent/skills/*.md`, `AGENTS.md`, `docs/*.md`. Output landed at `docs/agent/_audit-2026-05-15.md`: 26 rows, per-file verdict (`OK` / `update` / `update (large)` / `new`) plus the single highest-priority drift to fix in the matching owning story. Subsequent S55 stories cite the audit as their input; the file is removed at sprint close (its content moves into the BACKLOG_ARCHIVE entry). Status: Implemented.
2. **DOCS-AGENTS-root** — `AGENTS.md` (root) + `docs/agent/rules.md` + `docs/agent/review-checklist.md` refreshed together. Hard rules now include: ECS systems by default + documented-deviation clause; reuse engine primitives before scaffolding clones; texture refs always through `AssetRegistry.urlFor`; `MeshRenderer.material` is full path not id; `Transform.rotation` is degrees; prefab overrides shallow-merge; primitive set is `box / sphere / cylinder / plane`. Review checklist gains the data/schema/perf-hygiene sections. Status: Implemented.
3. **DOCS-build-a-game** — `docs/agent/build-a-game.md` rewritten with the current pipeline: explicit "drop CC0 → `engine asset optimize --textures` → material manifest with `bumpMap`/`roughnessMap` → reference full path from `MeshRenderer.material`" walkthrough; new "instantiate a prefab" recipe; HDR-as-background + idle-mode + critical-assets recipes; "common mistakes" checklist with 6 hand-picked failure modes from this fortnight's work. `__agf` surface table extended with `gpuMs` / `frameTiming` / `pick` / `dev.tuner` / shadow controls / physics raycast. Status: Implemented.
4. **DOCS-asset-pipeline** — new `docs/agent/asset-pipeline.md`. Pipeline diagram + per-stage prose: `_sources/` layout, provenance schema (`kind` / `source.type` enums), `engine asset import`, `engine asset optimize` with `--source` / `--textures`, material manifest fields cheat-sheet (incl. `bumpMap` vs `normalMap`), scene reference rules (full path; primitive set is `box / sphere / cylinder / plane`), HDR env spec, doctor sections relevant to assets, `criticalAssets` gate, diagnostics catalogue. Friction note linked. Status: Implemented.
5. **DOCS-scene-authoring-skill** — `docs/agent/skills/scene-authoring.md` rewritten. Scene shape + instances + Transform hierarchy + HDR-as-background spec; component cheat-sheet covering MeshRenderer full-path rule, ShadowCaster dynamic flag, Spin / Tween / WaypointMover (use these before scaffolding clones); project-local component flow; 5 common pitfalls. Status: Implemented.
6. **DOCS-system-authoring-skill** — `docs/agent/skills/system-authoring.md` rewritten. Leads with grep-before-scaffold rule; canonical cached-`createQuery` template; engine-vs-project boundary table; hard-rules section incl. no-per-frame-Three.js-alloc + no-raw-event-listener-in-frame; 5 common pitfalls. Status: Implemented.
7. **DOCS-playtest-debugging-skill** — `docs/agent/skills/playtest-debugging.md` rewritten. Full `window.__agf` API table (16 entries incl. `rendererInfo.gpuMs`, `frameTiming`, `pick`, `dev.tuner.*`, shadow controls, physics raycast, recording, save/load). Dev-bridge HTTP endpoint table (12 routes). 6 common debugging patterns. Status: Implemented.
8. **DOCS-engine-check-skill** — `docs/agent/skills/engine-check.md` rewritten with the full sibling-command table (`check / doctor / inspect / docs / list / explain / asset optimize / asset import`), a symptom-to-code lookup table, and the actual file list `engine check` validates. `docs/diagnostics.md` catalogue brought current — domain enum extended (`LOD`, `TEXTURE`, `PREFAB`, etc.); new tables for asset/LOD/texture/prefab/physics/shadow/runtime domains; S54 codes (`AGF_LOD_*`, `AGF_TEXTURE_*`, `AGF_SCENE_INSTANCE_*`) added with `Where it fires` references. Status: Implemented.
9. **DOCS-prefab-skill** — new `docs/agent/skills/prefab-authoring.md`. When-to-extract threshold; manifest shape; scene `instances[]` syntax; shallow-merge semantics with worked example; per-instance field list (`Name.label`, `Transform.position`, `Pickup.originalPosition`, etc.); when NOT to extract; diagnostics + doctor section; beacon-world M3-c-beacon worked example. Status: Implemented.
10. **DOCS-material-skill** — new `docs/agent/skills/material-authoring.md`. Shader table with picking guidance; full field cheat-sheet (color/roughness/metalness/clearcoat/transmission/sheen/iridescence/maps); bumpMap-vs-normalMap decision rules with the three.js bump-source pitfall called out; texture resolution through `AssetRegistry.urlFor`; reference rule (full path not bare id); 7 common pitfalls; doctor + texture warnings. Status: Implemented.
11. **DOCS-claude-code-+-subagents** — `docs/agent/claude-code.md` refresh against current `.claude/commands/*.md` (`adr-new`, `archive-sprint`, `asset-pipeline`, `check-docs`, `implement-story`, `review-agent`, `sample-game`, `start-next`) and current `.claude/agents/*.md` (`asset-pipeline`, `backend-planner`, `engine-architect`, `playtest-runner`, `schema-guardian`). Verify each subagent description still matches its current responsibilities; correct tool lists.
12. **DOCS-iteration-+-debug-protocol** — `docs/agent/iteration-loop.md` + `docs/agent/debug-protocol.md` refresh. Iteration loop covers preflight gates, branch+PR policy, /implement-story → /archive-sprint flow. Debug protocol covers the dev bridge endpoints, recording start/stop, diagnostics bus, `__agf.copyDiagnostics()`, project-patch.

### Out of scope (Sprint 55)

- ADR-level changes (texture-resolution, asBackground, primitive set, transmission scale) — separate ADR audit story, parked in Next Sprint candidates after S55 if needed.
- `docs/generated/<projectId>/` rebuilds — verification step inside DOCS-engine-check-skill, not a story of its own.
- New skills under `.claude/skills/` (none today). Promote a memo only if it's invoked routinely — explicit non-goal for this sprint.
- The `M26` visual fidelity epic — parked low-priority; not pulled forward.

## Next Sprint (placeholder)

To be detailed at S55 close. Likely candidates: ADR audit, `MeshRenderer.material` path validator, `PRIMITIVE-set-single-source` consolidation, `ASSET-textures-via-registry`, and pulling forward one or two of the `M26` visual-fidelity stories if perf budgets allow.
