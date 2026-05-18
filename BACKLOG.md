# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S086 — Kaboom Crew polish round 2 + engine perf gates + asset inventory probe

Status: **active** (started 2026-05-18). Source: `backlog/sprints/S086.sprint.json`.

### Stories

- **AGF-AUDIO-VOLUME-DIAL** — Audio volume dial — query param + localStorage persistence _(pending)_
  Project-friendly volume control. `?audio=off` mutes; `?audio=0..1` sets master gain; default `1.0`. Persist the last-applied value in localStorage under `agf.audio.volume` so a reload keeps the setting. KaboomAudioFx already accepts masterGain; this story wires the URL + storage read on attachUi and re-applies on the same reset hook the difficulty preset uses.
- **AGF-FRAME-TIMING-SPIKE-DIAGNOSTIC** — Auto-emit AGF_FRAME_SPIKE warning when frame > 50 ms _(pending)_
  Engine-side passive perf gate. The runtime already samples per-phase frame timing into a window (M21-frame-timing). Add a guard that emits `severity: 'warning', code: 'AGF_FRAME_SPIKE'` once per spike — defined as totalFrameMs > spikeMs (default 50). Cooldown 1 s between emissions so a stuck frame doesn't spam the bus. Configurable via `RuntimeOptions.spikeMs`. Stays off when set to 0.
- **KABOOM-DEATH-PARTICLES** — Particle puff when a bomber dies _(pending)_
  Mirror the S84 blast-burst pattern on death. When `BomberStats.alive` flips from true to false, the project-local audio-binding system already emits 'death'; add a sibling effect: spawn a short-lived 'glow' preset emitter (capacity 10, lifetime 0.5 s) at the bomber's grid cell. Gives the round-end moment some visual weight.
- **KABOOM-MAP-VARIANT-WIDE** — Second arena preset — `?map=wide` (17x13 cells) _(pending)_
  Second hand-tuned arena variant. `examples/kaboom-crew/scenes/wide.scene.json` (17 × 13 cells, more soft blocks, bots start further apart). Selectable via `?map=wide` (default `start`). Schema-level changes are zero — the grid bounds live in the Grid singleton component already.
- **AGF-ASSET-INVENTORY-PROBE** — /__agf/asset-inventory — list every loaded / pending asset ref _(pending)_
  New GET endpoint on the dev bridge. Returns every asset the runtime touched: `{ ref, kind, status }[]` where status ∈ 'loaded' | 'pending' | 'failed'. Pairs with the existing /__agf/asset/invalidate POST — agents working an HMR issue get a complete inventory before deciding what to bust. Mirrors the rendererInspect / diagnostics pattern.
- **AGF-LOG-MATERIAL-BINDING-LIFT** — Lift material-binding-system console sites to runtime.diagnostics _(pending)_
  S85 closed renderer-adapter sites but the material-binding-system file-level allow marker stayed because the system didn't have a bus reference. Thread `{ diagnostics? }` into the system's deps options + lift the 5 warn/error sites (mesh-load failure, mesh has no Mesh, material-load failure, material has no kind, applied to unknown handle). Drop the file-level marker.
- **KABOOM-PAUSE-MENU** — Esc opens a pause menu — Resume / Restart / Difficulty cycle _(pending)_
  Centre HUD widget with three clickable rows. Esc toggles. Resume removes GamePaused (same pattern as the title screen). Restart calls restartScene. Difficulty cycles easy → normal → hard, applies the preset immediately to bot.1 + writes it into `?difficulty=` via history.replaceState so a reload preserves it.
- **AGF-DOCTOR-FOLLOWUP-LIST** — engine doctor surfaces sprint-level follow-ups _(pending)_
  Tail of every archived sprint JSON's `followUps[]` (free-text strings) is interesting next-up reading; right now an agent has to grep them by hand. Add a `followUps: { sprintId, text }[]` block to DoctorReport (collected from backlog/sprints/*.sprint.json) so `engine doctor --json` surfaces the running list. Cap at 20 most recent.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
