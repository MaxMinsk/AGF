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
| `examples/feature-lab/` sandbox | Later (after M16+M4+M18+M19) | A tiny non-game sandbox under `examples/feature-lab/` whose only job is to lock the engine vertical: one parent-child rig (M16), one `Pickable` entity (M18), one `Tween` (M19), one `ParticleEmitter` preset (M19), one `Persisted` block (M4), one repeated-entity instancing group (M17). Playtest robot asserts each feature is wired. Not a game, just a regression target — keeps Beacon World focused on multiplayer gameplay and stops AGF samples from cloning idler/garden patterns from other engines' demos. |

## Must-Have Engine Gaps (from `Notes/codex_review_1.md` M-section)

These are engine/product capabilities that look must-have for AGF's stated goal but are not yet tracked as concrete sprint work. Each one is an epic; concrete stories enter `BACKLOG.md` when promoted.

| Epic | Status | Notes |
|---|---|---|
| `M1` Versioned project format + migrations | **Done (v0)** | Shipped Sprint 27: `agfFormatVersion` on `project.json` schema + reference projects; `AGF_FORMAT_VERSION_MISSING/_TOO_OLD/_UNSUPPORTED` diagnostics; `engine migrate <projectDir> [--dry-run]` v0 adds the field when missing. Follow-up: extend to scene-extension and material manifests. |
| `M2` Project bootstrap / plugin boundary | **Done** | Shipped Sprint 22 (`engine/runtime/project-bootstrap.ts` + per-project `bootstrap.ts`) and Sprint 23 (dynamic loaders in `src/main.ts`). Keep here for traceability. |
| `M2b` Deterministic record/replay tooling | **Done (v0)** | Shipped Sprint 28: `engine/runtime/recording/recorder.ts` + `engine replay <file> [--expect ...]` + two unit tests. Follow-up: profile-flag-gated seeded RNG helper for Beacon's hazard pulse / pickup respawn so replays survive RNG drift. |
| `M3` Prefabs, variants, scene composition | Active (expander shipped, runtime wiring pending) | Sprint 29 landed `schemas/prefab.schema.json` + `AGF_PREFAB_INVALID`. Sprint 30 added scene `instances` to `schemas/scene.schema.json` + pure `expandScenePrefabs(scene, registry)` in `engine/core/scene/expand-prefabs.ts` with `AGF_SCENE_INSTANCE_PREFAB_MISSING` / `_DUPLICATE_ID`. **Still pending:** scene-load wiring (`M3-c`) and Beacon adoption. |
| `M4` Save / load + persistence adapter | **Done (v0)** | Shipped Sprint 30: `engine/runtime/persistence/{local-store,save-load}.ts` + `RuntimeHandle.save/load/clearSave` + `AppHandle` + `window.__agf` surface. `project.json#persistence.components` allowlist enforced. Beacon World wired with `["Repairable", "WorldSignal", "Scoreboard"]`. Follow-up: full-page-reload Playwright proof (`M4-reload-e2e`). |
| `M4-docs` Schema-driven docs generation | **Done (v0)** | Shipped Sprint 28: `engine docs <projectDir>` renders Markdown from every `schemas/*.schema.json` + the project's `template_context.md` into `docs/generated/<projectId>/`. Regenerable; gitignored. |
| `M5` Runtime diagnostics + browser-side error channel | **High priority** | Structured `window.__agf.diagnostics()` event bus. Agents currently have no in-page error contract beyond console; this directly improves the agent loop. |
| `M6` Deterministic replay / recording | Active | Record (time, inputs, commands, snapshots, diagnostics); replay headlessly; attach AGF recording to failed Playwright tests. |
| `M7` Performance budgets + renderer metrics | **Done (v0)** | Shipped Sprint 27: per-project `performance-budget.json` + `schemas/performance-budget.schema.json` + `engine doctor` reads the budget and exposes `compareRendererInfo(info, budget)` for soft/hard renderer violations. Renderer `info` already on `window.__agf` from Sprint 26. Follow-up (`E.64`): roll bundle:check into the doctor report. |
| `M8` Input actions, remapping, touch/gamepad | Active | Project-declared action schema (e.g. `move.x`, `interact`); adapter layer (keyboard / gamepad / touch); inspect API for action state. |
| `M9` Build / deploy contract for static + connected | Active | `engine build` emits a deploy manifest (project id, profile, asset list, hashed bundles, engine version, backend config placeholders). Less urgent until first deploy target lands. |
| `M10` Security / trust boundary for agent-authored projects | Active | Doc + CLI warning + network hardening (already partially shipped via protocol-validator, id-collision and size caps). Mostly documentation work. |
| `M11` Resource lifecycle + leak tests | **High priority** | HMR-heavy workflow means leaks build up silently. Renderer lifecycle audit (geometries / materials / textures count), HMR stress test, network adapter create/dispose loop. |
| `M12` Template / project creation CLI | Active | `engine new -- <name> --template hello-3d`. Less urgent while only two examples exist; gains value once a third sample is added. |
| `M15` Engine dev server | **Done (v0; SSE pending)** | Sprint 30 produced the design doc; Sprint 31 shipped `M15-a` plugin + `/health`, `M15-b` WS bridge, `M15-c` pull endpoints (snapshot / diagnostics / renderer-info / reload-events), `M15-d` `/bug-report` + schema, `M15-e` recording start/stop, `M15-f` commands, `M15-h` asset invalidate. Page-bridge auto-reconnects, dedicated playwright.dev-bridge.config.ts owns isolation. Remaining: `M15-g` SSE event stream, `M15-i` optional `engine connect` CLI, `M15-multi-page` drop the single-page invariant. |
| `M16` Transform hierarchy | **Done (v0)** | Shipped Sprint 30: `Transform.parent` schema, `AGF_TRANSFORM_PARENT_MISSING/_SELF/_CYCLE` diagnostics, pure `resolveHierarchy` resolver (4x4 matrix composition with Euler XYZ ↔ rotation), renderer consumes resolved world transforms, `engine inspect` prints `parent` + `worldPosition`. Follow-ups: cascade-delete commands (`M16-cascade`), prefab expansion preserves parent links, renderer dirty-flag cache when entity counts grow. |
| `M17` Renderer batching / instancing | Active — needs perf-first design | Real draw-call reduction. Goal: an ECS-native, allocation-stingy batcher that auto-discovers batchable entities (same mesh+material+render-policy) without project code wiring it manually. Staged: (1) component-tagged `Batchable` plus a runtime bucketer that emits `InstancedMesh` per bucket, (2) static geometry merge for scenery, (3) LOD / culling / atlasing later. Picking maps `instanceId` back to entity id; `engine doctor` reports batch candidates and live batch metrics (draw calls, bucket count, biggest bucket); renderer never exposes `Object3D` to gameplay. ECS data flow must stay clean — no two-writer state on `Transform`. Source-of-truth dedicated benchmark project: see `examples/batch-bench/` entry below. |
| `examples/batch-bench/` benchmark project | Active alongside `M17` | Stand-alone non-game project whose only job is to stress the batcher with thousands of instanced entities (mesh + material variants, dynamic vs static, instance churn, transform updates per frame). Capture `engine doctor`'s renderer-info and a custom perf report (draw calls / FPS / batch count) under labelled scenarios so M17 changes have a deterministic regression target. Lives next to `examples/feature-lab/` as a perf-only fixture; not a gameplay sample. |
| `M18` Picking / raycast interaction | High-medium | Runtime `pick({ screen, include, maxDistance })` API + `Pickable` component. Renderer returns AGF entity ids (never `Object3D`); instanced meshes resolve `instanceId → entityId`; Playwright pick helper for tests. Pairs with `M17` and a future inspector overlay. |
| `M19` Game-feel polish (tween + particles) | Medium | Data-driven `Tween` component (target path, from, to, duration, ease, loop, persist policy) with deterministic easing for replay; `ParticleEmitter` with named presets (no general VFX graph yet), per-project particle budget enforced by `engine doctor`. Source: `Notes/linkedin_web_engine_part3_analysis.md`. |
| `M20` Netcode rework — pick a proven model & rebuild own-drone authority | **High priority — investigate first** | Three bugs surfaced together in Sprint 32 (own-drone runs 2× the server-broadcast position; 30s server idle timeout disconnects steady players; networked controls feel different from single-player). Current "rollback-replay with `replayUnackedIntents`" is mixed-source-of-truth — PlayerInputSystem moves the drone locally AND `network-drone-sync` lerps it toward `server + replay`, double-counting in-flight intents. Investigation lands as `docs/research/netcode-rework-investigation.md` (done Sprint 32); recommendation is **client-authoritative own player** (Option E). Implementation sequenced as M20-a → M20-l across 2 sprints. |
| `M21` Renderer → ECS systems | **Investigated — Phase 1 ready, Phase 2 sequenced** | `M21-investigate` shipped: see `docs/research/renderer-ecs-split-investigation.md`. **Phase 1 (structural split, 8 stories)**: thin `ThreeRenderAdapter` + five scheduler-registered systems (`TransformResolve` → `CameraSync` → `MeshLifecycle` → `MaterialBinding` → `MeshTransformSync`) + five renderer-internal components. Renderer-import-boundary preserved. Frame-time ≤ baseline × 1.05 at 1k entities. Stories `M21-a..g` + `M21-boundary-check`. **Phase 2 (Unity-class feature build-out, ~5 epics over Sprints 35–39+)**: materials beyond Standard (`M21-mat-*` — Physical / Unlit / Lambert / Phong / custom `ShaderMaterial` + `onBeforeCompile` + shader warmup + PBR textures + KTX2); lights as ECS components (`M21-light-*` — directional / point / spot / hemisphere / rect-area + fallback diagnostic); shadows (`M21-shadow-*` — basic PCFSoft + CSM addon + PCSS/VSM stretch); batching (`M17-*` — `InstancedMesh` / `BatchedMesh` / LOD / BVH frustum cull / doctor checks); post-processing (`M21-post-*` — Composer + Bloom / FXAA / SSAO / Outline); color/tonemap (`M21-color`); IBL/envmaps (`M21-env-*` — Generated / HDR / Cube); camera features (`M21-cam-*` — Ortho / Layers / RenderTargets). Out of scope at Phase 2 end: real-time GI, Forward+, animation system, scene editor. |
| `M22` ECS performance & design discipline | **Active — ECS-B1 + ECS-B2 shipped** | Source: `Notes/ecs_notes.md` (Friflo benchmark survey + AGF-specific recommendations). Verdict: **don't rewrite to archetype ECS** — current `Map<ComponentName, Map<EntityId, ComponentData>>` is fine for AGF's scale and is agent-friendly. Competitive picture lives in `docs/research/ecs-compare-performance.md` (matched pair with the benchmark baseline; refresh together). Sub-epics: (a) ✅ **ECS benchmark suite** — `benchmarks/ecs/` zero-dep harness, three suites (snapshot / query / hierarchy-resolve), baseline JSON at `docs/research/ecs-benchmarks-baseline.json`. Key findings: `resolveHierarchy chain-of-8 @ 10k = ~12 ms` (73% frame budget — `M16-cache` is mandatory); uncached `world.query()` two-component is ~18,000× slower than cached `createQuery`. `ECS-B3` (batch-bucket bench) deferred until `M17-bucketer` exists. (b) **LocalToWorld cache** (`M16-cache-a..e`) — TransformRevision + dirty subtree propagation + reused matrices + tests, sits under M21 renderer split; (c) **System-level command buffer** (`CMD-B1..B4`) — structural mutations queued during system iteration, applied between phases, recorded for diagnostics + replay; (d) **Explicit indexes** (`IDX-Parent`, `IDX-Networked`, `IDX-Assets`, `IDX-Pickable`) — add one when a real feature needs it, not earlier. Orient toward Friflo coverage + Unity-DOTS transform pipeline + Leopotam minimalism + AGF's schema-first authoring. Do NOT adopt: full archetype ECS, generic relations, event-driven gameplay. |

