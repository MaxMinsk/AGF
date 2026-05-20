# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S091 — Tween easings + agent-driven render debug overrides + positional audio

Status: **active** (started 2026-05-20). Source: `backlog/sprints/S091.sprint.json`.

### Stories

- **M19-EASING-LIBRARY** — Tween component gains a named easing curve _(pending)_
  M19 shipped the Tween component + system with a linear interpolator only. Promote it: ECS `Tween` schema gains an optional `easing: EasingName` field (default 'linear'). Engine exports a pure helper `easingCurves` keyed by name. Curves to ship in v1 (common subset, no library dep): linear, easeInQuad, easeOutQuad, easeInOutQuad, easeInCubic, easeOutCubic, easeInOutCubic, easeInQuart, easeOutQuart, easeInOutQuart, easeOutBack (overshoot), easeOutElastic (bounce). Unknown name → linear + warning AGF_TWEEN_EASING_UNKNOWN diagnostic.
- **AGF-RENDER-DEBUG-MODE-AGENT** — Agent-driven render debug overrides — wireframe / unlit-white / normals / uv _(pending)_
  Add a renderer-level debug override toggle that an agent can flip at runtime. Surface: `runtime.renderer.setDebugMode(mode: 'off' | 'wireframe' | 'unlit-white' | 'normals' | 'uv')`. Adapter swaps every Mesh.material to a debug override material on flip (cached per-mesh so the original material is restored on 'off'). Dev-bridge: `POST /__agf/render/debug-mode { mode }` + `GET /__agf/render/debug-mode`. Useful tools: wireframe surfaces over-tessellation, unlit-white debugs shape vs lighting separately, normals catches flipped triangles, uv catches packed atlas bugs.
- **AGF-RENDER-DEBUG-OVERLAY-HUD** — HUD pill shows current debug mode + frame counter pressure _(pending)_
  Companion to AGF-RENDER-DEBUG-MODE-AGENT. When debug mode != 'off', surface a topRight HUD pill labelled `DEBUG: wireframe` (or whichever mode) so the player / agent can't accidentally leave the override on. Pill clears when mode flips back to 'off'.
- **AGF-AUDIO-POSITIONAL** — Positional / spatial audio via Web Audio PannerNode _(pending)_
  Engine audio currently routes every play() through the destination directly — fine for UI sounds, wrong for in-world events. Add an opt-in positional path: AudioBus.play accepts an optional `position: [x, y, z]` and a `listenerPosition` cached on the bus. When position is set, the synth chain ends at a PannerNode (HRTF / equal-power per option) instead of destination; the listener position is set from the active Camera each frame. Kaboom Crew picks this up for footstep + bomb-place + blast + death (each event's caller passes the bomber's world position).
- **KABOOM-AUDIO-POSITIONAL-ADOPT** — Kaboom Crew wires positional audio for in-world events _(pending)_
  Follow-up to AGF-AUDIO-POSITIONAL once the engine surface lands. audio-binding-system passes the entity's GridPosition (resolved to world coords via the cell-size factor) to onEvent for footstep / bomb-place / blast / death / pickup. audio-fx routes positional events through the new bus API; non-positional events (match-won/-lost/-draw, UI chimes) keep using the destination path.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
