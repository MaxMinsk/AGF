# High-Level Backlog

Date: 2026-05-13

This file tracks roadmap epics and broad priorities. Detailed story work belongs in `BACKLOG.md` only for the active sprint and the next sprint.

## Product North Star

Build AgentsGameFramework (AGF), a lightweight agent-first web game framework:

- TypeScript browser runtime.
- Three.js renderer.
- Pragmatic ECS and command pipeline.
- JSON/JSON Schema project files.
- Agent-visible diagnostics, tests, screenshots and playtests.
- Backend-agnostic protocol/world contracts for persistent shared-world multiplayer.
- Optional reference backends, starting with C#/.NET but not limited to it.
- Public engine repository root with example games nested under `examples/`.

## Current Focus

1. Scaffold the TypeScript/Vite workspace.
2. Create the first JSON scene path.
3. Render a primitive 3D scene.
4. Establish validation, typecheck, unit tests and Playwright smoke tests.
5. Keep asset organization and source metadata from drifting.

## Roadmap Epics

| Epic | Status | Notes |
| --- | --- | --- |
| Sprint 0 docs and rules | Archived | Baseline docs, ADRs, Claude setup and research notes exist. |
| Toolchain and tests | Archived | Vite, TypeScript, Vitest, Playwright — wired in Sprint 1. |
| Scene/project schemas | Archived | JSON source of truth and diagnostics — shipped in Sprint 1. |
| Asset organization | Archived | Source metadata, runtime folder layout, asset reference validation — Sprint 1. |
| ECS core | Archived | Pragmatic Map-backed world shipped in Sprint 1. |
| Command pipeline | Archived | v0 with `entity.create`/`entity.delete`/`component.set`/`scene.load` — Sprint 1. |
| Three.js renderer | Archived | v0 covers primitive meshes (`box`, `sphere`, `plane`) — Sprint 1. GLB still to come. |
| Agent CLI | Archived | `engine check` and `engine inspect` v0 shipped in Sprint 1. |
| Agent reliability infrastructure | Archived | Preflight script, debug protocol, template policy and quality axes docs exist. |
| Material and shader system | Archived | Material manifest v0 + shader spike shipped in Sprint 2; runtime shader compile is a later epic. |
| Runtime asset loading | Archived | Asset registry, loader contracts and material binding shipped in Sprint 2; first real `.glb` import (hand-rolled cube) landed in Sprint 3. |
| Hot reload | Archived | Scene diff and Vite HMR for scene JSON shipped in Sprint 2. Asset (material/shader) hot reload remains a Sprint 5+ candidate. |
| Playtest runner | Archived | Runtime inspect API + scripted robot playtest shipped in Sprint 2. |
| Persistent world backend contracts | Archived | Protocol schema v0, node-world-server skeleton and Networked/Presence components shipped in Sprint 5. First real transport (WebSocket / SignalR) is a follow-up. |
| Repo hygiene CI | Archived | Cyrillic-in-repo check shipped in Sprint 2. |
| Template policy | Active | Maintained examples as templates, not one-shot generated archives. |
| Reference backend implementations | Active | Node skeleton landed in Sprint 5 (no transport yet). C#/.NET mirror under `examples/backends/dotnet-world-server/` is still pending. |
| Beacon World sample | Active | Scaffold + scene + drone movement shipped through Sprint 4; pickups, carry/deposit and hazards remain. |
| Rapier physics | Later | 3D first, 2D later. |
| Inspector overlay | Active | Sprint 5+ candidate — in-page entity/component overlay, toggle hotkey TBD (not F12, not F2). |
| 2D renderer layer | Later | Orthographic/sprite path after 3D vertical slice. |
| Audio | Later | Positional audio and UI/music buses. |
| Production asset pipeline | Later | Texture compression, LODs, automated Blender/Meshy tooling. |
| Remote/CDN asset delivery | Later | AGF-flavoured "Addressables-lite": asset catalog manifest with hashed URLs, CORS-aware loaders, persistent browser cache (IndexedDB/Cache API), versioned cache busting, progress events and lazy bundles. Builds on top of the existing `AssetRegistry`. |
| Executable agent skills | Later | Turn repeated AGF workflows into runnable skill helpers after failures are known. |
| Benchmark-style reports | Later | Build/runtime/scene/playtest/visual/protocol health summary. |
| Workspace/package split | Later | Consider workspaces only after boundaries become painful. |
| Procedural Character Generator | Later | Standalone tool inside the engine. Node-graph UI; emits a rigged + Mixamo-animatable mesh (human, robot, dog, spider, …) for use as a runtime asset. Tracked in its own backlog: `docs/proposals/procedural-character-generator.md`. Take it on once Beacon World gameplay v0 is stable; staffing it earlier blocks game progress. |

## Must-Have Engine Gaps (from `Notes/codex_review_1.md` M-section)

These are engine/product capabilities that look must-have for AGF's stated goal but are not yet tracked as concrete sprint work. Each one is an epic; concrete stories enter `BACKLOG.md` when promoted.

