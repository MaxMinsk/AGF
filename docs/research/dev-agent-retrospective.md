# Dev-Agent Retrospective — Lived-Experience Gap Analysis after ~150 Sprints

**Source story:** GDP-2026-05-28-009.
**Owner:** dev terminal.
**Date:** 2026-05-28.
**Scope:** sprints S0 → S163 (sprint S164 retrospective is this artifact).
**Tone:** honest, forward-looking, lived-experience grounded. Not a litigation of past decisions; an inventory of what would have made the next 150 sprints faster + higher quality.

This document is the input the game-design agent will read to file follow-up engine + tooling stories. Every gap is anchored to a concrete sprint ID. Recommendations are ranked at the bottom by payoff/cost.

---

## 0. How to read this

Each section opens with a short framing of the problem area, then lists concrete gaps. A gap has the shape:

- **Symptom** — the recurring sprint-note phrasing or scope-cut pattern.
- **Evidence** — sprint IDs where the symptom surfaced.
- **What happened instead** — the workaround we shipped.
- **What's needed** — the missing primitive / tool / probe in one line.

Section §10 reaggregates the gaps into a ranked Top-10 with severity, close-cost and payoff. Game-design can pull the Top-3 directly into the next sprint without re-asking us for clarification.

We deliberately do **not** revisit settled design decisions (procedural characters vs Mixamo, no blast-prediction decals, Cyrillic-in-repo policy). Those are closed per user memory. We also do not benchmark AGF against Unity / Godot / Unreal — the question here is purely "within AGF, what slows us down".

---

## §1. Iteration loop bottlenecks

Per `CLAUDE.md` and `docs/research/dev-loop-best-practices.md`, AGF is built around the **edit → validate → run → inspect** cycle. After 150 sprints, the cycle's shape is well understood; the hot spots are clear.

### 1.1 Per-story validation cost is dominated by `npm run test`

- **Symptom** — the unit-test suite is at 1793–1794 tests (S159 note: "full suite 1793/1794, one unrelated engine-cli perf flake at 10047ms vs 10000ms budget"). Every story re-runs it. A clean run is ~25–40 s; a cold run with type-rebuild is closer to 90 s.
- **Evidence** — S147 verification: `12 new tests + 100+ existing tests + npm run typecheck + npm run test stay green`. S151: `1689/1689 vitest green`. S152: `1711/1711 vitest green`. S153: `1727/1727 vitest green`. S156: `1760/1760 vitest green`. S158: `1778/1778 full vitest suite green`. S159: `1793/1794`. The growth rate is ~5 tests/sprint.
- **What happened instead** — we rely on `npm run typecheck` plus the project-scoped vitest filter (e.g. `vitest run examples/kaboom-crew/tests/unit`) to dodge the full sweep on most stories; the full sweep runs only at sprint close.
- **What's needed** — a `vitest --changed` or git-diff-aware `npm run test:affected` script that takes the current uncommitted set + the diff vs main and runs only the tests whose dependency graph touches changed files. The vitest watch mode is close but needs an explicit "give me the green/red verdict for this branch's diff" shape suitable for the agent loop. Estimated savings: 10–20 s per story × ~8 stories/sprint = 1–2 min/sprint, plus a much faster failure signal.

### 1.2 Cold-start of the dev server is a multi-second tax

- **Symptom** — every live-debug session starts with `npm run dev` cold-start. Vite is fast but the first probe (`curl /__agf/health`) typically needs ~3 s of warm-up while the bridge attaches a page.
- **Evidence** — `docs/agent-probes.md` itself warns about `AGF_BRIDGE_PAGE_TIMEOUT` if the page didn't attach within 3 s; we hit this when the playwright probe page is launched cold. S159 + S160 + S162 + S163 all needed live probes for verification; each cycle costs ~10–15 s of wall time before the first useful curl.
- **What happened instead** — sessions keep a long-lived `npm run dev` in the background and reattach via playwright; QA + dev sometimes step on each other when both want a tab open.
- **What's needed** — a `bin/agf playwright-probe` wrapper that (a) launches dev if not running, (b) opens a page with playwright in connected-mode, (c) waits for the bridge handshake, (d) hands back a stable URL + page-id. The pieces all exist; we just keep re-implementing the launch dance per session.

### 1.3 e2e Playwright is reserved for sprint-close only

- **Symptom** — `npm run test:e2e` is listed in CLAUDE.md commands but rarely invoked mid-sprint; it lives behind preflight.
- **Evidence** — no story between S140 and S163 has a verification line starting with `e2e:` or referencing `test:e2e`. The bot-vs-bot deterministic test is the closest we have to a runtime regression net, and it's a `vitest`-driven sim not a real browser test.
- **What happened instead** — we use the lightweight live-probe playwright recipe (`docs/agent-debug-recipes.md`) for ad-hoc verification, not the formal `test:e2e` suite.
- **What's needed** — `test:e2e:smoke` (under ~10 s) covering canvas-non-blank + first-frame entity count + one probe round-trip. This lets us pull e2e into the per-story loop without paying for the full suite.

### 1.4 Sprint planning has measurable per-story overhead

- **Symptom** — every story has the same lifecycle scaffolding: `backlog:next`, `backlog:claim`, implement, `backlog:done`, `backlog:check`, `backlog:render`, commit, push.
- **Evidence** — CLAUDE.md §QA Workflow per-story sequence has 6 steps; the backlog scripts themselves add a few seconds each. The recent backlog-engine work (S015-S020 era + the JSON-first migration) has reduced this from "hand-edit BACKLOG.md" pain to "script-driven", but the per-story tax is still ~30–60 s real time.
- **What happened instead** — we batch the closing commands at the end of an implementation pass.
- **What's needed** — `backlog:done --verification "..." && backlog:check && backlog:render && git commit` as a single `backlog:ship <story-id>` wrapper. We do this manually every time; codifying it removes a 4-step ritual.

### 1.5 The `rebase off main` step is invisible until it bites

- **Symptom** — CLAUDE.md mandates `git pull --rebase origin main` at the start of every story (QA terminal lands tickets directly on main). When we forget, we discover it at push time.
- **Evidence** — multiple S150-era sprints had to redo work to absorb a QA-landed change. Not a single sprint-note line, but a real recurring tax.
- **What happened instead** — we mostly remember; when we don't, conflict resolution costs ~5 min.
- **What's needed** — a pre-claim hook in `backlog:claim` that auto-rebases. The rule is a constant; encode it.

---

## §2. Engine primitives the dev would have used but didn't have

This is the most actionable section. The pattern is identical every time: a project-side feature wants a primitive that AGF doesn't ship; we approximate in the project; the sprint notes log "engine has no X yet"; later (sometimes much later) the engine catches up.

### 2.1 World-space billboard — STILL MISSING

