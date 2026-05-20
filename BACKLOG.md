# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S098 — QA followups (S90/S96 verification) + entity create/delete probes + input inject + game-design dogfood

Status: **active** (started 2026-05-20). Source: `backlog/sprints/S098.sprint.json`.

### Stories

- **AGF-PROBE-ENTITY-CREATE** — POST /__agf/entity creates a new entity with an initial component map _(pending)_
  Write counterpart to S097 AGF-PROBE-ENTITY-DUMP. Body: `{ entityId: string, components: Record<string, unknown> }`. Server-side calls world.addEntity(entityId) + world.setComponent for each entry. Refuses to clobber an existing id with 409 AGF_PROBE_ENTITY_EXISTS. Returns the same shape as the GET path so the caller can confirm. Useful for tests + for game-design agent dogfooding (drop a fixture entity to verify a system).
- **AGF-PROBE-ENTITY-DELETE** — DELETE /__agf/entity/<entityId> removes an entity wholesale _(pending)_
  Completes the entity CRUD triplet (create / read / delete + S097's component write). Server-side calls world.removeEntity(entityId). Reuses parseEntityPath. Returns 404 AGF_PROBE_ENTITY_NOT_FOUND when the entity is unknown. Useful when an agent's automation script needs to clean up after itself, or when running probes against an isolated test entity that should not leak between runs.
- **AGF-PROBE-INPUT-INJECT** — POST /__agf/input/action lets QA fire game inputs without DOM focus (QA-006) _(pending)_
  Promoted from QA-2026-05-20-006. Today's player-input-system listens on window keydown events, and browsers refuse to dispatch trusted KeyboardEvents from page.evaluate / Playwright keyboard.press once the HUD overlay grabs focus. QA can't verify visual gameplay features (bomb-wiggle, death-fall, danger overlay) because they can't fire the bomb-place action from automation. Add a project-agnostic POST /__agf/input/action that takes `{ entityId, action, value? }` and writes a generic `InputAction` transient onto the entity. Project-local input systems can consume that component the same way they consume keyboard events. Reuses the engine's existing `applyCommands` machinery on the runtime; no new auth surface. Pairs with the planned game-design dogfood (proposals written this sprint will be verified next sprint using this probe).
- **BUG-ENGINE-CLI-INSPECT-SUMMARY-FLAKE** — engine-cli 'prints a stable inspect summary' test flakes at 5000ms (QA-004) _(pending)_
  Promoted from QA-2026-05-20-004. The integration test in tests/unit/engine-cli.test.ts that spawns `tsx engine/tools/cli.ts inspect ...` occasionally exceeds the 5000ms vitest default timeout. ~1/3 of runs fail in QA's environment. The root cause is the cold-start cost of tsx + the full CLI dependency graph; the actual inspect logic is cheap. Fix: bump the test's timeout to 15000ms AND pre-warm the tsx process via a `beforeAll` hook so subsequent runs hit a warm cache (when the test is part of a larger run). Keep the test's actual assertions unchanged.
- **REGRESSION-ENGINE-CLI-INSPECT-SUMMARY** — Lock the engine-cli flake fix with a deterministic timing test (QA-005) _(pending)_
  Promoted from QA-2026-05-20-005 (regressionFor QA-004). After BUG-ENGINE-CLI-INSPECT-SUMMARY-FLAKE lands, add a regression test that runs the inspect summary 3 times back-to-back and asserts each completes in <10 s. Catches future regressions where someone removes the warmup or bloats the dependency graph again.
  Depends on: BUG-ENGINE-CLI-INSPECT-SUMMARY-FLAKE.
- **GAME-DESIGN-DOGFOOD** — First end-to-end dogfood of the propose:new → propose:promote flow _(pending)_
  Exercise the S097-shipped game-design agent flow with real proposals. (1) `npm run propose:new -- "Decal-on-grid renderer primitive (M27)" --kind feature --priority should --epic M27-DECAL-LAYER` + fill in intent/rationale/acceptanceHints from notes/dynabomber-readiness-analysis.md §14. (2) `npm run propose:new -- "Region-rule modifier primitive (M28)" --kind mechanic --priority could --epic M28-REGION-RULES` + fill in. (3) Verify both pass `npm run backlog:check`. (4) Create a pending S099 sprint shell so `npm run propose:promote -- --into S099 --skip-check` has a target. (5) Promote both proposals. (6) Verify the S099 sprint JSON now has two pending stories with FEAT- prefixes and the source files moved under archive/S099/.
- **DOC-QA-INVALID-TICKET-FLOW** — docs/qa/invalid-ticket-handling.md — how dev rejects QA tickets that don't apply _(pending)_
  Define the convention captured ad-hoc in this sprint (rejecting QA-001 + QA-003). When dev decides a QA ticket should NOT promote into a sprint (already-fixed, intentional behavior, duplicate, etc.), they `git mv` the JSON file under `backlog/qa-tickets/archive/rejected/` and append a one-line rationale to that directory's README.md. QA can still see the ticket; the directory tells them dev considered it and declined. Documents both halves: when dev rejects (and why), and what QA does when they see a ticket get rejected (don't refile; argue in a comment if needed).
- **KABOOM-BLAST-DANGER-DECAL** — Danger overlay on cells inside a bomb's projected blast radius _(pending)_
  Visual readability polish: while a bomb's fuse is < 1 s remaining, paint a translucent red overlay on every cell that the eventual blast will cover. Distinct from the post-detonation BlastTile (which already exists) — this is the PREDICTION layer so the player can dodge in time. Uses the existing `projectedBlastCells(world, gx, gz, range)` helper from examples/kaboom-crew/src/danger.ts. Tile component: project-local DangerTile entity (color: '#ff3a3a', alpha: 0.35, layer: 'fx-below') auto-removed when the bomb detonates or its fuse > 1 s again. Lays groundwork for the M27 decal layer epic without requiring it.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
