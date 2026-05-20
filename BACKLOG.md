# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S090 — Engine time-scale primitive + Kaboom Crew feel pass

Status: **active** (started 2026-05-20). Source: `backlog/sprints/S090.sprint.json`.

### Stories

- **AGF-RUNTIME-TIME-SCALE** — runtime.setTimeScale(x) — engine-level slow-mo / fast-forward _(implemented)_
  RuntimeHandle gains `setTimeScale(scale)` + `getTimeScale()`. The loop multiplies the real wallclock dt by the scale before advanceFixedStep / setting time.dt — so fixed-step accumulator and frame dt scale identically (deterministic systems still tick on the same simulated clock, just at a different tempo). Exported `clampTimeScale(value)` enforces [0.05, 4]; non-finite inputs (NaN, ±Inf) fall back to 1.
- **AGF-DEV-BRIDGE-TIME-SCALE** — POST /__agf/runtime/timescale over the dev bridge _(implemented)_
  Mirror the in-page accessor over the dev bridge so scripted playtests can flip time-scale without poking at window.__agf. `POST /__agf/runtime/timescale { value: 0.25 }` proxies to runtime.setTimeScale and returns the clamped scale; `GET /__agf/runtime/timescale` returns the live value. Plumbed through agf-dev-bridge route table + page-bridge channels + main.ts handler.
- **KABOOM-BOMB-FUSE-WIGGLE** — Bomb mesh wiggles in scale as fuse nears 0 _(implemented)_
  Added pure helper `bombWiggleScale(fuseRemaining, now?)` to bomb-fuse-system: returns 1 when fuseRemaining > 2 (fresh bomb sits still), otherwise sin(t * frequency) modulation around 1 with amplitude 0.04 → 0.14 and frequency 4 → 12 Hz as urgency rises (fuseRemaining → 0). The system rewrites Transform.scale on the bomb each fixed step when fuse <= 2; otherwise leaves it untouched so the mutation counter doesn't churn.
- **KABOOM-DEATH-FALL** — Dying bomber visibly tips over before despawn _(implemented)_
  audio-binding-system's alive→dead detection writes a `DeathAnim { elapsed: 0 }` component + zeroes GridMover.queuedDirection. New `kaboom.death-animation` system tweens Transform.rotation X toward Math.PI/2 over 0.4 s with an ease-out-quad curve; baseline rotation is captured the first tick we see the entity so a rotated mesh still tips. Pure helper `deathFallPitch(elapsed, baseX)` exported for tests.
- **KABOOM-FOOTSTEP-TICK** — Tiny click on every grid-cell crossing _(implemented)_
  AudioEventKind grows a `footstep` value. audio-binding-system maintains a per-bomber GridPosition cache (`prevBomberCell`) and fires one 'footstep' event per (gx,gz) change between fixed ticks. Dead bombers (alive===false) skip the check so a corpse mid-DeathAnim stays silent. audio-fx.ts plays a 25 ms low-gain triangle click around 180 Hz — barely audible solo, satisfying when chained.
- **KABOOM-MINIMAP-DANGER-OVERLAY** — Minimap tints projected blast cells red _(implemented)_
  MinimapData gains an optional `cells: ReadonlyArray<MinimapCellOverlay>` field — world-space cell rectangles painted UNDER the markers (default 40%-alpha red `rgba(255,90,90,0.4)`, size 1 cell). Kaboom Crew bootstrap holds a reference to the live GridOccupancyQuery (`_boundOccupancy`) and feeds the minimap with `projectedBlastCells(world, occupancy)` results each frame. Helper lives in `examples/kaboom-crew/src/danger.ts` and mirrors blast-propagation's projection rules (hard walls block, soft blocks burn-and-stop).
- **AGF-DOCS-RUNTIME-HANDLE-AUDIT** — Inline JSDoc audit on RuntimeHandle surface _(pending)_
  RuntimeHandle has grown a lot: invalidateAsset, snapshot, applyCommands, save/load, pick, hud, audio, frameTiming, startRecording/stopRecording, setDebugSystem (S89), setTimeScale (this sprint). Sweep `engine/runtime/start.ts` so every method on the exported type has a one-paragraph TSDoc comment explaining the contract + the sprint that introduced it. No behaviour changes.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