- **Symptom** — opponent state should telegraph spatially, above the head, not in a HUD corner.
- **Evidence** — S150 sprint notes: *"The engine has no world-to-screen / billboard primitive yet, so this sprint ships a HUD-side approximation. Same pattern S146 (conveyor belt) + S149 (warp-hole) used for their fancy shader/visual deferrals."*
- **What happened instead** — opponent state badges landed in the bottom-left HUD panel instead of above each bomber's head.
- **What's needed** — `engine/render/billboard/` per GDP-2026-05-27-008. Pure presentation primitive: attach a 2D HUD element (icon / text / mini-row) to a 3D world position, billboarded toward the camera, with sane defaults for occlusion + scale-with-distance + screen-space clamping. Status: **filed, not yet promoted**.

### 2.2 Dynamic lighting + shadow maps — STILL MISSING

- **Symptom** — every scene gets the same flat directional + ambient hemispheric lighting. No shadows. No accent lights.
- **Evidence** — GDP-2026-05-28-001 intent: *"The current renderer has 1 directional light + ambient hemispheric, NO shadow maps, NO point lights — per the original visual-style.md §4.1 ban (now softened)."* The user-memory `project-visual-fidelity-evolution.md` (2026-05-28) explicitly opened this back up. The bomb's death glow could attach a point light if the primitive existed (S137 spark-burst would be 10× more impactful with a 200ms point-flash).
- **What happened instead** — bench scenes use S70/S71 instancing for geometry; lighting is whatever the directional light gives us. Sudden-death walls (S160) emit `MeshBasicMaterial` red but cast no shadow on the floor.
- **What's needed** — `engine/render/lighting/` per GDP-2026-05-28-001. Components: `Light` (directional|point|spot, color, intensity, castShadow, shadowMapSize), `ShadowCaster` tag. Status: **filed, not yet promoted**.

### 2.3 Wang autotile primitive — STILL MISSING

- **Symptom** — every project that has a tilemap (Kaboom Crew arena, Beacon World terrain) reimplements its own per-cell mesh selection.
- **Evidence** — GDP-2026-05-28-002 (filed 2026-05-28). Kaboom Crew currently uses 1 hard-block mesh × N cells; the visual style refresh wants per-tile variety.
- **What happened instead** — flat-colour-tinted cells (S146 conveyor) + simple emissive boxes (S160 sudden-death rings).
- **What's needed** — `engine/render/autotile/` resolver + family registry + change-event subscription. Status: **filed, not yet promoted**.

### 2.4 Ragdoll module — SHIPPED LATER (S126–S137)

- **Symptom** — death animation initially shipped as a procedural-spring fake ragdoll; user feedback rejected it; full Rapier ragdoll module landed across 12 sprints.
- **Evidence** — S105 notes: *"Spring-pivot system foundation lands FIRST — both accessory sway + ragdoll flail consume it."* Later, user memory `project-ragdoll-physics-module.md` (2026-05-24): *"Ragdoll = engine physics module under engine/physics/ragdoll/ via Rapier joints, NOT procedural spring; overrides S105 spring ragdoll."* S126 (schemas + registry), S127 (Rapier adapter), S128 (spawn/sync/teardown systems), S129 (kaboom template), S130 (RagdollState rename to DeathImpulse), S131 (mesh handover), S132 (death-trigger migration), S133 (spawn pose snapshot), S134 (regression coverage), S136 (collider groups), S137 (joint anchorB correction + spark burst).
- **What happened instead (twice)** — first as a project-local spring; then re-shipped as a 12-sprint engine module. This is the canonical "engine primitive, written wrong as a project shortcut" arc and is the playbook the rest of this doc rhymes with.
- **What's needed** — the **process** lesson: when a feature smells engine-shaped (physics, lighting, billboard, autotile, particles, audio bus), do the engine module first, even at the cost of a slower first delivery. The dev-side cost of doing it twice always exceeds the cost of doing it once at the right layer.

### 2.5 Hazard-stripes / animated tile shader — STILL MISSING

- **Symptom** — conveyor belts (S146), warp holes (S149), pressure plates (S151), sudden-death rings (S160) all want a "this tile is dangerous / active" animated shader and all settle for flat colour tints.
- **Evidence** —
  - S146 notes: *"visuals use a flat colour-tinted floor instead of the proposed `hazard-stripes` scrolling shader (named in visual-style.md §3 but not yet implemented). Tint readability is enough for the playtest cycle; the shader work is deferred to a dedicated polish sprint."*
  - S149 notes: *"no warp-vortex shader (cyan / magenta / lime flat cylinders read clearly enough for playtest)."*
  - S160 notes: *"Visual is currently a flat red emissive box per spawned cell — sells the read but doesn't yet have the upward-rise tween."*
- **What happened instead** — three independent hazard modules ship with three independent flat-colour visuals. Each defers its shader story to a hypothetical polish sprint that never lands.
- **What's needed** — `engine/render/material-presets/hazard-stripes.ts` (or schema-driven shader): a tiny named set of stripe / pulse / sweep shaders that any project can attach via `MeshRenderer.materialPreset: 'hazard-stripes'`. A 1-day engine spike unlocks 4+ project polish wins.

### 2.6 Tile-grid spawn-clear primitive — PROJECT-LOCAL EVERY TIME

- **Symptom** — every grid-based hazard re-implements "clear whatever was on this cell". Sudden-death (S160), pressure plate (S151), conveyor (S146) each have their own bomber-kill + entity-remove logic.
- **Evidence** — S160 notes: *"Each spawned cell: BomberStats.alive=false for occupants, removeEntity for bombs/pickups, then create a fixed-body GridOccupant(wall) hard-block."* S151 notes: spawn-bomb action emits a fully-formed Bomb entity. The shapes overlap but no shared helper exists.
- **What happened instead** — N copies of `clearCellOccupants(cell)`.
- **What's needed** — `engine/core/systems/grid/cell-utilities.ts`: `clearCell({ killBombers?: bool, removeBombs?: bool, removePickups?: bool })`. Promote from kaboom-crew + reuse across hazards.

### 2.7 Region / zone primitive — STILL MISSING (the multi-call gap)

- **Symptom** — DynaBomber readiness analysis §14 already flagged this: *"Sector modifiers — no region/zone primitive. Today components attach to entities, not to map regions."* Sudden-death (S160) approximates with N hard-block cells. Conveyor (S146) approximates with N tagged cells.
- **Evidence** — `notes/dynabomber-readiness-analysis.md` §14: *"New §9 item: region rule primitive."*
- **What happened instead** — region-shaped behaviour is encoded by tagging individual cells. Works for grid-based, falls apart for continuous regions (fog-of-war, network relevance, area-of-effect).
- **What's needed** — `engine/core/components/region.ts`: `Region { shape: rect|polygon|disc, layer }` + `RegionRuleSystem`. Single primitive feeds fog-of-war, relevance, area effects, AOI culling.

