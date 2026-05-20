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
- **BUG-ENGINE-CLI-INSPECT-SUMMARY-FLAKE** — engine-cli 'prints a stable inspect summary' test flakes at 5000ms (QA-004) _(implemented)_
  Promoted from QA-2026-05-20-004. Each `it()` in tests/unit/engine-cli.test.ts spawns a fresh `tsx engine/tools/cli.ts` — cold-start of tsx + the full CLI dep graph reliably blows the 5000ms vitest default on slower workers. Fix: per-test timeout override `CLI_TEST_TIMEOUT_MS = 15000` applied to every CLI integration case. Pre-warm was considered but rejected — each `spawn` is a fresh process so Node's module cache doesn't survive across spawns; a beforeAll warmup costs cycles without speeding the individual cases. Test-infra fix only; no product change.
- **REGRESSION-ENGINE-CLI-INSPECT-SUMMARY** — Lock the engine-cli flake fix with a deterministic timing test (QA-005) _(implemented)_
  Promoted from QA-2026-05-20-005 (regressionFor QA-004). Adds 'S98 regression: 3x warm inspect runs finish under 10s each' — loops 3 inspect runs back-to-back, measures wall-clock per run, asserts each < 10000ms. Per-test timeout is CLI_TEST_TIMEOUT_MS * 3 = 45000ms to cover the full sequence. Catches future regressions on either axis: a stuck process (>10s wall) or a slow-but-finishing process (still <10s each but cumulative >45s).
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
