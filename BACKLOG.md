# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S087 — Kaboom Crew match flow + camera shake + engine timing test coverage

Status: **active** (started 2026-05-19). Source: `backlog/sprints/S087.sprint.json`.

### Stories

- **KABOOM-PLAYER-VS-BOT-COLOR** — Distinct player vs bot color tint via difficulty preset patch _(implemented)_
  At a glance the two bombers should be visually distinct. Bootstrap forces a blue tint on `player.1` and a red tint on `bot.1` via `component.set MeshRenderer.color` on initial attach + every restart. Minimap already uses these colors; this just makes the world view match.
- **KABOOM-BOMB-COUNTDOWN-PULSE** — Bomb fuse pulses faster as it approaches 0 _(implemented)_
  Project-local BombFuseSystem (or a small companion system) modulates `MeshRenderer.color` on each Bomb between two warning colors. Pulse period = max(0.08 s, fuseRemaining / 8); near the end the bomb effectively flashes white→orange. No new components, no schema changes.
- **KABOOM-MATCH-BEST-OF-5** — Match concept — first bomber to 3 wins is the match winner _(implemented)_
  Promote the existing tally into a 'match' construct. RoundState gains `matchTarget: number` (default 3) and `matchPhase: 'in-progress' | 'won' | 'lost' | 'draw'`. RoundResolveSystem flips matchPhase the moment tally.player or tally.bot hits matchTarget. The HUD banner shows MATCH win/loss banner on top of the round banner; the auto-restart skips when the match is over (player can press R to start a new match).
- **KABOOM-CAMERA-SHAKE** — Camera shake on blast — small, decaying _(implemented)_
  When a BlastEvent fires, perturb the camera transform with a 0.3-second decaying noise. Implementation: a tiny project-local CameraShakeSystem reads BlastEvent transient + writes Transform.position offsets on the active camera; offsets decay each frame; resets to baseline once shake intensity drops below 0.001. Magnitude scales with blast range so a range-4 detonation is felt more than range-2.
- **AGF-FRAME-SPIKE-UNIT-TEST** — Unit test for AGF_FRAME_SPIKE emission + cooldown _(implemented)_
  S86 AGF-FRAME-TIMING-SPIKE-DIAGNOSTIC shipped without a dedicated unit test (only the boot-noise budget smoke covers it). Pull the spike check into a tiny pure helper inside start.ts (or a sibling util) + unit-test it: synthetic frame sequence with one spike → exactly one emission; sustained spikes throttle to ≤ 1 emission per cooldown window.
- **AGF-DOCTOR-RECENT-COMMITS** — engine doctor — Recent commits section (last 10 git log entries) _(implemented)_
  Add a recent-commits block to DoctorReport sourced from `git log --oneline -10` (one-time, captured at doctor invocation). Useful when the agent's bug-hunt needs context for 'what changed lately'. Silently empty when git is unavailable.
- **KABOOM-HUD-KEY-GLYPHS** — HUD shows current Player input state via key glyphs _(implemented)_
  Tiny `kaboom.input` widget at bottomLeft alongside stats: small grid of WASD + Space key glyphs that light up while the key is held. Reads pressed-key state via a new `runtime.kaboom.input()` accessor on the existing PlayerInputSystem (exposes the internal pressed set as ReadonlyArray<string>). Helps players see which keys are detected as pressed (handy for stuck-key debugging).
- **AGF-ASSET-INVENTORY-TEST** — Unit test for AssetRegistry.inventory() status transitions _(implemented)_
  S86 AGF-ASSET-INVENTORY-PROBE shipped the API without an explicit unit test. Add coverage: pending → loaded on resolve; pending → failed on reject; invalidate() clears the status; subsequent get() restarts at pending.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