### 2.8 Procedural mesh variety helper — STILL MISSING

- **Symptom** — every bomber, every bot, every soft block looks the same.
- **Evidence** — GDP-2026-05-28-003 intent (filed 2026-05-28).
- **What happened instead** — Kaboom Crew bombers use the S106 accessory layer + S139 palette overrides for variety; the world geometry stays mono.
- **What's needed** — covered jointly by §2.3 (Wang) + a "procedural-block-variant" helper.

### 2.9 Camera-follow + camera-orthographic — SHIPPED LATER (S163)

- **Symptom** — DynaBomber readiness analysis §1: *"Angled top-down follow camera ... There is no 'damped follow with look-ahead' component/system."*
- **Evidence** — S163 finally landed camera-follow + arena clamping + view-size override — 145 sprints after the readiness analysis flagged it as a Sprint-1 prerequisite. It lives in `examples/kaboom-crew/src/systems/`, project-local rather than `engine/render/systems/` (which is where the readiness analysis recommended).
- **What happened instead** — every project that needed a follow camera up to S163 wrote its own; Kaboom Crew kept a fixed orthographic frame for 100+ sprints.
- **What's needed** — promote the S163 system to `engine/render/systems/camera-follow-system.ts`. The math is purely generic; the project-local home was a velocity choice during S163, not a permanent architectural call.

### 2.10 Audio bus / 3D positional audio — PARTIAL

- **Symptom** — Kaboom Crew ships its own `audio-fx.ts` graph + voice synth (S109 → S158 iterations). DynaBomber readiness analysis §6: *"3D positional audio ❌ — No audio system in AGF."*
- **Evidence** — voice synth went through three playtest iterations in S158 alone (user feedback in sequence: "no vocaloid feel", "death and bomb-place sounds are nearly identical", "death and victory need more punch" — see S158 notes for the verbatim Russian originals). Three round-trips because the project-local audio layer has no engine-side mixer / bus / spatialization to lean on; we're tuning gain numbers by ear in user-feedback loops.
- **What happened instead** — voice + footsteps + bomb-place all live in one project-local `audio-fx.ts` head gain; tuning one knob affects all three.
- **What's needed** — `engine/audio/` minimal bus: `AudioSource` component (Web Audio AudioBufferSourceNode or OscillatorNode handle) + `AudioListener` (one per scene) + per-bus master gain. Pure presentation primitive; doesn't touch determinism.

### 2.11 HUD / DOM widget runtime — PARTIAL

- **Symptom** — Kaboom Crew has accumulated a substantial HUD: power-up grid (S148), pickup tooltip (S148), opponent badges (S150), unlock banner (S156), lifetime stats (S155), icon tooltips with hover delegation (S161), dash cooldown ring (S159).
- **Evidence** — bootstrap.ts is the de-facto HUD orchestrator (re-read S148 + S153 sprint notes: store hoisting, widget id registration, per-frame snapshot diffs).
- **What happened instead** — all DOM widget plumbing lives in `examples/kaboom-crew/bootstrap.ts` + `examples/kaboom-crew/src/hud/`. Beacon World re-implements an entirely different DOM HUD path for HP/SIG.
- **What's needed** — `engine/runtime/ui/` widget registry (id + slot + content fn + lifecycle hooks). Promote the slot grid (topLeft / topCentre / topRight / center / bottomLeft / bottomCentre / bottomRight) + the registry from kaboom-crew. Even a thin promote unlocks "register a widget" as a one-liner across projects.

### 2.12 Tween + spring primitives — SHIPPED early, under-discovered

- **Symptom** — S105 KABOOM-SPRING-PIVOT-SYSTEM shipped a generic spring-damped angular pivot system that landed in `examples/procbomber-bench/src/systems/`. Subsequent sprints (S106 accessories, S132 ragdoll mesh-handover, S162 accessory detach) all reach for it; some find it, some reinvent.
- **Evidence** — S162 accessory-detach-system is a fresh project-local kinematic integrator that duplicates much of the spring-pivot system's tick semantics (position += velocity·dt; vy -= g·dt) instead of leaning on the existing helper.
- **What happened instead** — secondary motion gets duplicated.
- **What's needed** — the spring + tween primitives need a clear discovery path. A `docs/engine-primitives.md` index ("here is everything in engine/, here is everything in examples/<project>/ that has been promoted") would have prevented the S162 reimplementation. **This is a documentation gap, not a primitive gap.**

---

## §3. Tooling shortcuts the dev wishes existed

The "would shave 10 minutes per sprint" list. These are mostly scripts + agent-friendly affordances.

### 3.1 `propose:promote` script — MENTIONED IN CLAUDE.md, STATUS UNCLEAR

- **Symptom** — promoting a GDP from `backlog/proposed-stories/` into a sprint JSON is still hand-written (copy text, paste into stories[], delete original, archive original).
- **Evidence** — CLAUDE.md mentions `npm run qa:promote -- --into S<new>` for QA tickets. Same shape for GDPs is **not** scripted.
- **What's needed** — `backlog:promote --gdp GDP-2026-05-27-005 --into S150` that (a) reads the GDP, (b) generates skeleton stories[] from acceptanceHints[], (c) moves the GDP file to `backlog/proposed-stories/archive/S150/`, (d) commits with a stable message. Currently 5+ minutes of manual JSON shuffling per promotion × 1–2 promotions per sprint = 10+ min/sprint.

### 3.2 `backlog:check` performance — UNMEASURED

- **Symptom** — `backlog:check && backlog:render` runs at every story completion (CLAUDE.md mandate). It's perceived fast but is unmeasured.
- **Evidence** — no story-level note has flagged it as slow yet; the agent currently invokes it implicitly.
- **What's needed** — instrument `backlog:check` with an `--bench` flag printing per-validator time. Pre-empt the day it becomes "slow enough to skip". The cost of skipping `backlog:check` once and shipping a broken JSON is high (CI fails the sprint PR).

### 3.3 Scene authoring is JSON-by-hand

- **Symptom** — every new arena variant is hand-edited JSON. `belt-zone.scene.json` (S146), `warpfield.scene.json` (S149), `plate-puzzle.scene.json` (S151) all hit the same paste-from-template-fix-cells flow.
- **Evidence** — S146 SCHEMA-KABOOM-CONVEYOR-001: hand-authored cell coordinates. S151 same shape. S149 same shape. We re-derive cell coordinates against a 15×11 grid by mental arithmetic.
- **What happened instead** — copy a prior scene, edit cells, run `engine:check`, iterate.
- **What's needed** — `engine:scene scaffold --grid 15x11 --pillars corners --softblocks 8 --players 4` → emits a valid scene JSON. Even a 50-line script saves us a recurring tax. **Note:** there's an inspector (`engine:inspect`), but no inverse "generate me a minimal scene".

### 3.4 Schema diff tooling — MISSING

