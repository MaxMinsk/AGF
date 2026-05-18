# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S082 — Kaboom Crew gameplay v0 — input + bot AI + bombs + win/loss

Status: **active** (started 2026-05-18). Source: `backlog/sprints/S082.sprint.json`.

### Stories

- **KABOOM-PLAYER-INPUT** — Keyboard input → GridMover.queuedDirection _(implemented)_
  Project-local `PlayerInputSystem` under `examples/kaboom-crew/src/` translates WASD + arrow keys into `GridMover.queuedDirection`. Keys are tracked via an internal pressed-set rebuilt from window keydown/keyup; the system writes whichever cardinal is currently held (right > up > left > down precedence to keep behaviour deterministic). Releases all keys on blur. Tagged via a new `PlayerControlled` (already in core.schema.json) component on the player entity to scope which mover the system drives. No bomb input yet — that lands in KABOOM-BOMB-PLACE.
- **KABOOM-BOT-AI** — Bot AI v0 — wander + bomb-avoidance _(implemented)_
  Project-local `BotAISystem` reads `BotBrain` component (project schema fragment under examples/kaboom-crew/schemas) and writes `GridMover.queuedDirection`. Two behaviours: (1) wander — pick a random cardinal that is passable + not in the current danger map; (2) flee — when the current cell is in the danger map, prefer the direction with the lowest danger value. Danger map is derived from active bomb fuses + reachable blast cells through GridOccupancySystem; computed once per second (TimeBased component drives the cadence). Personality dial: `aggression` (0..1) — higher values reduce flee threshold.
  Depends on: KABOOM-PLAYER-INPUT.
- **KABOOM-BOMB-PLACE** — Place-bomb action: space key spawns a Bomb entity on the player's cell _(implemented)_
  Project-local `BombPlacementSystem` consumes a `PlaceBombRequest` transient component on the player. The transient is written by `PlayerInputSystem` on space key; system reads it, checks `BomberStats.activeBombs < BomberStats.maxBombs`, checks `GridOccupancySystem` for an existing bomb on the cell, then issues an `entity.create` command for a bomb prefab. Removes the transient at the end of the frame. Bots get their own `PlaceBombRequest` writer via BotAISystem so the same pipeline serves both.
  Depends on: KABOOM-PLAYER-INPUT.
- **KABOOM-BOMB-FUSE-BLAST** — Bomb fuse → blast propagation → block destruction _(implemented)_
  `BombFuseSystem` decrements `Bomb.fuseRemaining` each fixedUpdate; at zero, it emits a `BlastEvent` transient + deletes the bomb entity. `BlastPropagationSystem` walks the four cardinals up to `Bomb.range` cells through `GridOccupancySystem`, stopping at the first cell that blocks blast (hard wall) and destroying any `soft-block` on the way. Chain reactions: a blast that overlaps another bomb's cell triggers that bomb early (fuse → 0). Visuals: each blast cell spawns a short-lived `BlastTile` entity carrying a `Tween` so the renderer paints a flash + fade — re-uses the existing Tween system.
  Depends on: KABOOM-BOMB-PLACE.
- **KABOOM-PICKUPS-AND-STATS** — Power-up pickups: Bomb-up / Fire-up / Speed-up _(pending)_
  Soft blocks roll a deterministic-by-cell pickup table on destruction (small `r = seededRng(cellKey)` so the same arena always seeds the same pickups). `PickupCollectSystem` detects player/bot entering a pickup-occupied cell, applies the effect to `BomberStats`, deletes the pickup. Visual: pickups use 3 distinct primitive shapes + colours; HUD shows the bomber's current stats via the existing HUD widget API.
  Depends on: KABOOM-BOMB-FUSE-BLAST.
- **KABOOM-DAMAGE-AND-DEATH** — Damage + death: blast tiles kill bombers; round ends when only one is alive _(implemented)_
  BlastPropagationSystem additionally checks every `BomberStats`-carrying entity at the blast cell and sets `BomberStats.alive = false`. Project-local `RoundResolveSystem` watches surviving bombers each frame; when ≤ 1 remain alive (or 0 — draw), it flips a singleton `RoundState { phase: 'playing' | 'won' | 'lost' | 'draw', winnerId? }` and pauses every GridMover. The HUD watches `RoundState` and shows a win/loss banner.
  Depends on: KABOOM-BOMB-FUSE-BLAST.
- **KABOOM-RESTART** — Round restart command — R key resets the scene + RoundState _(implemented)_
  Project-local input maps the `R` key to a `RoundRestartRequest` transient on a singleton control entity. `RoundResolveSystem` consumes it: applies the inverse-of-scene command chain (re-runs `scene.load` against examples/kaboom-crew/scenes/start.scene.json, or re-rolls a procedural seed). Lives entirely as data + commands so the same path serves agent replay scripts. No imperative renderer reset needed.
  Depends on: KABOOM-DAMAGE-AND-DEATH.
- **KABOOM-HUD-PANEL** — HUD: round timer + bomber stats + win/loss banner _(pending)_
  Three HUD widgets wired into the runtime.hud surface from S081: (a) topLeft — bomber stats (active bombs / range / speed icons + numbers); (b) topRight — minimap with player + bot + bomb markers (driven by createMinimapWidget); (c) center — win/loss banner driven by RoundState. Project queries the ECS each frame and pushes the data via runtime.hud.update — engine HUD primitive stays project-agnostic.
  Depends on: KABOOM-PICKUPS-AND-STATS, KABOOM-DAMAGE-AND-DEATH.