**Sequencing the M-list:**

1. ~~Take **M5** + **M11** next~~ — **Done in Sprint 26**. Runtime diagnostics bus, asset/network/HMR emit paths, renderer-info exposure, HMR stress test, adapter create/dispose stress, renderer-import-boundary test.
2. ~~Take **M1** + **M7** next~~ — **Done in Sprint 27**. Project versioning (`agfFormatVersion` + diagnostics + `engine migrate`), per-project performance budget + schema, `engine doctor` reads the budget.
3. ~~Take **M2b** (record/replay) + **M4-docs** (`engine docs`) next~~ — **Done in Sprint 28**. Recorder + `engine replay` (v0), schema-to-Markdown generator, lazy renderer, bundle-in-doctor, CI typecheck job, Beacon sound pings.
4. Take **M2b-seed** (deterministic RNG) + **M3** (prefabs) next — closes the record/replay determinism gap and reduces Beacon's repeated-content tax.
5. Take **M15** (engine dev server investigation) and **M16** (transform hierarchy) next — M15 because the agent loop needs live-process access; M16 because hierarchy is the deepest schema-level gap and is painful to retrofit once project files grow. Both should run in parallel: M15 is an investigation story, M16 starts with a small schema + diagnostics slice.
6. Then **M4** save/load v0 (sharpened spec inline above), **M18** picking, **M19** tween/particles, **M17** renderer instancing. The `examples/feature-lab/` sandbox (see Roadmap Epics) becomes the proof project after these land.
7. Existing **M8**, **M9**, **M10**, **M12** queue behind the above; they are real but not blocking the agent's edit → inspect → run cycle today.

