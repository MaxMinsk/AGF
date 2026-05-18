# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S084 — Kaboom Crew MVP 1 polish — audio, particles, score, title, difficulty

Status: **active** (started 2026-05-18). Source: `backlog/sprints/S084.sprint.json`.

### Stories

- **AGF-AUDIO-PRIMITIVE** — Engine audio primitive — load + play + stop sound effects _(pending)_
  Tiny engine-level audio surface under `engine/runtime/audio/`. Wraps HTMLAudioElement (or AudioContext-backed buffer when needed). Exposes `createAudioBus(parent)` returning `{ load(id, url), play(id, { volume?, rate? }), stop(id), dispose() }`. The engine doesn't yet need positional / 3D audio; this is the smallest primitive a project can bind to game events. SSR-safe (no-op without `globalThis.document`). Lives under `engine/runtime/audio/` and is reachable via `runtime.audio` so projects don't roll their own HTMLAudio singletons.
- **KABOOM-AUDIO-WIRE** — Kaboom Crew binds bomb / blast / pickup / death sounds _(pending)_
  Project-local hook in `examples/kaboom-crew/bootstrap.ts` registers 4 clips on `runtime.audio` (bomb-place / blast / pickup / death) and a tiny system that emits the right call when it detects the corresponding event: `PlaceBombRequest` consumed → bomb-place; `BlastEvent` emitted → blast; `Pickup` removed by `PickupCollectSystem` → pickup; `BomberStats.alive` flips false → death. Clips ship as CC0 placeholders under `examples/kaboom-crew/assets/audio/`. The system stays project-local — engine audio surface remains generic.
  Depends on: AGF-AUDIO-PRIMITIVE.
- **KABOOM-BLAST-PARTICLES** — Particle burst on each blast cell _(pending)_
  When `BlastPropagationSystem` spawns a `BlastTile`, additionally spawn a short-lived ParticleEmitter entity tuned for an arcade explosion (orange/yellow, ~12 particles, 0.4 s lifetime). Re-uses the existing engine particle preset from M19. Single inline preset block in the system; no new engine work.
- **KABOOM-SCORING-HUD** — Round counter + W/L tally in HUD _(pending)_
  Promote the existing `RoundState` singleton with `roundNumber: number` and a `tally: { player: number, bot: number, draws: number }` block. `RoundResolveSystem` increments the right counter when the phase resolves; `restartScene` increments roundNumber and preserves the tally across the auto-restart wipe. The HUD `kaboom.stats` widget renders the new fields in a top row (e.g. `Round 7 • W: 4 L: 2 D: 1`).
- **KABOOM-TITLE-SCREEN** — Title-screen overlay before the first round _(pending)_
  Mount a centre-slot HUD widget on first boot showing 'Kaboom Crew — press Space to start'. The world stays paused (no bot AI / no input → bomb) until Space is pressed; on press, the widget unmounts and gameplay begins. Re-use the existing HUD center slot + the bootstrap's `_boundRestart` plumbing.
- **KABOOM-BOT-DIFFICULTY** — Difficulty presets — easy / normal / hard _(pending)_
  Project-level dial wired through the bootstrap. `?difficulty=easy|normal|hard` (default `normal`) maps to a tuple `{ aggression, decisionIntervalMs, range, speed }` applied to bot.1 at scene load. Easy: aggression 0.25 / 500 ms / range 2 / speed 2. Normal: 0.5 / 200 ms / 2 / 3. Hard: 0.85 / 120 ms / 3 / 4. The dial doesn't ship UI yet; query param is the agent-friendly contract.
- **KABOOM-PROJECT-README** — examples/kaboom-crew/README.md — controls + agent surface + story _(pending)_
  Short README under `examples/kaboom-crew/` covering the controls (WASD/arrows + Space + R), the agent surface (`window.__agf.kaboom.{gotoCell, placeBomb, status, restart}`), the round flow (start → bombs → blast → win/lose → auto-restart 3 s), the difficulty query param, and the file map (scenes / prefabs / src/systems / tests). One page; first paragraph is the player-facing pitch from SAMPLE_GAME_IDEAS.
- **KABOOM-DEMO-RECORDING** — Deterministic 30-second recording fixture for regression replay _(pending)_
  Capture a `Recording` of a 30-second seeded bot-vs-bot round and stash it under `examples/kaboom-crew/recordings/demo-30s.recording.json`. A new Vitest test replays the recording against a fresh world and asserts a stable final phase + RoundState.elapsed — gives the sprint a regression target for any AI / blast / pickup change, headless and fast (the existing playtest in S082 already shows the pattern).
  Depends on: KABOOM-BOT-DIFFICULTY.
- **AGF-DOCTOR-RENDERER-INSPECT-SECTION** — engine doctor — Renderer probe section from rendererInspect() _(pending)_
  Follow-on to S83 AGF-AGENT-RENDERER-PROBE. `engine doctor --renderer-inspect-from <path>` reads a snapshot dumped from `/__agf/renderer-inspect` and renders a 'Renderer:' section in the doctor report — info counters + handle leak callout + entity-id sample. Mirrors the AGF-LOG-DOCTOR-DIAGNOSTICS flag pattern.
- **AGF-LOG-RENDERER-DIAGNOSTICS-WIRE** — Thread diagnostics bus into the renderer adapter (deferred from S83 audit) _(pending)_
  S83 AUDIT-ENGINE marked the renderer files file-level allow-listed because the diagnostics bus didn't reach them. Thread the bus in: `ThreeRenderAdapter` constructor accepts `{ diagnostics? }`, and the three renderer-side warn/error sites (shader-patch fallback, async geometry/material binding failure, WebGPU adapter init fallback) migrate to `bus.emit({ severity, code: 'AGF_RENDER_*', ... })`. Adapter still keeps `console.warn` fallback when no bus is supplied (boot before the bus exists).
  Depends on: AGF-DOCTOR-RENDERER-INSPECT-SECTION.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