- **Symptom** — schema changes ripple. `scene-extensions.schema.json` is touched in roughly half of all Kaboom Crew sprints (S138, S144, S146, S149, S151, S152, S156, S158, S159, S160, S162 — just from the recent window).
- **Evidence** — no story has surfaced a friction yet, but the schema file is approaching ~1500 lines and grows each sprint.
- **What's needed** — `engine:schema diff main HEAD` printing the added / removed / modified fields. Pre-empt the day a schema collision happens silently.

### 3.5 Shader hot-reload — NOT WIRED

- **Symptom** — material JSON HMR exists for engine materials (`runtime/materials/*.material.json`); shader files (`.frag` / `.vert`) require a full reload.
- **Evidence** — `docs/research/dev-loop-best-practices.md`: *"Scene JSON HMR should compile to command patches, not full reload by default."* Implied but not realised for shaders.
- **What happened instead** — when a hazard-stripes shader DOES eventually land, we'll spend half its sprint iterating on full-reload cycles.
- **What's needed** — `runtime/materials/*.material.json` HMR is wired; extend to per-shader-source HMR via the Vite plugin.

### 3.6 The `/loop` skill is generic; we want a "babysit-sprint" loop

- **Symptom** — running the per-story workflow involves 6 commands (claim → implement → done → check → render → commit). The `/loop` skill can run a recurring prompt; we don't have a skill that knows the sprint-loop shape specifically.
- **Evidence** — see CLAUDE.md "Per-story sequence on this terminal".
- **What's needed** — a `babysit-sprint` skill that picks next, claims, drops control to the agent, then auto-finalises. Pure shell glue; high ergonomic payoff.

### 3.7 `engine:inspect` is read-only

- **Symptom** — `engine:inspect examples/kaboom-crew` prints scene + component structure. There's no inverse "set this component" CLI.
- **Evidence** — for runtime mutation we use `/__agf/component` POST. For pre-runtime mutation (e.g. "before launching the dev server, override the bomber's startCell to (3,3)"), we hand-edit the scene JSON.
- **What's needed** — `engine:set examples/kaboom-crew --entity player.1 --component GridPosition --value '{"gx":3,"gz":3}'` writing back into the scene JSON or a project-scoped override file. Saves ~2 min per debugging session.

### 3.8 Per-sprint summary doctor doesn't trend

- **Symptom** — `engine doctor` reports a snapshot ("Ragdoll templates: N", "QA inbox: M"). Nothing accumulates trend ("tests grew by 12 this sprint", "schema fields grew by 4", "lines of `examples/kaboom-crew/bootstrap.ts` grew by 38").
- **Evidence** — see S126 FEAT-RAGDOLL-REGISTRY-DOCTOR-001 — the doctor signal exists; we don't trend it.
- **What's needed** — `engine doctor --vs main` printing deltas. Catches "this sprint added 200 lines to bootstrap.ts; consider extraction" before the file becomes unmanageable.

### 3.9 Recipe seed → preview screenshot — MISSING

- **Symptom** — character recipes are deterministic from a seed (S109 + voice synth research). When we want to see what a seed looks like, we launch the bench manually.
- **Evidence** — `examples/procbomber-bench` exists for this purpose. There's no CLI shortcut.
- **What's needed** — `engine:character-preview --seed 12345 --out .agent/screenshots/seed-12345.png`. Useful for sprint notes; useful for GDP authors; useful for explaining bot personality assignment.

---

## §4. Test infrastructure gaps

### 4.1 `bot-vs-bot.test.ts` is the canary but covers a narrow shape

- **Symptom** — the deterministic bot-vs-bot regression catches gross sim breakage but misses subtle ones (movement timing, animation tween timing, audio fire ordering).
- **Evidence** — S141 had to update bot-vs-bot to handle multi-bot. S154 had to retool a hunter-routes regression test because the new bomb-block rule blocked the bot's previously-valid path.
- **What happened instead** — we patch the canary test as the sim shifts; signal degrades over time.
- **What's needed** — a **second** kind of regression test: snapshot-based. After 5 seconds of deterministic play, snapshot the world; compare it against a recorded golden snapshot. The recording subsystem (`POST /__agf/recording/start`) already gives us the inputs; we just need the snapshot comparator.

### 4.2 Manual playtest steps appear in too many sprints

- **Symptom** — `Live playtest verified: ...` (S159), `Live probe confirmed ...` (S160), `Live probe with ?suddenDeathTriggerS=3 confirmed ...` (S162).
- **Evidence** — almost every gameplay-touching sprint since S140 has a manual live-probe line in the notes. The expectation is the agent ran a playwright headed probe + read the snapshot.
- **What happened instead** — the agent reads `/__agf/snapshot` after manually pressing Space etc. The verification is non-reproducible (no recorded inputs).
- **What's needed** — convert these to recorded fixtures. Whenever a sprint note says "live probe", we should be writing a `playtest-recording.json` to `examples/kaboom-crew/playtests/` and committing it. The recording API exists; the workflow isn't yet ritualised.

### 4.3 Unit-test flakes don't have a stable home

- **Symptom** — S159 note: *"one unrelated engine-cli perf flake at 10047ms vs 10000ms budget"*. We routinely accept "1 flake" as a non-blocker.
- **Evidence** — same shape recurs every few sprints.
- **What's needed** — a `.flaky-tests.json` registry the test runner reads + a CI policy "flakes are allowed to fail twice before blocking". Codify what we already do informally.

### 4.4 Recording-replay determinism is unproven against gameplay scale

- **Symptom** — DynaBomber readiness analysis §8: *"Determinism (replay, validation) 🟨 — recording system exists; deterministic seed-driven generation needs to be added."* That gap is unclosed.
- **Evidence** — no sprint has produced a replay that diff-verifies against a re-run of itself for a long match. Recording is used as a capture mechanism, not yet as a determinism contract.
- **What happened instead** — we trust per-frame fixedUpdate semantics + seeded RNG without an end-to-end determinism gate.
- **What's needed** — a `npm run test:replay` step that picks a recording, runs it twice, asserts world-snapshot equality at the end. Costs ~1 day to wire; bounds the determinism contract forever.

### 4.5 Server-vs-client parity tests are written by hand each time

- **Symptom** — every multiplayer parity sprint duplicates the work. S147 pierce parity, S154 bomb-pass parity, GDP-2026-05-27-010 enumerates 4 more.
- **Evidence** — S147 notes: *"Before this lands, connected-mode pierce is a visual desync — Tab A's local sim shows the blast walking through the first soft block, Tab B's authoritative server view stops at it."* S154 same shape for bomb-pass.
- **What happened instead** — duplicated walker + duplicated unit tests on both sides.
- **What's needed** — a `tests/parity/` directory with a `runParity({ scene, inputs, clientSystem, serverSystem })` harness. We've now seen the shape often enough to extract it.