## AI-Native Ideas (from `Notes/ai-game-engine-ideas.md`)

Concrete candidates pulled from the "Summer Engine" comparison note. Each one is an epic; promote to `BACKLOG.md` when scoped into stories. The strong fits below pair with the M-list above — flagged inline.

| Epic | Status | Notes |
|---|---|---|
| `E.52` `engine summarize <projectDir>` | **Done** | Shipped Sprint 27 (`engine/tools/summarize/project-summarize.ts`). Compact project context summary — metadata, components, scene entity-component counts, asset entries, playtests. `--json` + human output. |
| `E.53` Template context contract | **Done (v0)** | Shipped Sprint 27. `schemas/template.schema.json` + `template.json` and `template_context.md` for both reference projects (`hello-3d`, `beacon-world`). Pairs with future **M12**. |
| `E.54` `engine asset import` operation | **Done (v0)** | Shipped Sprint 27 (`engine/tools/asset/asset-import.ts`). Copies a source file into `assets/runtime/<subdir>/` and appends an entry to `asset-sources.json`. Follow-up: optional material-manifest emission. |
| `E.55` Inspector writeback contract | Active | Define a JSON / AGF patch format; expose a dev API that exports pending patches from runtime commands; ship one prototype editor that moves an entity and emits a patch. Lower priority — pairs with a future inspector-overlay epic, agent-first prefers JSON edits. |
| `E.56` `engine doctor <projectDir>` scorecard | **Done** | Shipped Sprint 27 (`engine/tools/doctor/project-doctor.ts`). Consolidates `engine check` + summary + perf budget; exits 1 on errors. `compareRendererInfo(info, budget)` exposes soft/hard renderer violations for callers. |

