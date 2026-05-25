# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S139 — Bot personality variants — visual differentiation + random in solo

Status: **active** (started 2026-05-25). Source: `backlog/sprints/S139.sprint.json`.

### Stories

- **FEAT-PERSONALITY-RANDOM-IN-SOLO-001** — Solo default: pick a random bot personality per page load _(implemented)_
  examples/kaboom-crew/src/difficulty.ts — extend readBotPersonalityFromUrl with a `pickRandomBotPersonality(rng?: () => number)` helper that returns one of hunter/coward/miner with equal probability. Read flow: if the URL carries `?botPersonality=hunter|coward|miner` use that (explicit override); otherwise pick random once. The bootstrap caches the choice in a module-level singleton so all the reads (initial spawn + round restart) get the SAME personality across a single page load — the player isn't surprised by a mid-match swap.
- **TEST-PERSONALITY-RANDOM-IN-SOLO-001** — Unit test the random personality picker + URL override precedence _(implemented)_
  examples/kaboom-crew/tests/unit/difficulty.test.ts — add tests covering: (1) pickRandomBotPersonality with a deterministic stub rng returns each kind for the expected mod-3 input; (2) URL override beats the random default (any of hunter/coward/miner takes precedence); (3) absent URL param triggers the random path; (4) the bootstrap-facing 'session personality' helper memoises one pick per page load.
- **FEAT-PERSONALITY-PALETTE-OVERRIDE-001** — Recipe palette overrides per personality _(implemented)_
  examples/kaboom-crew/bootstrap.ts makeKaboomRecipe gains an optional personality arg. Mapping: hunter → 'ember', coward → 'slate', miner → 'sand'. Falls back to the existing 'rose' when personality is absent (e.g. on the connected profile where the server owns bot.1). Player stays on 'sky' (player.1 path is unchanged). Wiring: the two attachUi sites (initial spawn + reset) pass the cached session personality.
- **TEST-PERSONALITY-PALETTE-OVERRIDE-001** — Recipe builder returns the personality-mapped palette _(implemented)_
  examples/kaboom-crew/tests/unit/recipe-personality.test.ts — call makeKaboomRecipe('bot.1', 'hunter') / ('bot.1', 'coward') / ('bot.1', 'miner') and assert .paletteName equals 'ember' / 'slate' / 'sand' respectively. Plus: makeKaboomRecipe('bot.1') (no personality) falls back to 'rose'; makeKaboomRecipe('player.1') stays on 'sky' regardless of personality (player isn't affected).
- **FEAT-PERSONALITY-ACCESSORY-MARKER-001** — Each personality carries a distinctive accessory _(implemented)_
  Apply per-personality accessory override on the bot recipe: hunter → 'antennae' (head.top socket), coward → 'visor' (head.front), miner → 'cap' (head.top). Replaces whatever the seed-derived recipe picked for bot.1 so the marker is reliable regardless of seed. makeKaboomRecipe builds a single-accessory list when personality is set.
- **TEST-PERSONALITY-ACCESSORY-MARKER-001** — Recipe builder writes the personality-mapped accessory _(implemented)_
  examples/kaboom-crew/tests/unit/recipe-personality.test.ts — assert makeKaboomRecipe('bot.1', personality).accessories[0].kind matches 'antennae' / 'visor' / 'cap' for the three personalities. Single-element list — no other accessories on the bot when personality drives the marker.
- **DOC-PERSONALITY-VISUALS-001** — README + URL-params doc updated with the visual contract _(pending)_
  examples/kaboom-crew/README.md — table mapping personality → palette + accessory. Note that solo defaults to random per page load (set `?botPersonality=hunter|coward|miner` to lock).

### Notes

- S100 introduced three bot personalities (hunter / coward / miner) but visually every bot still uses the same 'rose' palette + no accessory marker — the player can't tell them apart at a glance. This sprint wires personality to the procedural recipe so each variant has its own look.
- User request also asks: when running solo with no ?botPersonality= URL param, pick a RANDOM personality per page load (stable across round restarts of the same match). Pre-fix the default was always 'hunter', so every solo session played the same.
- Mapping: hunter → ember palette + antennae accessory (aggressive scout); coward → slate palette + visor accessory (defensive); miner → sand palette + cap accessory (workman). Three palettes chosen from the existing BomberPalettes for instant visual readability.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
