# High-Level Backlog

This file is partly **generated**: the roadmap-epics table between the marker pair below is rewritten by `npm run backlog:render` from `backlog/epics/*.epic.json`. Everything outside the markers — Product North Star, Sequencing rationale, Parking Lot, Promotion Rule — stays hand-authored.

## Product North Star

Build AgentsGameFramework (AGF), a lightweight agent-first web game framework:

- TypeScript browser runtime.
- Three.js renderer (WebGPU adapter shipping through S70+).
- Pragmatic ECS and command pipeline.
- JSON / JSON-Schema project files.
- Agent-visible diagnostics, tests, screenshots and playtests.
- Backend-agnostic protocol / world contracts for persistent shared-world multiplayer.
- Optional reference backends, starting with Node + C#/.NET but not limited to them.
- Public engine repository root with example games nested under `examples/`.

## Current Focus

S078–S080 land the JSON-first backlog engine (sprints + stories + epics as validated JSON, with auto-generated Markdown views and an agent-friendly CLI). The next runway is the **Kaboom Crew** flagship sample (public name; codename DynaBomber in `notes/`), starting with engine pre-game work — damped follow camera + orthographic camera path + 2D HUD runtime + grid primitives + procedural-generator framework — before any bomb / blast code lands.

## Roadmap epics

The list below is **generated** from `backlog/epics/*.epic.json`. Add or edit an epic by writing the JSON; run `npm run backlog:render` to refresh the view; commit both files together. Re-categorise an epic by editing its JSON `category` field; flip status (`planned` → `active` → `done` / `parked`) via the same edit.

<!-- backlog:render:start -->