**Sequencing:** ~~Take **E.52** + **E.56** first — they unify the existing surfaces (`engine check`, `engine inspect`, the new diagnostics bus, renderer info, playtests) into agent-friendly one-liners. **E.54** ships next because it closes the asset-import gap the Sprint 22 reverse-diagnostic exposed. **E.53** rides alongside **M12** (template CLI) since both touch the templates story.~~ **E.52 / E.53 / E.54 / E.56 — done in Sprint 27.** **E.55** waits until there is a real inspector epic to anchor it.

## M15 — Engine dev server (investigation story)

AGF's current split — Node-side CLI tools that read the filesystem + browser runtime — does not cover **live-process** workflows. When the user is running the game in their tab and describes a bug, there is no agent-reachable surface: the only options today are DevTools manipulation or human-mediated clipboard / file paste. Both are wrong for an agent-first engine.

Likely shape (to be confirmed by investigation): a **DEV-only Vite plugin** that adds HTTP + WebSocket endpoints under `/__agf/*`, paired with a tiny page-side bootstrap that opens a WS on mount. An agent then reaches the running game by HTTP — no human in the loop.

### Story

- `E.80` **Engine dev server — investigation.** Produce `docs/research/engine-dev-server-investigation.md` covering:
  - The exact use cases an agent needs against a running tab (state pull, command injection, recording capture, event streaming, asset hot reload triggered by the agent, an HTTP "Playwright-light" alternative).
  - Architecture options compared on agent ergonomics + dev-server overhead: Vite plugin with `configureServer` + WS bridge vs. a standalone Node sidecar vs. extending an existing dev tool. Pick one.
  - Endpoint surface (`/__agf/snapshot`, `/__agf/bug-report`, `/__agf/recording/{start,stop}`, `/__agf/commands`, `/__agf/events` SSE, etc.) with request/response schemas.
  - Security stance (localhost-only, no auth in DEV, plugin excluded from production builds, M10 coverage for prod).
  - How HMR, recorder (Sprint 28), diagnostics bus (Sprint 26), and renderer-info (Sprint 26) connect to the bridge.
  - First-implementation sprint plan: a sequenced list of stories sized for one sprint each.

**Explicit non-goals at investigation stage:** no Ctrl-C / Ctrl-V flows, no "download as file" affordances, no "Copy bug report" buttons. If a story implies human-mediated state transfer, it is the wrong story for an agent-first engine.

The user has a running game and describes a bug. There is no agent-readable bridge from that live tab back to me today. AGF is **agent-first** — the answer is NOT "open DevTools, copy / paste / download" but a programmatic bridge so an agent can pull state directly from the running dev tab.

