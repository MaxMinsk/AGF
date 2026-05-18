# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S085 — Kaboom Crew MVP 1 hotfixes + pool warmup + observability follow-ons

Status: **active** (started 2026-05-18). Source: `backlog/sprints/S085.sprint.json`.

### Stories

- **KABOOM-TITLE-INPUT-PAUSE** — Player input freezes while GamePaused — fixes Space-to-start placing a bomb + movement-before-start _(pending)_
  User-reported S084 bugs: (a) hitting Space on the title screen dismisses the overlay AND immediately writes PlaceBombRequest because PlayerInputSystem's edge-detect fires on the same frame, and (b) WASD already moves player.1 before Space is pressed. Add the GamePaused guard to PlayerInputSystem (same shape as bot-ai / bomb-fuse / bomb-placement in S084) so keyboard input stays inert until the overlay is dismissed.
- **KABOOM-AUDIO-PROCEDURAL-SFX** — WebAudio-synth SFX so the four events actually make sound _(pending)_
  S084 KABOOM-AUDIO-WIRE loaded clip URLs that didn't exist — HTMLAudio.play() fell through silently. Replace the placeholder loader with a project-local procedural synth that uses WebAudio (OscillatorNode + GainNode + lazy AudioContext): bomb-place = low tick, blast = filtered noise burst, pickup = rising chirp, death = descending pitch. No binary assets to ship; sounds the moment the user clicks the page.
- **AGF-POOL-WARMUP-PARTICLES** — Pre-warm the particle pool to its declared max so the first blast doesn't stall _(pending)_
  S084 follow-up — first KABOOM-BLAST-PARTICLES burst stalled visibly because the M19 particle pool only grew to its `maxParticles` cap on demand. Add a one-shot warmup step in ParticleEmitterSystem (or the adapter pool surface) that allocates the full instance slot up front, then immediately returns the slots to the free pool. Steady-state cost unchanged; the spike on the first burst goes away. Pairs naturally with the broader render-pool unification in a future sprint — for now scope to the particle case where the user actually saw the stall.
- **KABOOM-ROUND-TIMER** — Per-round time limit + auto-draw when nobody dies in time _(pending)_
  Promote RoundState with a `timeLimit: number` field (default 90 s, query-param overridable). RoundResolveSystem flips phase to 'draw' when elapsed >= timeLimit + no winner. HUD timer line shows `t: 47s / 90s` instead of bare elapsed. Stops a game where both bombers play it safe from looping forever.
- **KABOOM-CONTROLS-HINT** — Bottom-center controls hint for the first 4 s of a fresh boot _(pending)_
  Tiny HUD widget shown for the first 4 seconds of the first round explaining `WASD / arrows · Space = bomb · R = restart`. Helps new players who skipped the README. Fades out automatically; doesn't survive a manual restart.
- **AGF-DOCS-AGENT-PROBE-CATALOGUE** — docs/agent-probes.md — one-page catalogue of every /__agf endpoint _(pending)_
  Single page listing every probe surface an agent can hit (snapshot, diagnostics, renderer-info, renderer-inspect, commands, console-log, reload-events, asset/invalidate, events SSE) with a curl example + return shape. Pairs with the runtime-side docs already shipped — agents look here first, then drill into engine doctor.
- **AGF-LOG-RENDERER-LIFT-WARN-SITES** — Lift the remaining renderer console.warn sites to runtime.diagnostics _(pending)_
  S084 AGF-LOG-RENDERER-DIAGNOSTICS-WIRE threaded the bus into ThreeRenderAdapter but only migrated the WebGPU-fallback site. Walk the remaining `agf-allow:console-file` sites (shader-pcss + material-binding + three-render-adapter + three-renderer) and lift each call to `bus.emit({ severity, code: 'AGF_RENDER_*', ... })` when a bus is wired; keep the console fallback for the no-bus case. Drop the file-level allow markers as each file becomes clean.
- **AGF-DOCTOR-RECOMMENDATION-HANDLE-LEAK** — engine doctor recommends action when rendererInspect.handleLeak > 0 _(pending)_
  Wire a recommendation entry into DoctorReport.recommendations when the supplied --renderer-inspect-from snapshot carries handleLeak > 0. Sample text: `Renderer handle leak detected (N handles unmapped to RenderMeshHandle). Run __agf.rendererInspect() and check the handles.entityIds list for unfreed entities — most often a scene.load missed cleaning up a long-lived mesh handle.`
  Depends on: AGF-DOCTOR-RENDERER-INSPECT-SECTION.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