| Epic | Status | Category | Stories (impl / open / total) | Notes |
|---|---|---|---|---|
| **[AGF-BACKLOG-ENGINE](backlog/epics/AGF-BACKLOG-ENGINE.epic.json)** — JSON-first backlog engine — source of truth + tooling | active | infra | 37 / 0 / 37 | → S082 |
| **[AGF-ENGINE-OBSERVABILITY](backlog/epics/AGF-ENGINE-OBSERVABILITY.epic.json)** — Engine observability — diagnostics, logging, motion + renderer probes | active | engine | 50 / 0 / 50 |  |
| **[BEACON-WORLD-SAMPLE](backlog/epics/BEACON-WORLD-SAMPLE.epic.json)** — Beacon World sample | active | engine | 1 / 0 / 1 |  |
| **[E-55-INSPECTOR-WRITEBACK-CONTRACT](backlog/epics/E-55-INSPECTOR-WRITEBACK-CONTRACT.epic.json)** — E.55 Inspector writeback contract | active | infra | 0 / 0 / 0 |  |
| **[INSPECTOR-OVERLAY](backlog/epics/INSPECTOR-OVERLAY.epic.json)** — Inspector overlay | active | engine | 0 / 0 / 0 |  |
| **[KABOOM-CREW-MVP-0](backlog/epics/KABOOM-CREW-MVP-0.epic.json)** — Kaboom Crew — offline solo vertical slice (MVP 0) | active | sample-game | 20 / 0 / 20 | → MVP-0 |
| **[KABOOM-CREW-MVP-1](backlog/epics/KABOOM-CREW-MVP-1.epic.json)** — Kaboom Crew — MVP 1 polish (audio + particles + score + title screen) | active | sample-game | 39 / 0 / 39 |  |
| **[M10](backlog/epics/M10.epic.json)** — M10 Security / trust boundary for agent-authored projects | active | engine | 0 / 0 / 0 |  |
| **[M11](backlog/epics/M11.epic.json)** — M11 Resource lifecycle + leak tests | active | engine | 3 / 0 / 3 |  |
| **[M12](backlog/epics/M12.epic.json)** — M12 Template / project creation CLI | active | engine | 0 / 0 / 0 |  |
| **[M20](backlog/epics/M20.epic.json)** — M20 Netcode rework — pick a proven model & rebuild own-drone authority | active | engine | 1 / 0 / 1 |  |
| **[M5](backlog/epics/M5.epic.json)** — M5 Runtime diagnostics + browser-side error channel | active | engine | 0 / 0 / 0 |  |
| **[M6](backlog/epics/M6.epic.json)** — M6 Deterministic replay / recording | active | engine | 0 / 0 / 0 |  |
| **[M8](backlog/epics/M8.epic.json)** — M8 Input actions, remapping, touch/gamepad | active | engine | 0 / 0 / 0 |  |
| **[M9](backlog/epics/M9.epic.json)** — M9 Build / deploy contract for static + connected | active | engine | 0 / 0 / 0 |  |
| **[REFERENCE-BACKEND-IMPLEMENTATIONS](backlog/epics/REFERENCE-BACKEND-IMPLEMENTATIONS.epic.json)** — Reference backend implementations | active | engine | 0 / 0 / 0 |  |
| **[TEMPLATE-POLICY](backlog/epics/TEMPLATE-POLICY.epic.json)** — Template policy | active | engine | 0 / 0 / 0 |  |
| **[AUDIO](backlog/epics/AUDIO.epic.json)** — Audio | planned | engine | 4 / 0 / 5 |  |
| **[BENCHMARK-STYLE-REPORTS](backlog/epics/BENCHMARK-STYLE-REPORTS.epic.json)** — Benchmark-style reports | planned | engine | 0 / 0 / 0 |  |
| **[EXAMPLES-FEATURE-LAB-SANDBOX](backlog/epics/EXAMPLES-FEATURE-LAB-SANDBOX.epic.json)** — examples/feature-lab/ sandbox | planned | engine | 0 / 0 / 0 |  |
| **[EXECUTABLE-AGENT-SKILLS](backlog/epics/EXECUTABLE-AGENT-SKILLS.epic.json)** — Executable agent skills | planned | engine | 0 / 0 / 0 |  |
| **[GAME-DESIGN-AGENT](backlog/epics/GAME-DESIGN-AGENT.epic.json)** — Game designer / product-owner terminal — third role in the multi-agent loop | planned | infra | 5 / 0 / 5 | → S100 |
| **[M18](backlog/epics/M18.epic.json)** — M18 Picking / raycast interaction | planned | engine | 0 / 0 / 0 |  |
| **[M19](backlog/epics/M19.epic.json)** — M19 Game-feel polish (tween + particles) | planned | engine | 5 / 0 / 5 |  |
| **[M26](backlog/epics/M26.epic.json)** — M26 Visual fidelity polish (probes + post-FX) | planned | engine | 12 / 0 / 12 |  |
| **[M27-DECAL-LAYER](backlog/epics/M27-DECAL-LAYER.epic.json)** — M27 Decal-on-grid renderer primitive | planned | engine | 0 / 0 / 0 | → MVP-2 |
| **[M28-REGION-RULES](backlog/epics/M28-REGION-RULES.epic.json)** — M28 Region / sector modifier primitive | planned | engine | 0 / 0 / 0 | → MVP-2 |
| **[PATCH-BASED-AGENT-WRITES-VALIDATE-DIFF-APPLY](backlog/epics/PATCH-BASED-AGENT-WRITES-VALIDATE-DIFF-APPLY.epic.json)** — Patch-based agent writes (validate → diff → apply) | planned | research | 0 / 0 / 0 |  |
| **[PROCEDURAL-CHARACTER-GENERATOR](backlog/epics/PROCEDURAL-CHARACTER-GENERATOR.epic.json)** — Procedural Character Generator | planned | engine | 1 / 0 / 1 |  |
| **[REMOTE-CDN-ASSET-DELIVERY](backlog/epics/REMOTE-CDN-ASSET-DELIVERY.epic.json)** — Remote/CDN asset delivery | planned | engine | 0 / 0 / 0 |  |
| **[TINY-FAST-REGRESSION-2D-SAMPLE-PONG-CLASS](backlog/epics/TINY-FAST-REGRESSION-2D-SAMPLE-PONG-CLASS.epic.json)** — Tiny fast-regression 2D sample (Pong-class) | planned | research | 0 / 0 / 0 |  |
| **[WORKSPACE-PACKAGE-SPLIT](backlog/epics/WORKSPACE-PACKAGE-SPLIT.epic.json)** — Workspace/package split | planned | engine | 0 / 0 / 0 |  |
| **[AGENT-CLI](backlog/epics/AGENT-CLI.epic.json)** — Agent CLI | done | engine | 5 / 0 / 5 |  |
| **[AGENT-RELIABILITY-INFRASTRUCTURE](backlog/epics/AGENT-RELIABILITY-INFRASTRUCTURE.epic.json)** — Agent reliability infrastructure | done | engine | 10 / 0 / 10 |  |
| **[ASSET-ORGANIZATION](backlog/epics/ASSET-ORGANIZATION.epic.json)** — Asset organization | done | engine | 0 / 0 / 0 |  |
| **[COMMAND-PIPELINE](backlog/epics/COMMAND-PIPELINE.epic.json)** — Command pipeline | done | engine | 0 / 0 / 0 |  |
| **[E-52-ENGINE-SUMMARIZE-PROJECTDIR](backlog/epics/E-52-ENGINE-SUMMARIZE-PROJECTDIR.epic.json)** — E.52 engine summarize <projectDir> | done | infra | 0 / 0 / 0 |  |
| **[E-53-TEMPLATE-CONTEXT-CONTRACT](backlog/epics/E-53-TEMPLATE-CONTEXT-CONTRACT.epic.json)** — E.53 Template context contract | done | infra | 0 / 0 / 0 |  |
| **[E-54-ENGINE-ASSET-IMPORT-OPERATION](backlog/epics/E-54-ENGINE-ASSET-IMPORT-OPERATION.epic.json)** — E.54 engine asset import operation | done | infra | 0 / 0 / 0 |  |
| **[E-56-ENGINE-DOCTOR-PROJECTDIR-SCORECARD](backlog/epics/E-56-ENGINE-DOCTOR-PROJECTDIR-SCORECARD.epic.json)** — E.56 engine doctor <projectDir> scorecard | done | infra | 7 / 0 / 7 |  |
| **[ECS](backlog/epics/ECS.epic.json)** — ECS core | done | engine | 19 / 0 / 19 |  |
| **[EXAMPLES-BATCH-BENCH-BENCHMARK-PROJECT](backlog/epics/EXAMPLES-BATCH-BENCH-BENCHMARK-PROJECT.epic.json)** — examples/batch-bench/ benchmark project | done | engine | 0 / 0 / 0 |  |
| **[EXAMPLES-PHYSICS-BENCH-BENCHMARK-PROJECT](backlog/epics/EXAMPLES-PHYSICS-BENCH-BENCHMARK-PROJECT.epic.json)** — examples/physics-bench/ benchmark project | done | engine | 0 / 0 / 0 |  |
| **[EXAMPLES-SHADOWS-BENCH-BENCHMARK-PROJECT](backlog/epics/EXAMPLES-SHADOWS-BENCH-BENCHMARK-PROJECT.epic.json)** — examples/shadows-bench/ benchmark project | done | engine | 5 / 0 / 5 |  |
| **[HOT-RELOAD](backlog/epics/HOT-RELOAD.epic.json)** — Hot reload | done | engine | 4 / 0 / 4 |  |
| **[M1](backlog/epics/M1.epic.json)** — M1 Versioned project format + migrations | done | engine | 0 / 0 / 0 |  |
| **[M15](backlog/epics/M15.epic.json)** — M15 Engine dev server | done | engine | 12 / 0 / 12 |  |
| **[M16](backlog/epics/M16.epic.json)** — M16 Transform hierarchy | done | engine | 11 / 0 / 11 |  |
| **[M17](backlog/epics/M17.epic.json)** — M17 Renderer batching / instancing | done | engine | 35 / 0 / 35 |  |
| **[M2](backlog/epics/M2.epic.json)** — M2 Project bootstrap / plugin boundary | done | engine | 0 / 0 / 0 |  |
| **[M21](backlog/epics/M21.epic.json)** — M21 Renderer → ECS systems | done | engine | 66 / 0 / 66 |  |
| **[M22](backlog/epics/M22.epic.json)** — M22 ECS performance & design discipline | done | engine | 3 / 0 / 3 |  |
| **[M24](backlog/epics/M24.epic.json)** — M24 Rapier physics & colliders | done | engine | 10 / 0 / 10 |  |
| **[M25](backlog/epics/M25.epic.json)** — M25 Production asset pipeline | done | engine | 8 / 0 / 8 |  |
| **[M2B-DETERMINISTIC-RECORD-REPLAY-TOOLING](backlog/epics/M2B-DETERMINISTIC-RECORD-REPLAY-TOOLING.epic.json)** — M2b Deterministic record/replay tooling | done | engine | 0 / 0 / 0 |  |
| **[M3](backlog/epics/M3.epic.json)** — M3 Prefabs, variants, scene composition | done | engine | 4 / 0 / 4 |  |
| **[M4](backlog/epics/M4.epic.json)** — M4 Save / load + persistence adapter | done | engine | 4 / 0 / 4 |  |
| **[M4-DOCS-SCHEMA-DRIVEN-DOCS-GENERATION](backlog/epics/M4-DOCS-SCHEMA-DRIVEN-DOCS-GENERATION.epic.json)** — M4-docs Schema-driven docs generation | done | engine | 21 / 0 / 21 |  |
| **[M7](backlog/epics/M7.epic.json)** — M7 Performance budgets + renderer metrics | done | engine | 0 / 0 / 0 |  |
| **[MATERIAL-AND-SHADER-SYSTEM](backlog/epics/MATERIAL-AND-SHADER-SYSTEM.epic.json)** — Material and shader system | done | engine | 4 / 0 / 4 |  |
| **[PERSISTENT-WORLD-BACKEND-CONTRACTS](backlog/epics/PERSISTENT-WORLD-BACKEND-CONTRACTS.epic.json)** — Persistent world backend contracts | done | engine | 0 / 0 / 0 |  |
| **[PLAYTEST-RUNNER](backlog/epics/PLAYTEST-RUNNER.epic.json)** — Playtest runner | done | engine | 2 / 0 / 2 |  |
| **[REPO-HYGIENE-CI](backlog/epics/REPO-HYGIENE-CI.epic.json)** — Repo hygiene CI | done | engine | 10 / 0 / 10 |  |
| **[RUNTIME-ASSET-LOADING](backlog/epics/RUNTIME-ASSET-LOADING.epic.json)** — Runtime asset loading | done | engine | 0 / 0 / 0 |  |
| **[SCENE-PROJECT-SCHEMAS](backlog/epics/SCENE-PROJECT-SCHEMAS.epic.json)** — Scene/project schemas | done | engine | 0 / 0 / 0 |  |
| **[SPRINT-0-DOCS-AND-RULES](backlog/epics/SPRINT-0-DOCS-AND-RULES.epic.json)** — Sprint 0 docs and rules | done | engine | 0 / 0 / 0 |  |
| **[THREE-JS-RENDERER](backlog/epics/THREE-JS-RENDERER.epic.json)** — Three.js renderer | done | engine | 1 / 0 / 1 |  |
| **[TOOLCHAIN-AND-TESTS](backlog/epics/TOOLCHAIN-AND-TESTS.epic.json)** — Toolchain and tests | done | engine | 0 / 0 / 0 |  |