| Story | Notes |
|---|---|
| `E.80` `window.__agf.bugReport()` | Single call bundles `snapshot()` + `diagnostics()` + `rendererInfo()` + project id + active profile + networking config into one JSON. **Pure data producer** — no clipboard, no download, just returns the JSON string. Other consumers (bridge endpoint, page-side overlay) wrap it. |
| `E.81` Recorder on `window.__agf` | Expose `__agf.startRecording()` / `__agf.stopRecording()`. `RuntimeHandle.startRecording` exists since Sprint 28 — this just plumbs it through the AppHandle and onto the DEV global. **No file download** — the dev-server bridge (`E.82`) ships recordings over HTTP. |
| `E.82` Vite dev-server agent bridge | New Vite plugin + WebSocket loop. Browser opens a WS to `/__agf/ws` on mount; dev server exposes `GET /__agf/bug-report`, `GET /__agf/snapshot`, `GET /__agf/diagnostics`, `POST /__agf/recording/start`, `POST /__agf/recording/stop` (returns the Recording JSON), `POST /__agf/commands` (forwards EngineCommands to the page). The agent runs `curl http://localhost:5173/__agf/bug-report` — no human interaction. |
| `E.83` `engine inspect --state-from <snapshot.json>` | Ingests a pre-captured `WorldSnapshot` (e.g. the `snapshot` field of a bug-report JSON, or a recording's `finalSnapshot`) and runs the existing inspect filters against it. Pairs with `E.82` so an agent can pipe `curl /__agf/bug-report | jq .snapshot > /tmp/s.json && engine inspect --state-from /tmp/s.json`. |
| `E.84` `AgentBugReport` schema | `schemas/bug-report.schema.json` defining `{ agfFormatVersion, projectId, capturedAt, profile, snapshot, diagnostics, rendererInfo, recordingSummary?, description? }`. `engine check` validates bug-report files; agents can rely on a typed shape. |

Sequencing: **the bridge (`E.82`) is the load-bearing story** — it converts every other `window.__agf.*` surface from "human-typed in DevTools" into "agent HTTP GET". Ship `E.80` + `E.81` + `E.84` first as primitives, then `E.82` to expose them, then `E.83` to consume snapshots offline. **Explicitly skip:** anchor-tag downloads, clipboard-only flows, "Copy bug report" buttons. These are human-in-the-loop affordances; AGF agents reach the page directly.

## From `Notes/kenji_engine_analysis.md` (most ideas already match AGF's direction)

Kenji's review is mostly confirmation that AGF's current stance is right (CLI-first, schema-strict, no live runtime mutation, no Bun-only, no terminal renderer). The few genuinely new takeaways worth tracking:

| Idea | AGF entry | Status |
|---|---|---|
| Patch-based agent writes (validate → diff → apply) | `M13` Project-file patch contract — design a JSON / AGF-command patch shape; `engine patch <projectDir> <patch>` with `--check` and `--write`. Pairs with `E.55` inspector writeback. | New parking-lot entry below. |
| Global developer preferences (browser, editor, screenshot dir, dev port) | Optional `~/.agf/config.json` — explicitly NOT for project-critical behavior. Quick local-quality-of-life win, low priority. | New parking-lot entry below. |
| Single-shot `engine screenshot <projectDir> --out <file>` | Standalone screenshot command for agent review without spinning up a full playtest. | New parking-lot entry below. |
| Tiny fast-regression 2D sample (Pong-class) | Blocked on a 2D rendering path. Park until 2D exists. | Existing parking-lot "PixiJS adapter for advanced 2D" already covers the prerequisite. |
| Confirmed value of `M8` (input actions) and `M12` (template CLI) | Already on the M-list above. | No change. |

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
- `M13` Project-file patch contract — JSON/AGF-command patch shape + `engine patch --check`/`--write`. Pairs with `E.55`.
- Global developer preferences (`~/.agf/config.json`) — optional, local-only, never affects reproducibility.
- `engine screenshot <projectDir> --out <file>` — single-shot canvas capture without the full playtest wrapper.
- Tiny 2D regression sample (Pong-class) — blocked on a 2D rendering path; revisit once 2D lands.
- (Promoted to Sprint 2 Epic 12: Cyrillic-in-repo CI check.)

## Promotion Rule

Move an epic from this file into `BACKLOG.md` only when:

- it is part of the active sprint or next sprint;
- it has story-level acceptance criteria;
- it has a clear verification path;
- it does not depend on unresolved architecture decisions.
