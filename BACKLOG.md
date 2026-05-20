# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S089 — Kaboom Crew polish r4 + engine observability tail

Status: **active** (started 2026-05-20). Source: `backlog/sprints/S089.sprint.json`.

### Stories

- **KABOOM-BOT-PICKUP-MAGNET** — Bot wander pulls toward nearby pickups _(implemented)_
  BotAISystem's wander path was uniform-random over safe neighbours. Now: when a Pickup is within PICKUP_RADIUS=5 manhattan and the pickup cell is NOT in the danger set, decideDirection prefers the safe neighbour that reduces manhattan distance to it. Danger-avoid still wins (the magnet picks from the already-filtered safe pool); pickups inside the danger map are skipped entirely.
- **KABOOM-MATCH-WIN-PARTICLES** — Particle burst at the winner's cell when matchPhase resolves _(implemented)_
  audio-binding-system grew spawnMatchEndCelebration: when matchPhase transitions out of in-progress, it spawns a `pulse` ParticleEmitter at the winner's grid cell (`won`/`lost` use RoundState.winnerId) or one at every living bomber on `draw`. Lifetime 1 s, rate 80, maxParticles 40 — reads as a celebratory burst and the engine pre-warmed pool absorbs the cost. project.json#render.particlePreWarmPresets adds 'pulse' so the shader is compiled at boot.
- **KABOOM-ROUND-TIMER-BAR** — HUD shows round elapsed / timeLimit as a thin progress bar _(implemented)_
  kaboom.stats HUD widget now renders a 4 px horizontal bar above the text lines, filled as elapsed / timeLimit grows. Color shifts orange when remaining <= 15 s, red when <= 5 s. Hidden when timeLimit=0 / undefined OR phase != playing — the text line keeps the precise readout.
- **KABOOM-AGENT-MAP-LIST** — runtime.kaboom.maps() + loadMap(name) for scripted map swap _(implemented)_
  Bootstrap consolidates the start/wide map sources into a static MAP_REGISTRY, drops `readMapName`'s special-case branch in favour of a registry lookup, and exposes `runtime.kaboom.maps()` / `loadMap(name)` / `activeMap()` on window.__agf.kaboom. attachUi seeds `activeMapName` from `?map=` once at boot; subsequent loadMap calls flip it + restart the scene through the same restartScene path.
- **KABOOM-PAUSE-AUDIO-MUTE** — Pause menu gets an Audio toggle (mute / unmute) _(implemented)_
  audio-fx.ts gains setMuted/isMuted; play() returns early when muted (no AudioContext teardown so unmute is a free no-arg toggle). The Esc pause menu picks up a fourth button alongside Resume / Restart / Difficulty: `Audio: ON|OFF`. The toggle persists to the same localStorage key the existing ?audio= volume dial uses (`agf.audio.volume`) — '0' on mute, '1' on unmute.
- **AGF-DOCTOR-SYSTEMS-SECTION** — engine doctor surfaces a Systems: section from a diagnostics snapshot _(implemented)_
  DoctorReport gains `systems: SystemsReport | null` populated by walking the --diagnostics-from snapshot for AGF_SCHEDULER_SYSTEM_REGISTERED / _DEREGISTERED traces (HMR re-registers dedupe; deregister removes by name). formatSystems renders 'Systems (N):' followed by the name list; the section is suppressed when no lifecycle traces are present.
- **AGF-RUNTIME-DEBUG-SYSTEM-TOGGLE** — Per-system debug toggle via runtime.setDebugSystem(name, on) _(implemented)_
  SystemScheduler gains a debugSystems Set + setDebugSystem(name, enabled) toggle. When a system is on, runFixedStep / runFrame emit an info-level AGF_SYSTEM_TICK diagnostic per pass with { name, tick, phase: 'fixed'|'frame' }. unregister clears the toggle so stale entries can't fire after a scene swap. RuntimeHandle forwards via setDebugSystem; returns false when the system isn't registered.
- **AGF-DEV-BRIDGE-POOL-INVENTORY-TEST** — Playwright smoke test for GET /__agf/pool-inventory _(implemented)_
  Extends the existing dev-bridge round-trip smoke test (smoke project) with a /__agf/pool-inventory fetch + shape assertions: three named pools (instanced/batched/particle), live and peak are non-negative numbers, peak >= live. Locks the API contract so a renderer refactor that drops a pool name fails the smoke test immediately.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
