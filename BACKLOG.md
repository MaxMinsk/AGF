# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S107 — Kaboom Crew quality cleanup — perf budget + shadow caster tags

Status: **active** (started 2026-05-22). Source: `backlog/sprints/S107.sprint.json`.

### Stories

- **KABOOM-CREW-PERF-BUDGET** — Add performance-budget.json to examples/kaboom-crew _(implemented)_
  engine doctor flagged: kaboom-crew has no performance-budget.json. Other examples (material-bench, procbomber-bench) ship one and gate CI's bundle:check against it. Now that S104 swapped the static sphere bombers for the 19-entity procedural tree + S106 added accessories (~ +3 entities × 4 bombers), the renderer footprint is non-trivial. Add a budget locking the current main + vendor chunk sizes so future bloat surfaces in PRs.
- **KABOOM-CREW-SHADOW-CASTER-TAGS** — Tag bombers as ShadowCaster { dynamic: true }; static arena blocks stay default _(implemented)_
  engine doctor flagged: no ShadowCaster {dynamic:true} entities, so every caster re-bakes its shadow every frame even though arena blocks never move. Tag bombers (player.1 + bot.1 + their procedural tree parts) as `dynamic: true`; soft-blocks + hard-blocks stay default (static) so DynamicShadowSystem skips their per-frame pass. Renderer cost reduction tracked via doctor on the next preflight.

### Notes

- Tiny cleanup sprint. Both stories surfaced from `npm run engine:doctor -- examples/kaboom-crew` recommendations. No GD inbox + no user feedback this cycle — picking up obvious quality work the doctor already flagged.
- Skipped this round: capture a kaboom-crew playtest scenario (needs browser recording), engine fix for 'runtime-spawned prefab false-positive' (the bomb prefab is used at runtime but doctor flags it — separate small engine story for later).

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
