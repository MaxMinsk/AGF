# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S089 — Kaboom Crew polish r4 + engine observability tail

Status: **active** (started 2026-05-20). Source: `backlog/sprints/S089.sprint.json`.

### Stories

- **KABOOM-BOT-PICKUP-MAGNET** — Bot wander pulls toward nearby pickups _(pending)_
  BotAISystem's wander path is uniform-random over safe neighbours. When a Pickup is visible within ~5 cells (manhattan) the bot should pick the safe neighbour that reduces distance to the nearest pickup — turns the bot from a drunken wanderer into a basic loot collector without changing the danger-avoid rules. Cell preference, not BFS, so the cost is cheap.
- **KABOOM-MATCH-WIN-PARTICLES** — Particle burst at the winner's cell when matchPhase resolves _(pending)_
  Currently the match resolution gets a banner + chord but nothing visual. Spawn a short-lived 'pulse' ParticleEmitter at the winning bomber's cell (or both cells on draw) when matchPhase transitions out of 'in-progress'. Lifetime ~1 s, high rate so it reads as a celebratory burst. Reuses the engine pre-warmed pool — no extra preset.
- **KABOOM-ROUND-TIMER-BAR** — HUD shows round elapsed / timeLimit as a thin progress bar _(pending)_
  The HUD stats line shows `t: 12s / 90s` — readable but not glanceable. Add a thin 4 px horizontal bar above the stats slot that fills as elapsed / timeLimit grows; color shifts orange in the last 15 s, red in the last 5 s. Text line stays as the precise readout. When timeLimit=0 the bar hides.
- **KABOOM-AGENT-MAP-LIST** — runtime.kaboom.maps() + loadMap(name) for scripted map swap _(pending)_
  Today the only way to swap maps is `?map=wide` on URL reload — an agent doing scripted playtests can't pivot maps without a full page reload. Expose `runtime.kaboom.maps()` returning `['start', 'wide']` and `runtime.kaboom.loadMap('wide')` which calls scene.load against the corresponding flat-expanded scene + reseeds the RoundState (same path as restartScene). Useful for the multi-map smoke playtest the next sprint can build.
- **KABOOM-PAUSE-AUDIO-MUTE** — Pause menu gets an Audio toggle (mute / unmute) _(pending)_
  S86 shipped the volume dial via ?audio= + localStorage. The pause menu (Esc) doesn't surface it — players have to know about the URL param. Add an 'Audio: ON / OFF' toggle button to the pause menu that calls a new audioFx.setMuted(boolean) and persists the new dial value to localStorage (off ↔ saved-volume).
- **AGF-DOCTOR-SYSTEMS-SECTION** — engine doctor surfaces a Systems: section from a diagnostics snapshot _(pending)_
  S88 closed the lifecycle-trace wiring (`AGF_SCHEDULER_SYSTEM_REGISTERED` info diagnostics now reach /__agf/diagnostics). Doctor's --diagnostics-from path already ingests the snapshot for the boot-noise budget — extend it to also extract `Systems:` (count + names of last-registered systems) so an agent reading the doctor output gets the live system list without inspecting the scheduler.
- **AGF-RUNTIME-DEBUG-SYSTEM-TOGGLE** — Per-system debug toggle via runtime.setDebugSystem(name, on) _(pending)_
  Engine observability follow-up from S082 — every system can opt into per-tick state-diff diagnostics when toggled on at runtime. RuntimeHandle gains `setDebugSystem(name: string, enabled: boolean): boolean`; when enabled, an info-level `AGF_SYSTEM_TICK` diagnostic fires once per fixed step with the system's name + tick number. Systems that don't have hooks get the generic emission; systems can opt into structured details later.
- **AGF-DEV-BRIDGE-POOL-INVENTORY-TEST** — Playwright smoke test for GET /__agf/pool-inventory _(pending)_
  S88 shipped /__agf/pool-inventory but only unit-tests cover the registry math. Add a Playwright smoke test that boots hello-3d, awaits rendererReady, fetches the route, and asserts the JSON shape. Locks the surface so a future refactor that drops a pool name surfaces immediately.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
