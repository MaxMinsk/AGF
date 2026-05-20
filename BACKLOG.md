# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S097 — Game-design proposal flow + entity dump probe + component write + diagnostics-since

Status: **active** (started 2026-05-20). Source: `backlog/sprints/S097.sprint.json`.

### Stories

- **GAME-DESIGN-PROPOSED-STORY-SCHEMA** — schemas/proposed-story.schema.json + AJV validation in backlog:check _(implemented)_
  schemas/proposed-story.schema.json defines the wire shape for `backlog/proposed-stories/*.story-proposal.json` (strict additionalProperties:false). Required: agfFormatVersion (const 1), id (^GDP-YYYY-MM-DD-NNN), title (minLength 5), createdAt (ISO pattern), kind (feature|mechanic|balance|content), intent (minLength 20), priority (must|should|could). Optional: epic, rationale, acceptanceHints (string array minLength 5 each), notes. scripts/backlog/check.mjs now reads + AJV-validates every file under backlog/proposed-stories/ (skipping archive/) using the same shared AJV instance + same diagnostic style as the QA ticket loader. Missing dir is fine; missing schema downgrades to a warning.
- **GAME-DESIGN-PROPOSE-SCAFFOLD** — scripts/backlog/propose.mjs + `npm run propose:new` scaffolds a fresh ticket _(implemented)_
  scripts/backlog/propose.mjs mirrors scripts/backlog/qa-ticket.mjs: `node scripts/backlog/propose.mjs new "<title>" [--kind X] [--priority Y] [--epic Z] [--into DIR]` writes a fresh `backlog/proposed-stories/GDP-YYYY-MM-DD-NNN.story-proposal.json` with the next free three-digit slot for the date (UTC). Helpers `computeDatePrefix` + `nextFreeSlot` are exported so tests can lock the slot-allocation logic. CLI body runs only when invoked as a script (test imports don't trigger process.exit). package.json gets `propose:new` and a placeholder `propose:promote` script. Echoes the absolute path to stdout so the agent can pipe to $EDITOR.
  Depends on: GAME-DESIGN-PROPOSED-STORY-SCHEMA.
- **GAME-DESIGN-PROPOSE-PROMOTE** — scripts/backlog/promote-proposed.mjs + `npm run propose:promote -- --into S<N>` _(implemented)_
  Mirrors scripts/backlog/promote-qa.mjs. Walks every `backlog/proposed-stories/*.story-proposal.json`, validates against the schema, filters by `--min-priority` (could|should|must), generates a story per proposal with kind-based id prefix (feature/mechanic→FEAT, balance→BAL, content→CONTENT), appends to the target sprint's stories[], runs inline backlog:check (skippable via `--skip-check` for test isolation), restores the sprint JSON on check failure, and archives source files to `backlog/proposed-stories/archive/<sprint-id>/`. `--dry-run` prints the plan without writing. Test-time overrides: `--proposed-dir`, `--sprints-dir`. Summary body embeds the proposal's intent + rationale + a bulleted 'Acceptance hints' list + a source-proposal footer.
  Depends on: GAME-DESIGN-PROPOSED-STORY-SCHEMA.
- **AGF-PROBE-ENTITY-DUMP** — GET /__agf/entity/<entityId> returns every component on a single entity _(implemented)_
  engine/runtime/start.ts grew `entityAt(entityId, at?)` returning a tagged union { ok: components } | entity-not-found | out-of-range. The bridge wires GET /entity/:entityId via a new exported `parseEntityPath` helper (rejects empty + extra path segments, decodes URL-encoded ids). Supports `?at=-N` for history (same ring as componentAt). Errors map to 404 AGF_PROBE_ENTITY_NOT_FOUND, 400 AGF_PROBE_SNAPSHOT_OUT_OF_RANGE, 400 AGF_BRIDGE_INVALID_ENTITY_PATH, 400 AGF_BRIDGE_INVALID_SNAPSHOT_AT. Plumbed through src/app.ts, window.__agf, and page-bridge `entity-at` RPC.
- **AGF-PROBE-COMPONENT-WRITE** — POST /__agf/component/<entityId>/<componentName> writes a single component value _(implemented)_
  engine/runtime/start.ts grew `setComponentAt(entityId, componentName, value)` returning { ok: value } | entity-not-found (delegates to world.setComponent for the actual mutation; component name is not required to pre-exist — write can ADD components). The bridge wires POST /component/:entityId/:componentName: reuses S096's parseComponentPath, validates that the request body has a `value` key (rejects with 400 AGF_BRIDGE_INVALID_COMPONENT_WRITE otherwise), forwards via the new page-bridge `component-write` RPC, maps entity-not-found to 404. Returns the persisted value in the response so the caller can confirm.
- **AGF-PROBE-DIAGNOSTICS-SINCE** — GET /__agf/diagnostics?since=<timestamp> filters by timestamp _(pending)_
  Today's /diagnostics returns the entire diagnostics ring buffer. For long-running sessions an agent wants 'what's new since I last asked' to avoid re-parsing every entry. Add `since` query param: ISO timestamp; only diagnostics with `t > since` are returned. Returns the live tail when `since` is omitted (current behaviour). Returns 400 AGF_BRIDGE_INVALID_DIAGNOSTICS_SINCE when `since` is non-ISO.
- **KABOOM-CONTROLS-HINT-FADE** — Controls-hint banner fades out the same way as the title screen _(pending)_
  Mirror the S096 KABOOM-TITLE-SCREEN-FADE pattern on the controls-hint banner (currently snaps off after 4 s). Use the shared `fadeOutOpacityCurve(elapsedMs, durationMs)` helper. Hint fades over 350 ms (slightly longer than the title — it appears later, the player is more focused on gameplay).
- **DOC-PROPOSED-STORY-RECIPE** — docs/agent-debug-recipes.md — game-design proposed-story workflow recipe _(pending)_
  Adds the eleventh recipe to docs/agent-debug-recipes.md showing the game-design agent's loop: (1) read the GDD + last sprint archive, (2) `npm run propose:new -- --title "..." --kind feature`, (3) fill in intent + acceptanceHints in the generated file, (4) wait for the dev terminal's next sprint plan, (5) the dev terminal runs `npm run propose:promote -- --into S<N>`. Closes the loop docs-wise.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
