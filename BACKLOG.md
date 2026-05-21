# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S104 — CharacterRecipe schema + Kaboom Crew procbomber migration

Status: **active** (started 2026-05-22). Source: `backlog/sprints/S104.sprint.json`.

### Stories

- **CHORE-GDP-2026-05-22-PROMOTION** — Move GDP-2026-05-22-001..004 from proposed-stories/ to the archive _(implemented)_
  4 proposals filed 2026-05-22. 001 + 002 (must) promote as S104 stories. 003 (accessory layer) + 004 (hit-recoil + spring-sway) deferred via sprint notes to S105 — the must-priority CharacterRecipe + migration first.
- **KABOOM-RECIPE-SCHEMA** — CharacterRecipe JSON schema + TypeScript types _(implemented)_
  Promoted from GDP-2026-05-22-001 (must). Today the bomber recipe lives as a mutable BenchState in bench-state.ts — never serialised, never validated. This story locks the shape: a JSON schema under examples/procbomber-bench/schemas/character-recipe.schema.json carrying { seed, headSize, torsoHeight/Width, upperArm/forearm/upperLeg/lowerLeg lengths + widths, posture, mounts, spread, shapes, paletteName, paletteOverrides }. CharacterRecipe TypeScript type derived from the schema. Pure schema + type — no codec yet (next story).
- **KABOOM-RECIPE-CODEC** — Recipe serialize/deserialize + seed-only resolver _(implemented)_
  Promoted from GDP-2026-05-22-001. Adds three pure functions: encodeRecipe(recipe) → base64-url-safe string; decodeRecipe(string) → validated CharacterRecipe (or undefined on parse/validate failure); resolveRecipeFromSeed(seed) → fully-populated CharacterRecipe with all fields deterministically derived from the seed string. The resolver lets the simplest call `?seed=42` produce a complete bomber without listing every knob in the URL. Heavy + heavy unit-test coverage — codec round-trip determinism is the foundation downstream consumers depend on.
- **KABOOM-RECIPE-URL-KNOBS** — Bench reads ?recipe= + ?seed= URL params _(implemented)_
  Promoted from GDP-2026-05-22-001. Bench bootstrap recognises two new URL params: ?recipe=<base64> overrides every slider on load; ?seed=<string> drives resolveRecipeFromSeed to fully-populate the bench. Existing ?bomberPalette + ?bomberAnim URL knobs continue to work, applied on top. /__agf/<probe> endpoints deferred — the URL surface unblocks deterministic agent screenshot capture today, the probes can land when the kaboom-crew migration creates a concrete consumer.
- **KABOOM-MIGRATE-PREFABS** — Kaboom Crew player.prefab + bot.prefab use procedural:procbomber tree _(pending)_
  Promoted from GDP-2026-05-22-002 (must — re-promote of S102 deferred -21-007). Replace the static sphere meshes on `player.prefab.json` + `bot.prefab.json` with procedural-tree spawning. Each prefab no longer carries a MeshRenderer at the root — bootstrap calls spawnBomberTree() per player/bot entity on round start. Procbomber generator code is imported from `examples/procbomber-bench/src/generators/` + `bomber-tree-spawner.ts` (cross-example import — narrowest possible surface; the bench stays the iteration sandbox per GDP-002 acceptance). Existing gameplay (BomberStats, GridMover, blast, round resolve) untouched.
- **KABOOM-BOMBER-ANIMATION-PROD** — Drive bomber animation kind from gameplay state (idle / walk / reach / death) _(pending)_
  Port the bench-animation-system to Kaboom Crew as a project-local system + add a gameplay-driver system that writes BenchAnimationState.kind based on the bomber's current state: GridMover idle → 'idle-bob'; GridMover moving (currentLerp > 0) → 'walk-swing'; DeathAnim component present → 'none' (death-animation-system already handles the rotation); placing a bomb fires a temporary 'reach' burst. Falls back to 'none' for unrecognised states. Bench-animation-system stays at examples/procbomber-bench/ — production system is a thin wrapper plus the gameplay-driver.
- **KABOOM-REACH-IK-PLACE-BOMB** — Reach IK animation triggered by PlaceBombRequest _(pending)_
  Promoted from GDP-2026-05-22-004 (partial — only the reach piece this sprint). When a bomber fires PlaceBombRequest, the gameplay-driver from KABOOM-BOMBER-ANIMATION-PROD writes BenchAnimationState.kind = 'reach' for ~0.4 seconds before reverting to walk/idle. The reach target points at the bomb's grid cell. This is the visible 'plant the bomb' gesture — the missing piece between the existing IK math (S103) and gameplay.
- **KABOOM-REMOTE-DETONATE-SPACE-BIND** — Space also detonates paused bombs (not only the F key) _(implemented)_
  User reported the remote-detonate power-up appears broken: pressing Space after placing a paused bomb doesn't detonate. The actual mapping uses F — never documented. UX fix: extend the REMOTE_DETONATE key set from ['KeyF'] to ['KeyF', 'Space']. Both PlaceBombRequest + RemoteDetonateRequest now fire on Space: if the player has remaining bomb slots, a new paused bomb spawns; if any paused bombs already exist, they detonate. Pressing Space three times places three paused bombs (charges permitting), the fourth press detonates the chain. F stays as the explicit single-purpose detonate trigger.

### Notes

- GDP-2026-05-22-003 (accessory layer) deferred. Belongs in its own sprint after migration stabilises — the production bombers need a stable recipe surface first, then accessories layer on top.
- GDP-2026-05-22-004 hit-recoil + spring-sway pieces deferred. Reach-on-bomb-place lands this sprint; hit-recoil + spring-sway are smaller separate stories in S105 once accessories give spring-sway something to actually sway.
- Cross-example import: kaboom-crew/bootstrap.ts pulls generator code from examples/procbomber-bench/src/. Narrow surface only — the generator dir + bomber-tree-spawner. Bench retains its own bench-state + bench-ui + bench-animation-system as the iteration sandbox per GDP-002 acceptance.
- /__agf/recipe + /__agf/recipe/seed agent probe endpoints deferred. URL knobs unblock deterministic playtest screenshots today; the probes land when an integration test needs them.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
