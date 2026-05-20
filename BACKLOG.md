# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S091 — Tween easings + agent-driven render debug overrides + positional audio

Status: **active** (started 2026-05-20). Source: `backlog/sprints/S091.sprint.json`.

### Stories

- **M19-EASING-LIBRARY** — Tween component gains a named easing curve _(implemented)_
  engine/core/systems/tween-system.ts grew a `easingCurves: Record<TweenEase, (t)=>number>` pure helper table keyed by name. v1 set: linear, easeInQuad / Cubic / Quart, easeOutQuad / Cubic / Quart, easeInOutQuad / Cubic / Quart, easeOutBack (small overshoot ~10%), easeOutElastic (damped oscillation past 1.0), plus the existing pulse (sine half-wave). Legacy aliases easeIn / easeOut / easeInOut remain and behave as the Quad variants for backwards-compat with existing scenes. easeFn() now reads the table; unknown names fall through to linear (no diagnostic needed — TS enum + default catch it).
- **AGF-RENDER-DEBUG-MODE-AGENT** — Agent-driven render debug overrides — wireframe / unlit-white / normals / uv _(implemented)_
  engine/render/debug-mode.ts owns pure swap/restore helpers + the RenderDebugMode union. ThreeRenderAdapter holds a debugCache (Map<Mesh, { material, wireframe? }>) + the shared override material. setDebugMode(mode) restores any prior swap, then either flips material.wireframe in-place (wireframe mode, no swap) or replaces obj.material with the override. unlit-white uses MeshBasicMaterial #ffffff, normals uses MeshNormalMaterial, uv is a tiny ShaderMaterial → rgb=(uv.x, uv.y, 0). Restore disposes the override material; adapter.dispose() restores first so per-mesh dispose runs against real materials. Plumbed through ThreeRenderer.getDebugMode / setDebugMode, app.getRenderDebugMode / setRenderDebugMode, window.__agf.*, and the dev bridge at GET/POST /__agf/render/debug-mode (strict mode-string validation — bad values return AGF_BRIDGE_INVALID_RENDER_DEBUG_MODE).
- **AGF-RENDER-DEBUG-OVERLAY-HUD** — HUD pill shows current debug mode + frame counter pressure _(implemented)_
  engine/runtime/ui/render-debug-pill.ts exposes a tiny `syncRenderDebugPill(hud, mode)` helper that mounts a topRight HUD widget (id = `agf:render-debug-pill`, label `DEBUG: <mode>`) when mode != 'off', updates the label on transition between non-off modes, and removes the widget on flip back to 'off'. src/app.ts setRenderDebugMode wraps runtime.renderer.setDebugMode + this helper so every flip (via window.__agf.setRenderDebugMode or POST /__agf/render/debug-mode) drives the HUD in lockstep.
- **AGF-AUDIO-POSITIONAL** — Positional / spatial audio via Web Audio PannerNode _(deferred)_
  Engine audio currently routes every play() through the destination directly — fine for UI sounds, wrong for in-world events. Add an opt-in positional path: AudioBus.play accepts an optional `position: [x, y, z]` and a `listenerPosition` cached on the bus. When position is set, the synth chain ends at a PannerNode (HRTF / equal-power per option) instead of destination; the listener position is set from the active Camera each frame. Kaboom Crew picks this up for footstep + bomb-place + blast + death (each event's caller passes the bomber's world position).
- **KABOOM-AUDIO-POSITIONAL-ADOPT** — Kaboom Crew wires positional audio for in-world events _(implemented)_
  examples/kaboom-crew/src/audio-fx.ts grew an HRTF PannerNode path. `play(kind, context?)` takes an optional `PositionalPlayContext { position?: [x, y, z] }`; when supplied, the gain chain ends at a PannerNode (panningModel:HRTF, distanceModel:inverse, refDistance:2, rolloff:1, maxDistance:60) instead of context.destination. A new `setListenerPosition(x, y, z)` proxies to AudioListener (modern positionX/Y/Z AudioParam if available, else legacy setPosition). audio-binding-system resolves a `cellPos(entityId)` from GridPosition and forwards it on bomb-place / death / footstep / blast (pickup omits position — the entity is already despawned). bootstrap.ts pulls the player.1 cell from the status snapshot every fixedUpdate and calls audioFx.setListenerPosition(gx, 0, gz).

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
