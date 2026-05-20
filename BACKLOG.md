# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S096 — Particles + snapshot diff probe + component probe + game-design agent seed

Status: **active** (started 2026-05-20). Source: `backlog/sprints/S096.sprint.json`.

### Stories

- **KABOOM-BLAST-PARTICLE-BURST** — Blast cells emit a spark burst via the engine ParticleEmitter primitive _(pending)_
  Reuse the engine ParticleEmitter (S047 M19-particle-preset, presets: spark/glow/pulse) to make blast cells visually pop. blast-propagation-system stamps `ParticleEmitter` with preset='spark', lifetime≈0.35 s, rate≈80, maxParticles≈40 on each blast cell at the moment of detonation. The emitter auto-removes itself after lifetime — no cleanup code needed. World-position offset uses the cell's grid (gx, 0.4, gz). MVP-1 doneCriteria item.
- **KABOOM-PICKUP-COLLECT-PARTICLE** — Pickup collection emits a glow burst at the pickup's last cell _(pending)_
  pickup-collect-system already removes the pickup entity at the moment of collection. Before removing, stamp a one-shot particle burst on a fresh `pickup.fx.<id>` entity at the same position so the player gets visual feedback. Preset='glow' (pale cyan), lifetime≈0.4 s, maxParticles≈30. The fx entity carries only Transform + ParticleEmitter — no GridOccupant, no logic — and is cleaned up when the emitter expires (the ParticleEmitter system removes itself; we then check + remove the host entity in a tiny project-local helper).
- **KABOOM-DEATH-PARTICLE-PUFF** — Bomber death emits a pulse particle puff _(pending)_
  Companion to the death-fall animation that landed in S090. audio-binding-system already detects the alive→dead transition and writes DeathAnim. Extend that handler to also stamp ParticleEmitter on the dying bomber with preset='pulse' (warm magenta), lifetime≈0.5 s, maxParticles≈50, vertical offset≈0.5. The puff plays during the tip-over animation; both expire by the same time.
- **KABOOM-TITLE-SCREEN-FADE** — Title screen fades out (rather than snaps off) on game start _(pending)_
  Title overlay is currently mounted via HUD and `hud.remove(TITLE_ID)` snaps it off when the player presses SPACE. Replace the snap with a 250 ms fade-out by tweening the title element's opacity 1 → 0 with easeOutQuad (using the engine easingCurves table directly — no Tween component on a DOM element). Remove the widget once opacity reaches 0. Pure cosmetic, no schema changes.
- **AGF-PROBE-SNAPSHOT-DIFF** — GET /__agf/snapshot?at=-N&diff=1 returns the diff vs live _(pending)_
  Build on S095 AGF-PROBE-SNAPSHOT-HISTORY. When the snapshot probe is called with both `at` (history index) AND `diff=1`, the bridge computes the diff between the historical snapshot and the live snapshot using the existing `diffSnapshots()` helper from engine/tools/inspect/snapshot-diff.ts. Returns the diff result envelope. Useful for an agent to ask "what changed in the last N ticks?" without round-tripping two full snapshots.
- **AGF-PROBE-COMPONENT-AT** — GET /__agf/component/<entityId>/<componentName> returns a focused component value _(pending)_
  Add a focused inspection probe so an agent can read a single component without pulling a whole snapshot. Path-based: `GET /__agf/component/player.1/BomberStats` returns `{ entityId, component, value }`. Returns 404 `AGF_PROBE_ENTITY_NOT_FOUND` when the entity is unknown and 404 `AGF_PROBE_COMPONENT_NOT_FOUND` when the entity exists but doesn't carry the component. Supports `?at=-N` (defaults to live) to read historical values via the S095 ring buffer.
- **GAME-DESIGN-AGENT-ROLE-DOC** — Seed docs/game-design/agent.md — third-role workflow + GDD location _(pending)_
  First story under the planned GAME-DESIGN-AGENT epic that was seeded in S094. Define the role the way docs/qa/agent.md does for QA: who they are (game-designer / product-owner), what files they own (a new docs/game-design/gdd.md — the Game Design Document is the single source of truth for feature/mechanic intent), what tickets they emit (proposed-story-tickets that flow into the dev backlog), and how their loop connects to dev + QA terminals. No code yet — pure design doc. Captures: file ownership table, ticket schema (separate from QA tickets), ticket->story promotion path, the GDD's modular shape (one file per system: combat, economy, progression, etc.), update cadence.
- **DOC-AGENT-DEBUG-RECIPES** — docs/agent-debug-recipes.md — cookbook for common probe flows _(pending)_
  Companion to docs/agent-probes.md (the reference). Recipes is the cookbook: 'how do I find out why pickup.foo isn't being collected', 'how do I verify camera shake fires on each blast', 'how do I diff state between two ticks'. Each recipe is a short titled section with the curl recipe + jq filter + expected output snippet. Targets at the 5-10 most common debug flows an agent hits. Cross-links to /__agf/snapshot, snapshot?at, snapshot?at&diff (S096), component/.../... (S096), render/debug-mode (S091), render/freecam (S095), recording start/stop, console-log.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