**Promotion candidates** (planned + dependencies satisfied): AUDIO, BENCHMARK-STYLE-REPORTS, EXAMPLES-FEATURE-LAB-SANDBOX, EXECUTABLE-AGENT-SKILLS, M18, M19, M26, M27-DECAL-LAYER, M28-REGION-RULES, PATCH-BASED-AGENT-WRITES-VALIDATE-DIFF-APPLY, PROCEDURAL-CHARACTER-GENERATOR, REMOTE-CDN-ASSET-DELIVERY, TINY-FAST-REGRESSION-2D-SAMPLE-PONG-CLASS, WORKSPACE-PACKAGE-SPLIT.

<!-- backlog:render:end -->

## Sequencing notes

Historical sequencing rationale lives in `BACKLOG_ARCHIVE.md` and the per-sprint JSON files (each sprint's `notes` / `followUps` capture the in-flight context).

Current shape:

- **Right now (S080 close):** backlog engine V2 lands — epic schema + check + render + CLI + doctor + migrate-epics + story-epic backfill + this prelude drop.
- **Next (S081–S082):** finalise the `AGF-BACKLOG-ENGINE` epic with stragglers, then open `KABOOM-CREW-MVP-0` and start the engine pre-game stack (camera, HUD, grid, generator).
- **MVP 0 horizon:** offline single-player vertical slice of Kaboom Crew with bots — see `notes/dynabomber-readiness-analysis.md` for the gap list.
- **Post-MVP-0:** multiplayer authority on the Node server, client prediction + reconciliation, snapshot relevance filter.

## Promotion Rule

Move an epic from this file into a sprint (via `backlog/sprints/<id>.sprint.json#stories[]` with the corresponding `epic` field) only when:

- it is part of the active sprint or next sprint;
- it has story-level acceptance criteria;
- it has a clear verification path;
- it does not depend on unresolved architecture decisions.

`backlog:check` enforces the cross-link: a story's `epic` field must resolve to a known JSON file under `backlog/epics/`.

## Parking Lot

The carved-out ideas that don't yet have an epic file (they will, once a sprint pulls them in):

- WebGPU follow-up: default-flip across all examples, ShaderMaterial port progress, post-FX (bloom) parity.
- PixiJS adapter for advanced 2D.
- MessagePack / protobuf network protocol.
- Raw WebSocket transport for action games.
- Shader hot reload.
- Navmesh / pathfinding (post-MVP-0 Kaboom Crew enemy AI).
- In-browser inspector editing that writes JSON patches.
- Sandbox / container strategy for untrusted generated projects.
- Docs split into `docs/users` and `docs/developers` when documentation grows.
- Optional visual-review pass with screenshots after deterministic checks pass.
- `M13` Project-file patch contract — JSON / AGF-command patch shape + `engine patch --check` / `--write`. Pairs with `E.55`.
- Global developer preferences (`~/.agf/config.json`) — optional, local-only, never affects reproducibility.
- `engine screenshot <projectDir> --out <file>` — single-shot canvas capture without the full playtest wrapper.
- Tiny 2D regression sample (Pong-class) — blocked on a 2D rendering path.
- `M27-DECAL-LAYER` — Kaboom Crew blast-prediction overlay primitive (see `notes/dynabomber-readiness-analysis.md` §14).
- `M28-REGION-RULES` — region / sector modifier primitive (same source).