| Epic | Status | Notes |
|---|---|---|
| `M1` Versioned project format + migrations | Active | `agfVersion` / `formatVersion` field on project/scene/material; `engine:migrate` v0. Foundational — agent-authored projects need a schema-drift answer once externals exist. |
| `M2` Project bootstrap / plugin boundary | **Done** | Shipped Sprint 22 (`engine/runtime/project-bootstrap.ts` + per-project `bootstrap.ts`) and Sprint 23 (dynamic loaders in `src/main.ts`). Keep here for traceability. |
| `M3` Prefabs, variants, scene composition | Active | `prefabs/*.prefab.json`, scene instantiation with overrides, inspect expansion. Beacon's duplicate cores / hazards motivate this. |
| `M4` Save / load + persistence adapter | Active | Backend-agnostic adapter (IndexedDB first, REST later); Beacon-World local persistence slice for repaired beacons / scores / signal across reloads. |
| `M5` Runtime diagnostics + browser-side error channel | **High priority** | Structured `window.__agf.diagnostics()` event bus. Agents currently have no in-page error contract beyond console; this directly improves the agent loop. |
| `M6` Deterministic replay / recording | Active | Record (time, inputs, commands, snapshots, diagnostics); replay headlessly; attach AGF recording to failed Playwright tests. |
| `M7` Performance budgets + renderer metrics | Active | Renderer `info` (draws, triangles, geometries, textures, frame time) exposed on `window.__agf`; per-project `performance-budget.json`; soft/hard thresholds. Extends the bundle-size budget shipped in Sprint 25. |
| `M8` Input actions, remapping, touch/gamepad | Active | Project-declared action schema (e.g. `move.x`, `interact`); adapter layer (keyboard / gamepad / touch); inspect API for action state. |
| `M9` Build / deploy contract for static + connected | Active | `engine build` emits a deploy manifest (project id, profile, asset list, hashed bundles, engine version, backend config placeholders). Less urgent until first deploy target lands. |
| `M10` Security / trust boundary for agent-authored projects | Active | Doc + CLI warning + network hardening (already partially shipped via protocol-validator, id-collision and size caps). Mostly documentation work. |
| `M11` Resource lifecycle + leak tests | **High priority** | HMR-heavy workflow means leaks build up silently. Renderer lifecycle audit (geometries / materials / textures count), HMR stress test, network adapter create/dispose loop. |
| `M12` Template / project creation CLI | Active | `engine new -- <name> --template hello-3d`. Less urgent while only two examples exist; gains value once a third sample is added. |

**Sequencing the M-list:**

1. ~~Take **M5** + **M11** next~~ — **Done in Sprint 26**. Runtime diagnostics bus, asset/network/HMR emit paths, renderer-info exposure, HMR stress test, adapter create/dispose stress, renderer-import-boundary test.
2. Take **M1** + **M7** next — versioning is foundational; `M7` extends the budget script already shipped in Sprint 25 with renderer-info from Sprint 26.
3. **M3** prefabs and **M4** save/load follow once Beacon World is rich enough to motivate the de-duplication / persistence pressure.
4. **M6**, **M8**, **M9**, **M10**, **M12** queue behind the above; they are real but not blocking the agent's edit → inspect → run cycle today.

## AI-Native Ideas (from `Notes/ai-game-engine-ideas.md`)

Concrete candidates pulled from the "Summer Engine" comparison note. Each one is an epic; promote to `BACKLOG.md` when scoped into stories. The strong fits below pair with the M-list above — flagged inline.

| Epic | Status | Notes |
|---|---|---|
| `E.52` `engine summarize <projectDir>` | **High priority** | Compact project context summary for agent prompts. Metadata, profiles, component vocabulary, system list, entity/component counts, asset summary, playtest list. JSON + human output. Pairs naturally with the existing `engine inspect`. |
| `E.53` Template context contract | **High priority** | `template.json` + required `template_context.md` per template. Describes gameplay vocabulary and safe extension points so agents can answer "how do I add a new pickup type?" without scanning everything. Strengthens **M12** (template CLI). |
| `E.54` `engine asset import` operation | **High priority** | One command turns a generated/downloaded file into a valid AGF runtime asset: copy under `assets/runtime/`, append `asset-sources.json` entry, optionally emit a material manifest, run validation. Closes the loop the existing `AGF_ASSET_RUNTIME_UNDECLARED` diagnostic opens. |
| `E.55` Inspector writeback contract | Active | Define a JSON / AGF patch format; expose a dev API that exports pending patches from runtime commands; ship one prototype editor that moves an entity and emits a patch. Lower priority — pairs with a future inspector-overlay epic, agent-first prefers JSON edits. |
| `E.56` `engine doctor <projectDir>` scorecard | **High priority** | One command consolidates `engine check` + `engine inspect` summary + playtest list + recent runtime diagnostics + optional perf metrics. Does NOT run expensive e2e; prints exact commands. Strong fit now that `M5` diagnostics + `M7` renderer info exist. |

**Sequencing:** Take **E.52** + **E.56** first — they unify the existing surfaces (`engine check`, `engine inspect`, the new diagnostics bus, renderer info, playtests) into agent-friendly one-liners. **E.54** ships next because it closes the asset-import gap the Sprint 22 reverse-diagnostic exposed. **E.53** rides alongside **M12** (template CLI) since both touch the templates story. **E.55** waits until there is a real inspector epic to anchor it.

## Parking Lot

- WebGPU backend exploration.
- PixiJS adapter for advanced 2D.
- MessagePack/protobuf network protocol.
- Raw WebSocket transport for action games.
- Shader hot reload.
- Navmesh/pathfinding.
- Particle system.
- In-browser inspector editing that writes JSON patches.
- Sandbox/container strategy for untrusted generated projects.
- Docs split into `docs/users` and `docs/developers` when documentation grows.
- Optional visual review using screenshots after deterministic checks pass.
- (Promoted to Sprint 2 Epic 12: Cyrillic-in-repo CI check.)

## Promotion Rule

Move an epic from this file into `BACKLOG.md` only when:

- it is part of the active sprint or next sprint;
- it has story-level acceptance criteria;
- it has a clear verification path;
- it does not depend on unresolved architecture decisions.