### 4.6 Test names rarely encode the contract

- **Symptom** — `1689/1689 vitest green` is what we read; "what did test 1689 cover?" is not.
- **Evidence** — per-test grep is fine but the inverse mapping (this sprint's stories → these tests cover them) doesn't exist.
- **What's needed** — `acceptance:` lines in sprint stories are the contract; a script could grep test names against acceptance lines + warn on orphans. Low-priority polish.

---

## §5. Diagnostic + probe surface

`docs/agent-probes.md` is the catalogue. Reading it through the lens of the last 30 sprints reveals where we'd have used a probe that doesn't exist.

### 5.1 Recipe state inspection — MISSING

- **Symptom** — when debugging the procedural bomber visual, the only way to see the recipe is to dump the entity's components and read the recipe JSON manually.
- **Evidence** — S109 voice synth + S139 personality + S156 cosmetic unlock all touch recipe state. No probe surfaces it.
- **What's needed** — `GET /__agf/kaboom/recipe/<entityId>` returning the parsed CharacterRecipe + applied accessories + palette + voice colour. Project-local probe; small extension to `__agf.kaboom.*`.

### 5.2 Ragdoll body listing — MISSING

- **Symptom** — when the ragdoll glitches (joint jitter, body fly-away), there's no way to enumerate the live Rapier bodies + joints from the agent surface.
- **Evidence** — S137 joint anchorB correction was diagnosed via reading the spawn-system source + injecting console logs. No probe.
- **What's needed** — `GET /__agf/ragdoll/bodies` listing every live ragdoll's body entity ids + joint entity ids + current Transforms + the corrected anchorB values. Single biggest visibility multiplier for any future ragdoll bug.

### 5.3 Conveyor belt / pressure plate / warp pair occupancy — MISSING

- **Symptom** — debugging hazard tiles requires reading the world snapshot + manually iterating entities to find which ones are on a belt cell.
- **Evidence** — S146 + S149 + S151 each have unit tests but no live introspection probe.
- **What's needed** — generic `GET /__agf/grid/cell/<gx>/<gz>` returning the occupants of a cell + any tagged hazard component present. Single primitive covers all three hazards + future ones.

### 5.4 Multiplayer snapshot diff — MISSING

- **Symptom** — server state vs client state diff is currently "diff two JSON files manually".
- **Evidence** — S147 + S154 parity work would have benefited.
- **What's needed** — `GET /__agf/network/snapshot-diff` comparing live world snapshot against the last received server snapshot. Returns the per-entity diff. Single biggest multiplayer debugging win.

### 5.5 Event timeline / signal log — PARTIAL

- **Symptom** — diagnostics + console log are independent. There's no unified "what fired this tick?" timeline.
- **Evidence** — `GET /__agf/events` is SSE diagnostics; `GET /__agf/console-log` is browser console. Audio events, scheduler events, command events all live in separate places.
- **What's needed** — a single "tick log" probe: `GET /__agf/tick-log?since=N` returning a unified ordered list of `[tick, source, kind, payload]` entries. Pin signal-flow bugs in minutes instead of hours.

### 5.6 Power-up state probe — PARTIAL (kaboom-only)

- **Symptom** — `__agf.kaboom.tooltipFor()` exists (S161); `getProfile()`, `getUnlocks()`, `forceUnlock()`, `setProfileStats()`, `resetProfile()` exist (S153 + S156). But to inspect "what power-ups does player.1 currently have", we still go through the BomberStats component.
- **Evidence** — when debugging the bomb-pass baseline (S152) we read BomberStats.bombPass via the component probe; that worked but exemplified the pattern of "component probe is generic; we keep needing project-specific roll-ups".
- **What's needed** — `__agf.kaboom.statsFor(entityId)` returning the normalised power-up + cooldown payload. Low-effort glue, big habit-of-mind win.

### 5.7 Time-travel inspection works; doesn't support diff

- **Symptom** — `?at=-N` history works (S95 / S97). To diff "what changed between two ticks" requires two curls + manual `jq`.
- **Evidence** — `docs/agent-probes.md` recipe: *"Diff live vs. one tick ago: diff <(curl ...?at=0) <(curl ...?at=-1)"*.
- **What's needed** — `GET /__agf/snapshot-diff?from=-2&to=0` returning the structured per-entity diff. Server-side diff is small but high-leverage.

### 5.8 Probe surface is read-heavy; writes are pattern-driven

- **Symptom** — `POST /__agf/component/...`, `POST /__agf/entity`, `POST /__agf/input/action` all exist. Higher-level write patterns (e.g. "kill all bots", "give player.1 every power-up", "respawn the round") don't.
- **Evidence** — we re-author these commands per session.
- **What's needed** — project-local sugar via `__agf.kaboom.cheats`: `killAllBots()`, `maxPowerups('player.1')`, `restartRound()`. Cheap glue; reduces test-fixture time materially.

---

## §6. Schema + validation friction

`scene-extensions.schema.json` is the engine-validated source of truth for Kaboom Crew's project-local components. After ~30 component additions, the patterns are visible.

### 6.1 Adding a component is a 4-file change

- **Symptom** — every new component touches: (1) the schema, (2) the project type alias, (3) the system that reads/writes it, (4) the unit test. The wiring is mechanical; we re-type it every time.
- **Evidence** — S144 SCHEMA-KABOOM-THROW-001 touches scene-extensions.schema.json + multiple systems. S146 + S149 + S151 same shape. S160 + S162 + S159 same shape.
- **What happened instead** — copy-paste from a prior similar component, rename, edit.
- **What's needed** — `engine:scaffold component --project kaboom-crew --name PressurePlate --fields plateId:int triggerAction:'spawn-bomb' cooldownMs:int(500..5000)` → emits schema entry + type alias + empty unit test. Saves 10+ min per new component × N per sprint.

### 6.2 Runtime-only fields ride alongside data fields

- **Symptom** — components like `ConveyorBelt` mix authored data (`directionDx`, `speedMs`) with runtime accumulator state (`elapsedMs`). PressurePlate has `lastTriggerAt`. WarpHole has `lastWarpAt`.
- **Evidence** — S146, S149, S151 all do this. Schema marks runtime fields as `optional` but the convention isn't enforced.
- **What happened instead** — we annotate via field-name convention (lastXxxAt, elapsedXxx, internal).
- **What's needed** — schema-level `"x-runtime": true` annotation + validator rule "if x-runtime, must be optional; project source files should never set these". Catches the day someone writes a runtime field into an authored scene by mistake.

### 6.3 Transient request components leak structure

- **Symptom** — `PickupBombRequest`, `ThrowBombRequest`, `DashRequest`, `RagdollSpawnRequest`, `RagdollTeardownRequest` all follow the same "transient consumed-by-system, cleared next frame" shape. Each is a one-off schema entry.
- **Evidence** — S144 + S159 + S126 + S128 all add these.
- **What happened instead** — copy-paste the schema entry, rename.
- **What's needed** — `transientRequestComponentTemplate` in the schema layer + a `Transient<T>` discriminator. Reduces both authoring time and the chance of mis-wiring (e.g. forgetting to clear the request).

### 6.4 Schema versioning is uneven

- **Symptom** — `profile-store.ts` has `PROFILE_FORMAT_VERSION = 2` + migration (S156). Most schemas have no version field.
- **Evidence** — S156 SCHEMA-KABOOM-PROFILE-V2-001 ships in-place v1→v2 migration. No other schema does.
- **What happened instead** — incompatible schema changes break tests immediately and we fix them inline; no production runtime data was migrated.
- **What's needed** — engine policy: every schema-backed runtime store carries a `formatVersion` field + a migration registry. Cheap to add early, painful to retrofit later (we got lucky with S156 because localStorage is per-user).

### 6.5 Cross-cutting schema fields don't have a shared definition

- **Symptom** — `cooldownMs` shows up on PressurePlate (S151), DashRequest's BomberStats fields (S159), WarpHole (S149). Each redefines its own integer-with-min-max.
- **Evidence** — recurring shape.
- **What's needed** — `schemas/definitions/common.json` with `durationMs`, `gridCoord`, `palette`, `entityRef`. Single ROOT for the small numeric ranges + types that recur.

### 6.6 `engine:check` runs the schema; tests run the runtime. Drift is possible.

- **Symptom** — a schema may accept a shape the runtime can't actually use, or vice versa.
- **Evidence** — no concrete incident yet; the shape is similar to "production reads JSON that schema accepts but TS types reject".
- **What's needed** — `engine:check --strict` that also typechecks every scene JSON against the generated TS types. Pre-empts a class of subtle bugs.

---

## §7. Multiplayer dev tools

Multiplayer is the youngest subsystem. The connect-and-spectate slice landed S109 (per `docs/research/kaboom-multiplayer-plan.md`); since then we've ported pieces one at a time (S147 pierce, S154 bomb-pass, GDP-2026-05-27-010 outlines the remaining 4).

### 7.1 Two-tab dev requires manual orchestration

- **Symptom** — every multiplayer story requires "open tab A as player.1, open tab B as player.2, run the dev server". The shell ritual is identical every time.
- **Evidence** — S147 + S154 verification both depend on this manual setup.
- **What's needed** — `npm run dev:multiplayer` that launches the dev server + 2 playwright tabs with predetermined `?playerId=` query params. Pure ergonomics.

### 7.2 Snapshot diff visualisation — MISSING

- See §5.4. Largest single multiplayer dev tool gap.

### 7.3 Latency / packet inspector — MISSING

- **Symptom** — there's no introspection on the actual WS traffic. Snapshots are visible (we apply them); we can't see "how big was the last snapshot in bytes / how often is the server emitting them".
- **Evidence** — netcode-rework-investigation.md flags relevance + tickrate as future work; no diagnostic surface yet.
- **What's needed** — `GET /__agf/network/stats` returning lastSnapshotBytes, snapshotsPerSec, lastPingMs, packetLoss. Single probe; high diagnostic value.

### 7.4 Server-side hot-reload — MISSING

- **Symptom** — every server-side change requires restarting `node-world-server`. Disconnects all tabs.
- **Evidence** — S147 + S154 implementation cycles included multiple `node --watch` restarts.
- **What's needed** — `tsx --watch` or similar on the server entry + a soft-reconnect on the client adapter. Existing precedent in many node ecosystems.

### 7.5 Snapshot replay against the server — MISSING

- **Symptom** — for parity testing, we re-implement scenarios twice (once client-side, once in `node-world-server-map.test.ts`). The test setup is similar but not shared.
- **Evidence** — S147 + S154 both have `tests/unit/node-world-server-map.test.ts` parallel to the client tests.
- **What's needed** — a shared scenario fixture format (`tests/scenarios/*.scenario.json`) consumed by both client and server harnesses. Reduces duplication; tightens the contract.

### 7.6 Bot AI in connected mode is single-server-bot

- **Symptom** — S141 multi-bot solo works; connected mode keeps a single server-owned bot. GDP-2026-05-27-003 (Multi-bot in connected mode) is unresolved.
- **Evidence** — S141 notes: *"Connected mode keeps the single server-owned bot path (server-side AI doesn't know about local multi-bot)."*
- **What's needed** — covered by GDP-2026-05-27-003. Note for retrospective: this is the kind of gap where the GDP is filed but the cost is real and recurring (every multiplayer playtest is 1v1, not the 1v3 the solo mode showcases).

### 7.7 Joining mid-match is unspecified

- **Symptom** — what happens when tab B joins after tab A's round has started? Bot AI, pickup spawn, sudden-death timing — all are unclear.
- **Evidence** — no sprint has tested this. The protocol assumes player.join arrives early.
- **What's needed** — a documented "rejoin / late-join" contract + a test scenario covering it. Architectural work; estimated medium.

---

## §8. Visual debug overlays

When shader / lighting / animation bugs surface, what would have helped?

### 8.1 Bounding-box overlay — MISSING

- **Symptom** — debugging ragdoll bodies (S137) and accessory debris (S162) needed manual reasoning about world-space extents.
- **What's needed** — `POST /__agf/render/debug-mode {"mode":"bounding-boxes"}` (extend the existing `wireframe`/`unlit-white`/`normals`/`uv` set) that draws bounding boxes for every Collider3D. Trivially wireable into the existing override path.

### 8.2 Light frustum / shadow-map preview — MISSING

- **Symptom** — when lighting lands (GDP-2026-05-28-001), shadow-map debugging will be critical. There's no plan yet.
- **What's needed** — when lighting lands, ship a `mode: 'light-frustums'` override that draws each light's influence volume + a `mode: 'shadow-map'` mode that renders the shadow texture to a corner inset.

### 8.3 Performance-cell heat map — MISSING

- **Symptom** — when a sprint adds 4 hazard systems (S146 + S149 + S151 + S160), no single overlay says "this region of the arena is doing 90% of the work".
- **Evidence** — DynaBomber readiness analysis §6: *"60 fps target, 3×3 chunks visible ✅ for static scenes; ⚠ at gameplay scale."*
- **What's needed** — `POST /__agf/render/debug-mode {"mode":"perf-heatmap"}` colouring grid cells by their per-tick CPU + GPU cost. Late-game perf-debugging multiplier.

### 8.4 Snapshot-history scrubber — MISSING

- **Symptom** — `?at=-N` history is curl-accessible (S95) but not visual. To watch a 32-tick rewind you script 32 curls + render manually.
- **What's needed** — a corner DOM widget (URL flag `?historyScrubber=on`) with a slider 0..-31 that re-renders the world from the history ring. Pure presentation, no protocol change.

### 8.5 Pivot / joint visualisation — MISSING

- **Symptom** — bench character bench (`procbomber-bench`) shows the bomber's mesh but not its LimbPivots. Debugging accessory mounts (S106) and ragdoll bones (S128+) requires reading the recipe + running the sim.
- **What's needed** — `POST /__agf/render/debug-mode {"mode":"pivots"}` drawing a coloured cross for every pivot entity + a labeled axis triad for ragdoll bodies. Single-day spike; payoff across every future character-system sprint.

### 8.6 Voice synth visualiser — MISSING

- **Symptom** — voice synth went through 3 playtest iterations in S158 because we tune by ear without a visual readout of the generated envelope.
- **Evidence** — S158 notes: 3 commits in one sprint because each iteration needed a user-language playtest pass.
- **What's needed** — `__agf.kaboom.voice.previewWaveform(seed, slot)` returning a base64 PNG + a tiny waveform overlay. Cuts the user-feedback loop in half.

---

## §9. AI-assisted dev (the meta-meta)

What could `engine doctor` (existing) or future tools surface that would let the dev agent self-correct faster?

### 9.1 The "I shipped Y twice" pattern

- **Symptom** — the spring-pivot system (S105) and the accessory-debris integrator (S162) are independently-written kinematic loops with overlapping semantics. We didn't notice the duplication at S162 commit time.
- **Evidence** — same as §2.12.
- **What's needed** — a doctor check "primitive collision" — for every newly-added system file, grep the codebase for similar function signatures + flag if the new file replicates ≥3 fixedUpdate semantics from an existing system. Even a fuzzy match catches the most obvious cases.

### 9.2 Doctor flagged X but I missed it

- **Symptom** — doctor's `Ragdoll templates: N` line is informational, not actionable. It's easy to skip when output is long.
- **Evidence** — doctor was extended in S126 FEAT-RAGDOLL-REGISTRY-DOCTOR-001 to surface the registry; reading it depends on the agent looking at the full doctor output every sprint.
- **What's needed** — doctor should support a `--warnings-only` mode that suppresses all-OK lines + a CI-style "X warnings flagged" summary. Agent-friendly default; opt-out for humans.

### 9.3 Sprint-note tone analysis

- **Symptom** — sprint notes routinely contain "engine has no X yet", "deferred to follow-up", "tracked as a follow-up GDP", "scope simplification vs the GDP spec". Each one is a future-engine-gap signal; we don't aggregate them.
- **Evidence** — see §0 — this entire retrospective is the manual version of that aggregation.
- **What's needed** — `npm run backlog:retro-scan` grepping sprint notes for the canonical phrases + producing a markdown table by sprint. Could feed the next iteration of this retrospective directly. Cheap script; pays back at the next retrospective in 50 sprints.

### 9.4 GDP → sprint scope-delta auditor

- **Symptom** — GDPs frequently undergo scope cuts during sprint promotion. S144 dropped long-press Space → T key; S146 dropped hazard-stripes shader → flat tint; S150 dropped world-space billboard → HUD panel.
- **Evidence** — every "Scope simplification vs the GDP spec" note in §2.
- **What's needed** — at sprint close, a `backlog:scope-delta <gdp-id> <sprint-id>` script that prints the diff between GDP intent and shipped sprint notes. Forces a deliberate decision to log the deferral as a follow-up GDP instead of letting it float.

### 9.5 Self-evaluation loop for the dev agent

- **Symptom** — this retrospective is the first formal output of the kind. The GDP itself notes that the cadence should be every ~50 sprints.
- **Evidence** — GDP-2026-05-28-009 acceptanceHints §FOLLOW-UP CYCLE.
- **What's needed** — codify the cadence: open a placeholder story `RETRO-S<N+50>` at sprint S164 close, dated for S214.

### 9.6 Conversation language vs repo language enforcement

- **Symptom** — the user memory says Cyrillic in chat is fine, English in repo is mandatory; we have a CI check for the latter (`repo-hygiene.yml` per user memory). The agent has internalised the rule but it took multiple corrections in the early sprints.
- **Evidence** — `project-pending-cyrillic-check.md` memory line.
- **What's needed** — already shipped via CI; mention only because it's a process-success the retrospective should acknowledge.

### 9.7 Skills inventory drift

- **Symptom** — there are 22 skills available in this terminal (per the system-reminder list). Most sprints use 0–2 of them. We forget the rest exist.
- **What's needed** — at sprint close, a doctor section listing skills that haven't been used in 30+ days. Either retire them or remind ourselves what they're for.

---

## §10. Recommendations + priority ranking

Each entry: severity (blocking / slowing / minor) × close-cost (S / M / L) × payoff (per-sprint time saved or quality dimension) × cross-ref to existing GDPs.

### Ranked Top 10 (payoff / cost)

#### #1 — World-space billboard primitive

- **Severity:** slowing.
- **Close-cost:** M (already scoped in GDP-2026-05-27-008).
- **Payoff:** unblocks opponent badges (§2.1), enables nameplates + damage numbers + objective markers in any future project. Quality axis: **Visual Readability** (`docs/QUALITY_AXES.md`).
- **Cross-ref:** GDP-2026-05-27-008 (filed). **Promote next sprint.**

#### #2 — Engine lighting + shadow primitive

- **Severity:** slowing (visual-fidelity refresh is now in scope per user memory 2026-05-28).
- **Close-cost:** L.
- **Payoff:** unlocks every visual polish sprint downstream — bomb glow, hazard-stripe shaders, accent lighting, shadow-readability for the cute-character direction. Quality axis: **Visual Readability**.
- **Cross-ref:** GDP-2026-05-28-001 (filed).

#### #3 — Wang autotile primitive

- **Severity:** slowing.
- **Close-cost:** M.
- **Payoff:** finally enables per-tile variety in arenas (currently flat colour blocks); paired with §2 lighting refresh, completes the visual fidelity story. ~3 future visual sprints depend on it.
- **Cross-ref:** GDP-2026-05-28-002 (filed). Pairs with GDP-2026-05-28-003 (per-tile mesh variety) + GDP-2026-05-28-004 (Kaboom Crew integration).

#### #4 — Snapshot-diff probe for multiplayer

- **Severity:** slowing.
- **Close-cost:** S.
- **Payoff:** 30+ min/sprint during multiplayer parity work × 4 outstanding parity ports in GDP-2026-05-27-010. Quality axis: **World Contract Health**.
- **Cross-ref:** none filed; this retrospective should produce it.

#### #5 — Scene + component scaffolder

- **Severity:** slowing.
- **Close-cost:** S.
- **Payoff:** ~10 min/sprint × every sprint that adds a new project component (most of them). The mechanical 4-file change pattern (§6.1) is ripe for automation. Quality axis: **Build Health** (fewer typos).
- **Cross-ref:** none filed.

#### #6 — Engine ragdoll-style promotion of camera-follow + spring-pivot + HUD widget runtime

- **Severity:** slowing.
- **Close-cost:** M (three small promotions in one sprint).
- **Payoff:** removes the discovery-gap that produced §2.9 (camera) + §2.11 (HUD) + §2.12 (spring-pivot duplication in S162). Quality axis: **Build Health**.
- **Cross-ref:** none filed; aligns with CLAUDE.md "engine ships only generic primitives + reusable systems".

#### #7 — Hazard-stripes shader preset set

- **Severity:** slowing (visual fidelity).
- **Close-cost:** S.
- **Payoff:** unlocks the deferred visual stories for S146 conveyor, S149 warp, S151 plate, S160 sudden-death — four sprint-notes of deferred polish would close in one engine-side spike. Quality axis: **Visual Readability**.
- **Cross-ref:** mentioned in `visual-style.md §3` (per S146 notes).

#### #8 — Recorded-input regression fixtures

- **Severity:** slowing.
- **Close-cost:** M.
- **Payoff:** every "live playtest verified" line in S159 / S160 / S162 / S163 converts to a reproducible test. Tightens the bot-vs-bot canary into a full snapshot-vs-golden regression matrix. Quality axis: **Playability**.
- **Cross-ref:** none filed.

#### #9 — Project-local sugar probes (statsFor / cheats / recipeFor)

- **Severity:** slowing (test-fixture time).
- **Close-cost:** S.
- **Payoff:** halves the curl-and-grep ritual in any debugging session. Quality axis: **Runtime Health**.
- **Cross-ref:** none filed; small enough to bundle with the next kaboom-crew polish sprint.

#### #10 — `backlog:promote` script + scope-delta auditor

- **Severity:** minor.
- **Close-cost:** S.
- **Payoff:** ~10 min/sprint during GDP promotion (§3.1) plus a stronger paper trail for deferred scope. Quality axis: **none direct** — process win.
- **Cross-ref:** mentioned in CLAUDE.md (qa:promote exists; gdp:promote does not).

---

### Just-below-the-Top-10 (worth noting)

- Server-side hot-reload (§7.4) — high value during multiplayer work, but only blocks two recent sprints.
- Voice synth visualiser (§8.6) — high value only during voice tuning; one-off.
- Bounding-box / pivot debug-mode overrides (§8.1, §8.5) — easy adds to an existing probe.
- Snapshot-history scrubber DOM widget (§8.4) — nice for QA terminal; medium for dev.
- Tick-log unified probe (§5.5) — would matter the day a tricky signal-flow bug surfaces; currently we get by.
- Audio bus / engine audio primitive (§2.10) — large lift, real value, but blocks only when a second project needs audio.

### Lessons that don't have a story shape

- **The ragdoll arc (§2.4) is the canonical playbook.** When a feature smells engine-shaped, do the engine first. The kaboom-crew RagdollState → DeathImpulse rename (S130) was the moment we admitted we'd taken the wrong path; another sprint would have been wasted without it.
- **Sprint notes are the most accurate gap signal we have.** Every "engine has no X yet" line in a sprint note is a future story file. The `backlog:retro-scan` idea (§9.3) is small but high-leverage.
- **HUD widget proliferation is reaching a tipping point.** bootstrap.ts in kaboom-crew is approaching a size where the next HUD widget should be the moment we extract a runtime/ui module. Tracked under §6 of the §10 ranking.
- **GDP scope-delta is real and persistent.** Looking at S144 (long-press → T), S146 (shader → tint), S150 (billboard → HUD), the pattern is consistent: ~30% of GDP intent is cut at promote time, and the cuts are almost always deferred-to-a-future-polish-sprint that hasn't materialised yet. The fix is either (a) tighter GDP scoping, or (b) automatic follow-up GDP synthesis at the cut moment. (b) is engine work; (a) is game-design work.
- **The dev agent's velocity is now constrained more by tooling than by Claude's capabilities.** The hottest pain points (scene authoring, schema scaffolding, multiplayer parity, live-probe ritual) are all "mechanical things we re-do every sprint". This is the kind of pain a half-dozen small CLI scripts removes permanently.

---

## §11. Process notes for the next retrospective (S214)

- Re-scan sprint notes via `backlog:retro-scan` once it exists (§9.3) — this manual pass was tractable at 150 sprints but won't be at 200.
- Compare the §10 Top-10 against what got delivered. Items that didn't move are signals: were they not really high-payoff, or did we not invest? Honesty test for the methodology.
- Include a brief "things that improved" section. This pass focused on gaps; a balanced retrospective should also name where the previous 50 sprints made the dev loop faster (the JSON-first backlog migration, the `__agf` probe surface, the ragdoll module landing, the QA terminal split).
- Game-design agent should review this doc within ~2 sprints and file ≥3 follow-up stories (per GDP-2026-05-28-009 acceptance §FOLLOW-UP CYCLE).

---

## Appendix A — Sprint-ID quick index

For traceability, every gap above references sprints. The chronological "engine shape" milestones for context:

- **S0–S20** — bootstrap. Backlog engine + schema validation + first vertical slice.
- **S21–S77** — renderer maturity. WebGPU spike + batched/instanced buckets + shaders.
- **S78–S95** — agent probes + diagnostics era. `/__agf/*` surfaces, snapshot-history, freecam, audio dial, debug-mode override.
- **S96–S104** — Kaboom Crew vertical slice (bombs, blasts, pickups, bots).
- **S105–S110** — character + voice + animation foundation.
- **S111–S125** — multiplayer connect-and-spectate slice.
- **S126–S137** — engine ragdoll module (the canonical engine-shape arc).
- **S138–S150** — Kaboom Crew MVP-2: hazards, power-ups, HUD, opponent badges.
- **S151–S163** — recent: pressure plate, profile, unlocks, voice v2, dash, sudden-death, accessory detach, camera follow.
- **S164** — this retrospective.

---

## Appendix B — Forward-looking sprint cadence

Concrete next-3-sprint shape implied by the §10 ranking (game-design agent decides actual order):

1. **Sprint A** — Promote GDP-2026-05-27-008 (world-space billboard). Re-implement opponent badges (S150) on top. Closes #1.
2. **Sprint B** — Promote GDP-2026-05-28-002 (Wang autotile) + a small Kaboom-Crew integration story per GDP-2026-05-28-004. Closes #3.
3. **Sprint C** — New stories for snapshot-diff probe + scene+component scaffolder + (optional) hazard-stripes shader preset. Closes #4 + #5 + #7 in one tooling-heavy sprint.

Lighting (#2) likely needs its own focused sprint due to size (L close-cost). Recorded-input regression fixtures (#8) can ride alongside any of the above, since the fixtures get written incrementally per story.

---

*End of retrospective. Game-design agent: please file ≥3 follow-up stories from §10 and link them back to this doc.*