- **KABOOM-AGENT-CONTROLS** — Agent-friendly control surface: `runtime.kaboom = { gotoCell, placeBomb, status }` _(pending)_
  Expose a small object on `runtime.kaboom` (mirrored onto `window.__agf.kaboom`) so an agent can drive Kaboom Crew without simulating keyboard events. v0 surface: (a) `gotoCell(entityId, gx, gz)` — sets a target cell that a project-local `AgentGotoSystem` walks toward each frame by writing `GridMover.queuedDirection` (one-step-at-a-time, respects walls + lane-assist); (b) `placeBomb(entityId)` — writes a `PlaceBombRequest` transient on the entity (same code path as space-key + bot AI); (c) `status()` — returns `{ round, players: [{ id, gx, gz, alive, activeBombs, stats }], bombs: [...], blastTiles: [...] }` so an agent can poll game state without parsing the full snapshot. Agent playtests + bug reproductions become one-liners.
  Depends on: KABOOM-BOMB-PLACE.
- **KABOOM-AGENT-PATHFIND** — BFS pathfinder so `gotoCell` walks around walls + soft blocks _(pending)_
  v0 of `AgentGotoSystem` (KABOOM-AGENT-CONTROLS) only handles straight-line motion via `GridMover` lane-assist. This story adds a real BFS over the GridOccupancy index — each frame, the system recomputes the shortest path from current cell to target, queues the next cell as `queuedDirection`. Optionally caches the path until a wall changes (cheap invariant: occupancy revision counter). Treats soft blocks as walls today — bomb-it-down planning is a follow-up. Unblocks `__agf.kaboom.gotoCell` for traversal across the arena.
  Depends on: KABOOM-AGENT-CONTROLS.
- **KABOOM-PLAYTEST-SCENARIO** — Robot playtest scenario — bot-vs-bot recording proves the round terminates _(pending)_
  Drop a deterministic playtest under `examples/kaboom-crew/playtests/bot-vs-bot.json`: starts the scene, swaps the player's `PlayerControlled` for a second BotBrain, records commands + snapshots for 60 simulated seconds, asserts RoundState.phase eventually leaves 'playing'. Becomes the regression target for any AI / blast / round-state change.
  Depends on: KABOOM-BOT-AI, KABOOM-DAMAGE-AND-DEATH.

### Out of scope

- Networking, client prediction, snapshot relevance.
- Audio system.
- Procedural characters (still capsule placeholders).
- Sector modifiers, blast-prediction telegraph decal.

### Follow-ups already noted

- AGENT-RENDERER-PROBE (engine-level) — `engine probe <projectDir>` + `runtime.renderer.inspect()` that returns a compact JSON dump of: (a) Three.js scene tree (Mesh / InstancedMesh / Light children + count + visibility), (b) BatchingSystem bucket records (key, capacity, live, members, lastWorld memo per entity), (c) MeshHandleRegistry handle → entityId map. The bug-hunt for the restart ghost players used this in ad-hoc form — `tmp-kaboom-probe.mjs` that reads `__agf.rendererInfo()`. A first-class tool means future render-side bugs are diagnosed in one curl, not in throwaway scripts. Live in a new engine sprint (likely engine-level under `M5` runtime diagnostics or as a new story under `E-56-ENGINE-DOCTOR-PROJECTDIR-SCORECARD`).
- AGF-LOG-POLICY-DOC (engine S083) — write docs/diagnostics-policy.md capturing the severity scale + when-to-use-diagnostics-vs-console + structured-payload schema. Source: notes/logging-policy-thinking.md.
- AGF-LOG-CI-GATE (engine S083) — scripts/check-no-console-log.mjs rejects raw console.log in engine/** + examples/**/src/**; wired into npm run repo:hygiene (already part of preflight). Allowlist via `// agf-allow:` markers.
- AGF-LOG-AUDIT-ENGINE (engine S083) — sweep engine/** for raw console.log and replace with runtime.diagnostics.emit or console.warn/error with structured AGF_XXX codes. Mechanical, ~30 call sites.
- AGF-LOG-LIFECYCLE-TRACES (engine S083) — scheduler.register / scene.load / bucket.acquire+release / meshHandle.acquire+release emit `info` diagnostics so an agent can reconstruct the boot/restart timeline from one snapshot. Would have surfaced the S82 ghost-player bug in one read.
- AGF-LOG-PER-SYSTEM-DEBUG (engine S083+) — every system factory accepts `debug?: boolean`; when true emits per-tick state diff. `runtime.debug.<systemName>=true` flips it.
- AGF-LOG-DOCTOR-DIAGNOSTICS (engine S083) — extend engine doctor with a Diagnostics: section: counts by (severity, code) since runtime start; flags any error or > 5 warnings of the same code as a recommendation.
- AGF-LOG-BOOT-NOISE-BUDGET (engine S083) — preflight smoke asserts zero error/warning diagnostics after first paint for hello-3d + kaboom-crew. Regression gate on engine pipeline cleanliness.
- AGF-LOG-ENTITY-RECREATED (engine S083) — scene.load detects when an entity id is removed AND re-added in the same command batch + emits AGF_ENTITY_RECREATED warning. Would have surfaced the BatchedMeshHandle-loss bug in one frame.
- Audio (sound design pass) stays parked until MVP 2.
- Procedural character generator stays parked — capsule placeholders cover MVP 0.
- Multiplayer (server authority + client prediction + relevance filter) lives under the KABOOM-CREW-MVP-1 epic, not MVP 0.
- Decal-on-grid (M27) + region-rule (M28) primitives are MVP-2-tier and not required for MVP 0.

### Notes

- First sprint where Kaboom Crew is actually playable. Everything project-local lands under examples/kaboom-crew/src/ + examples/kaboom-crew/schemas/ — engine primitives stay frozen.
- Round resolution + win/loss are ECS-data-driven (RoundState component) so an agent can flip phases via the command pipeline + drive end-screen UX from data.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
