# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S159 — Dash mechanic — Shift+direction 2-cell arc burst with 3s cooldown

Status: **active** (started 2026-05-27). Source: `backlog/sprints/S159.sprint.json`.

### Stories

- **SCHEMA-KABOOM-DASH-001** — DashRequest component + BomberStats dash fields _(implemented)_
  examples/kaboom-crew/schemas/scene-extensions.schema.json — adds DashRequest transient with required {dx, dz} cardinals and BomberStats fields: dashCooldownRemainingMs, dashing, dashStartGx, dashStartGz, dashTargetGx, dashTargetGz, dashElapsedMs. engine:check passes.
- **FEAT-KABOOM-DASH-INPUT-001** — Shift + direction-edge writes DashRequest _(implemented)_
  examples/kaboom-crew/src/systems/player-input-system.ts — adds DASH_MODIFIER set (ShiftLeft / ShiftRight) and a resolveDirectionEdge() helper. On a direction key's rising edge while Shift is held and no DashRequest already pending, writes DashRequest{dx, dz}. Dash-system handles cooldown / validation refusal — input does NOT pre-check, so refused requests still consume one frame of input but burn no cooldown.
- **FEAT-KABOOM-DASH-SYSTEM-001** — Dash system — validate, initiate, arc, land, cooldown _(implemented)_
  examples/kaboom-crew/src/systems/dash-system.ts (NEW) — consumes DashRequest each fixedUpdate. Validates alive + dashCooldownRemainingMs<=0 + not already dashing + cardinal-only. Computes landing cell via resolveDashTarget (walks up to 2 cells, falls back to 1, refuses if first step hard-blocked). Per-tick arc lerp on Transform.position (parabolic Y peak at 0.5 mid-arc); GridPosition snaps on land (200ms). Cooldown decrements each non-dashing tick (3000ms ceiling).
- **FEAT-KABOOM-DASH-HUD-001** — Powerup-grid HUD dash slot with cooldown sweep _(implemented)_
  examples/kaboom-crew/src/powerup-icons.ts — adds triple-chevron 'dash' PowerupIconKind. examples/kaboom-crew/bootstrap.ts — powerup-grid type gains dashCooldownFraction, new buildDashCell renders a cell with a conic-gradient cooldown sweep (full pie when fraction=1, empty when 0). Status snapshot mapper surfaces dashCooldownRemainingMs; HUD update derives dashCooldownFraction = clamp(ms/3000, 0..1).
- **TEST-KABOOM-DASH-001** — Unit tests for dash-system + dash arc + target resolution _(implemented)_
  examples/kaboom-crew/tests/unit/dash-system.test.ts — 16 tests covering: dashArcPosition pure helper (start/end/midpoint/clamp), resolveDashTarget (clear path, hard-wall at +2 falls to +1, hard-wall at +1 refuses, out-of-bounds), and createKaboomDashSystem (initiates+sets cooldown, dead refused, cooldown-blocked, hard-wall refused, fallback dash, lands at target with GridPosition snap, cooldown reaches 0 after ~3s).

### Notes

- Implements GDP-2026-05-27-014. Walk + Kick + Throw glove were the only movement verbs; dash gives every bomber a universal escape/chase tool with a 3-second cooldown and 2-cell range.
- Scope kept tight to the GDP's MVP slice: schema + input edge-detect + dash-system + HUD cooldown ring + unit tests. Bot AI dash decisions, dash voice slot, and animation pose (mid-arc lean) are out of scope and remain in the GDP backlog.
- Live playtest verified: from (3,1) a Shift+ArrowRight dash lands at (5,1) within ~200ms, second immediate dash is refused (cooldown 2.4s remaining), HUD cell shows the cooldown sweep.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
