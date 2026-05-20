# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S095 — Polish — camera shake / spawn pop + agent free-cam + audio dial + snapshot history

Status: **active** (started 2026-05-20). Source: `backlog/sprints/S095.sprint.json`.

### Stories

- **KABOOM-CAMERA-EASING-ADOPT** — Kaboom Crew adopts S091 named easings — death tip + camera shake decay _(implemented)_
  death-animation-system.ts now imports `easingCurves` from engine/core/systems/tween-system.ts; `deathFallPitch()` samples `easingCurves.easeOutBack(t)` instead of the previous inline `1 - (1 - t) * (1 - t)` — dying bombers tip past 90° (~110% of target) and rock back to settle. camera-shake-system.ts dropped the `decayPerSecond` knob in favor of `durationSeconds` (default 0.45 s); a new pure helper `cameraShakeEnvelope(elapsed, duration)` returns `1 - easingCurves.easeOutElastic(t)`, which opens at 1 and dips below zero mid-curve before settling at 0 — gives the shake a small bouncy stop instead of monotonic exponential fade. The system tracks `peakIntensity` + `elapsed` per shake window; a fresh BlastEvent resets `elapsed` so the bounce stays in sync with the latest detonation.
- **KABOOM-SPAWN-POP-TWEEN** — Bomb / pickup mesh scale 0 → 1 with easeOutBack on spawn _(implemented)_
  bomb-placement-system.ts + pickup-spawn-system.ts now stamp `Transform.scale = [0, 0, 0]` on the freshly-spawned entity and attach a `Tweens` component driving scale to the final size over 200 ms with `easeOutBack`. The engine's TweenSystem (registered by start.ts) advances each tween in fixedUpdate and removes the Tween component on completion — no per-project advance code needed. Final scales: bombs `[0.35, 0.35, 0.35]`, pickups inherit the per-kind PICKUP_VISUAL.scale.
- **AGF-RENDER-DEBUG-FREECAM** — Agent-driven free-fly camera for debugging — POST /__agf/render/freecam _(pending)_
  Add an opt-in free-fly camera the agent can position arbitrarily without touching the game's camera control. Surface: `runtime.renderer.setFreeCam({ position, lookAt } | null)` — when non-null, the renderer creates (and pins active) a debug PerspectiveCamera at the given pose; when null, the project's normal active camera takes over again. Dev-bridge: `POST /__agf/render/freecam { position, lookAt }` + `POST /__agf/render/freecam { off: true }` + `GET /__agf/render/freecam`. Useful for inspecting blast aftermath, off-screen entities, prefab layout. Pure agent observability, not a player feature.
- **AGF-AUDIO-MASTER-VOLUME** — AudioBus grows a master volume dial — POST /__agf/audio/master-volume _(implemented)_
  engine/runtime/audio/audio-bus.ts grew `setMasterVolume(value): number` + `getMasterVolume(): number`. Master multiplies per-call volume in `play()`: `el.volume = clamp(master * (volume ?? 1), 0, 1)`. Non-finite inputs to setMasterVolume are ignored. Plumbed through src/app.ts (getAudioMasterVolume / setAudioMasterVolume), window.__agf, and GET/POST /__agf/audio/master-volume on the dev bridge (AGF_BRIDGE_INVALID_AUDIO_VOLUME on non-number).
- **KABOOM-AUDIO-MIXER-DUCK-ON-MATCH-END** — Briefly duck SFX while a match-* chime plays _(pending)_
  Build on AGF-AUDIO-MASTER-VOLUME. When the audio-binding-system fires `match-won/-lost/-draw`, it asks the audio-fx to schedule a 600 ms duck: master gain dips to 0.3 immediately, ramps back to 1.0 over the duck window. Implemented inside Kaboom's audio-fx.ts (it owns the procedural-synth path); positional bomber events that fire during the duck inherit the lower gain. Uses requestAnimationFrame or AudioParam ramps, no scheduler change.
  Depends on: AGF-AUDIO-MASTER-VOLUME.
- **AGF-PROBE-SNAPSHOT-HISTORY** — Snapshot ring buffer — GET /__agf/snapshot?at=-N replays history _(pending)_
  The current /__agf/snapshot probe returns only the live snapshot. Keep a fixed-size ring buffer (default 32) of past snapshots so an agent can diff against history (e.g. `snapshot?at=-1` vs live to see what changed last frame). New route param `at` accepts a non-positive integer index; -0 (or omitted) returns live, -1 returns the previous, etc. `at` beyond the buffer returns 400 AGF_PROBE_SNAPSHOT_OUT_OF_RANGE. The ring is filled cheaply — one entry per fixedUpdate.
- **DOC-AGENT-PROBES-REFRESH** — Refresh docs/agent-probes.md — freecam, audio master, snapshot history _(pending)_
  Pure docs sweep. Add rows for `/__agf/render/freecam`, `/__agf/audio/master-volume`, and the `at` query param on `/__agf/snapshot`. Include curl recipes + the error code for each. Verify every probe documented in the file still matches its handler signature (catch drift).

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
