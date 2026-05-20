# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S090 — Engine time-scale primitive + Kaboom Crew feel pass

Status: **active** (started 2026-05-20). Source: `backlog/sprints/S090.sprint.json`.

### Stories

- **AGF-RUNTIME-TIME-SCALE** — runtime.setTimeScale(x) — engine-level slow-mo / fast-forward _(implemented)_
  RuntimeHandle gains `setTimeScale(scale)` + `getTimeScale()`. The loop multiplies the real wallclock dt by the scale before advanceFixedStep / setting time.dt — so fixed-step accumulator and frame dt scale identically (deterministic systems still tick on the same simulated clock, just at a different tempo). Exported `clampTimeScale(value)` enforces [0.05, 4]; non-finite inputs (NaN, ±Inf) fall back to 1.
- **AGF-DEV-BRIDGE-TIME-SCALE** — POST /__agf/runtime/timescale over the dev bridge _(pending)_
  Mirror the in-page accessor over the dev bridge so scripted playtests can flip time-scale without poking at window.__agf manually. `POST /__agf/runtime/timescale { value: 0.25 }` calls runtime.setTimeScale on the active page and returns the clamped value; `GET /__agf/runtime/timescale` returns the live value. Plumbed through page-bridge + agf-dev-bridge + main.ts the same way every other runtime surface is.
- **KABOOM-BOMB-FUSE-WIGGLE** — Bomb mesh wiggles in scale as fuse nears 0 _(pending)_
  S87 added a color pulse on bomb fuse, but the mesh sits still otherwise. Add a per-frame Transform.scale modulation in BombFuseSystem: `1 + 0.12 * Math.sin(t * pulseFreq)` where pulseFreq grows as fuseRemaining drops. The scale ratchets back to baseline when fuseRemaining > 2 (no wiggle on a freshly-placed bomb). Pure-helper `bombWiggleScale(fuseRemaining)` exported so the unit test can lock the curve.
- **KABOOM-DEATH-FALL** — Dying bomber visibly tips over before despawn _(pending)_
  Today death is instant — alive flips false, sprite goes to half-opacity / vanishes (whichever the renderer does), particle puff fires. Add a short death animation: when BomberStats.alive flips true → false, set Transform.rotation to a fall angle (90° on X axis), and pause the GridMover for 0.5 s before death finalisation. Reads better; emphasises agency.
- **KABOOM-FOOTSTEP-TICK** — Tiny click on every grid-cell crossing _(pending)_
  Player has no audio feedback for movement — only blast/bomb/pickup/death. Add a `footstep` AudioEventKind that fires when a bomber crosses a grid cell (GridPosition gx/gz changes). audio-binding tracks per-bomber positions across ticks. audio-fx plays a 25 ms muted click — barely audible solo, satisfying when chained. Inherits the mute toggle.
- **KABOOM-MINIMAP-DANGER-OVERLAY** — Minimap tints projected blast cells red _(pending)_
  The minimap shows bombs as dots, but a player can't see the danger zone from a glance. Compute the same projected-blast cells the bot AI already uses (bomb origin + cardinals × range, blocked by hard walls) and overlay them as semi-transparent red rectangles before the bomb dot is drawn. Same data source as bot-ai's buildDangerMap — extracted into a tiny shared helper.
- **AGF-DOCS-RUNTIME-HANDLE-AUDIT** — Inline JSDoc audit on RuntimeHandle surface _(pending)_
  RuntimeHandle has grown a lot: invalidateAsset, snapshot, applyCommands, save/load, pick, hud, audio, frameTiming, startRecording/stopRecording, setDebugSystem (S89), setTimeScale (this sprint). Sweep `engine/runtime/start.ts` so every method on the exported type has a one-paragraph TSDoc comment explaining the contract + the sprint that introduced it. No behaviour changes.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
