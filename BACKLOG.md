# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S096 — Particles + snapshot diff probe + component probe + game-design agent seed

Status: **active** (started 2026-05-20). Source: `backlog/sprints/S096.sprint.json`.

### Stories

- **KABOOM-PICKUP-IDLE-PULSE** — Pickups carry a subtle 'glow' idle emitter so they read on the floor _(implemented)_
  pickup-spawn-system stamps a low-rate ParticleEmitter on every freshly-spawned pickup: preset='glow' (pale cyan), rate=8, maxParticles=6, lifetime=10 s. The emitter renders as a soft cyan shimmer drifting upward from the cell so pickups read at a glance on the arena floor. When the pickup is collected the entity is removed wholesale (the engine ParticleEmitter system handles dead entities gracefully — no leak).
- **KABOOM-PICKUP-COLLECT-PARTICLE** — Pickup collection emits a spark burst at the pickup's last cell _(implemented)_
  pickup-collect-system now spawns a one-shot fx entity (`${pickupId}.collect-fx`) at the moment of collection BEFORE removing the pickup. The fx entity carries Transform + ParticleEmitter(preset='spark', lifetime=0.35 s, rate=80, maxParticles=30) and nothing else — the engine ParticleEmitter system handles cleanup when lifetime elapses. Chose 'spark' over 'glow' for the burst because the idle shimmer on the pickup is already 'glow' (S096 KABOOM-PICKUP-IDLE-PULSE); contrasting the burst as spark makes the moment of pickup feel discrete and satisfying.
- **AGF-PROBE-RECORDING-LIST** — GET /__agf/recording/list — enumerate active recordings _(pending)_
  Today `recording/start` returns a handle but agents have no way to ask 'what recordings am I currently building?'. Add a read-only list probe that returns `{ recordings: [{ id, startedAt, commandCount, projectId }] }` for every live recording the runtime is tracking. Pure observability — no behaviour change.
- **KABOOM-TITLE-SCREEN-FADE** — Title screen fades out (rather than snaps off) on game start _(implemented)_
  examples/kaboom-crew/src/title-fade.ts exports a pure `fadeOutOpacityCurve(elapsedMs, durationMs)` helper that samples 1 - easingCurves.easeOutQuad(t) — opacity ramps from 1 → 0 with a faster early drop. bootstrap.ts threads an `opacity` field through the title HUD widget's data and replaces the snap-remove with a per-frame fade: when gameStarted flips true, capture titleFadeStartMs; each frame sample the curve and hud.update with the new opacity; remove the widget once opacity hits 0 (~250 ms).
- **AGF-PROBE-SNAPSHOT-DIFF** — GET /__agf/snapshot?at=-N&diff=1 returns the diff vs live _(pending)_
  Build on S095 AGF-PROBE-SNAPSHOT-HISTORY. When the snapshot probe is called with both `at` (history index) AND `diff=1`, the bridge computes the diff between the historical snapshot and the live snapshot using the existing `diffSnapshots()` helper from engine/tools/inspect/snapshot-diff.ts. Returns the diff result envelope. Useful for an agent to ask "what changed in the last N ticks?" without round-tripping two full snapshots.
- **AGF-PROBE-COMPONENT-AT** — GET /__agf/component/<entityId>/<componentName> returns a focused component value _(implemented)_
  engine/runtime/start.ts grew a `componentAt(entityId, componentName, at?)` helper returning a tagged union: `{ kind: 'ok', value } | { kind: 'entity-not-found' } | { kind: 'component-not-found' } | { kind: 'out-of-range', capacity, size }`. The dev bridge maps each outcome to a typed HTTP status: 200 ok, 404 AGF_PROBE_ENTITY_NOT_FOUND, 404 AGF_PROBE_COMPONENT_NOT_FOUND, 400 AGF_PROBE_SNAPSHOT_OUT_OF_RANGE. Path is parsed by the new exported pure helper `parseComponentPath`. Path validation errors return 400 AGF_BRIDGE_INVALID_COMPONENT_PATH; positive `?at=` returns 400 AGF_BRIDGE_INVALID_SNAPSHOT_AT (consistent with S095). Plumbed through src/app.ts, window.__agf, and page-bridge's new `component-at` RPC.
- **GAME-DESIGN-AGENT-ROLE-DOC** — Seed docs/game-design/agent.md — third-role workflow + GDD location _(pending)_
  First story under the planned GAME-DESIGN-AGENT epic that was seeded in S094. Define the role the way docs/qa/agent.md does for QA: who they are (game-designer / product-owner), what files they own (a new docs/game-design/gdd.md — the Game Design Document is the single source of truth for feature/mechanic intent), what tickets they emit (proposed-story-tickets that flow into the dev backlog), and how their loop connects to dev + QA terminals. No code yet — pure design doc. Captures: file ownership table, ticket schema (separate from QA tickets), ticket->story promotion path, the GDD's modular shape (one file per system: combat, economy, progression, etc.), update cadence.
- **DOC-AGENT-DEBUG-RECIPES** — docs/agent-debug-recipes.md — cookbook for common probe flows _(pending)_
  Companion to docs/agent-probes.md (the reference). Recipes is the cookbook: 'how do I find out why pickup.foo isn't being collected', 'how do I verify camera shake fires on each blast', 'how do I diff state between two ticks'. Each recipe is a short titled section with the curl recipe + jq filter + expected output snippet. Targets at the 5-10 most common debug flows an agent hits. Cross-links to /__agf/snapshot, snapshot?at, snapshot?at&diff (S096), component/.../... (S096), render/debug-mode (S091), render/freecam (S095), recording start/stop, console-log.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
