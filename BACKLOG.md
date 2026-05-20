# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S097 — Game-design proposal flow + entity dump probe + component write + diagnostics-since

Status: **active** (started 2026-05-20). Source: `backlog/sprints/S097.sprint.json`.

### Stories

- **GAME-DESIGN-PROPOSED-STORY-SCHEMA** — schemas/proposed-story.schema.json + AJV validation in backlog:check _(pending)_
  Add the JSON Schema for `backlog/proposed-stories/*.story-proposal.json`. Required fields: `agfFormatVersion`, `id` (pattern: `GDP-YYYY-MM-DD-NNN`), `createdAt` (ISO date string via pattern), `title`, `kind` (enum: feature|mechanic|balance|content), `intent` (markdown body, minLength 20), `priority` (enum: must|should|could). Optional: `epic`, `rationale`, `acceptanceHints` (string array). `additionalProperties: false`. Wire AJV validation into `scripts/backlog/check.mjs` so the next backlog:check call validates everything under backlog/proposed-stories/.
- **GAME-DESIGN-PROPOSE-SCAFFOLD** — scripts/backlog/propose.mjs + `npm run propose:new` scaffolds a fresh ticket _(pending)_
  Companion to `npm run qa:ticket` (S093). `npm run propose:new -- --title "<title>" --kind feature --priority should` writes a fresh `backlog/proposed-stories/GDP-YYYY-MM-DD-NNN.story-proposal.json` with the boilerplate filled in (id auto-incremented from existing same-day tickets; createdAt = now; intent = empty placeholder for the agent to fill). Echoes the file path so the agent can immediately open it for editing.
  Depends on: GAME-DESIGN-PROPOSED-STORY-SCHEMA.
- **GAME-DESIGN-PROPOSE-PROMOTE** — scripts/backlog/promote-proposed.mjs + `npm run propose:promote -- --into S<N>` _(pending)_
  Companion to `npm run qa:promote` (S093). Walks every `backlog/proposed-stories/*.story-proposal.json`, converts each into a story entry in the target sprint JSON, then archives the source file under `backlog/proposed-stories/archive/<sprint-id>/`. Story conversion: id = proposal.id (prefix GDP→ a stable readable prefix), title = proposal.title, summary = proposal.intent (+ any rationale), epic = proposal.epic (or undefined), status='pending'. `acceptanceHints` become a `// hints:` line in summary that the dev agent will tighten when writing real verification[].
  Depends on: GAME-DESIGN-PROPOSED-STORY-SCHEMA.
- **AGF-PROBE-ENTITY-DUMP** — GET /__agf/entity/<entityId> returns every component on a single entity _(pending)_
  Companion to S096 AGF-PROBE-COMPONENT-AT. Same path style, returns ALL components on one entity rather than one named component. Useful for the common debug flow 'what's the full state of player.1 right now?' without pulling the whole world snapshot. Supports `?at=-N` for history (same ring as component-at). Errors: 404 AGF_PROBE_ENTITY_NOT_FOUND.
- **AGF-PROBE-COMPONENT-WRITE** — POST /__agf/component/<entityId>/<componentName> writes a single component value _(pending)_
  Write counterpart of S096 AGF-PROBE-COMPONENT-AT. Today's only mutation surface is POST /commands (broad) and POST /project-patch (file-level). Add a focused POST that takes `{ value }` in the body and calls `world.setComponent(entityId, componentName, value)` server-side. Surface: dev-bridge only (security: same trust boundary as the rest of /__agf/*). Validates that the entity exists (404 AGF_PROBE_ENTITY_NOT_FOUND); the component name is not required to pre-exist (write can ADD components). Returns the new component value.
- **AGF-PROBE-DIAGNOSTICS-SINCE** — GET /__agf/diagnostics?since=<timestamp> filters by timestamp _(pending)_
  Today's /diagnostics returns the entire diagnostics ring buffer. For long-running sessions an agent wants 'what's new since I last asked' to avoid re-parsing every entry. Add `since` query param: ISO timestamp; only diagnostics with `t > since` are returned. Returns the live tail when `since` is omitted (current behaviour). Returns 400 AGF_BRIDGE_INVALID_DIAGNOSTICS_SINCE when `since` is non-ISO.
- **KABOOM-CONTROLS-HINT-FADE** — Controls-hint banner fades out the same way as the title screen _(pending)_
  Mirror the S096 KABOOM-TITLE-SCREEN-FADE pattern on the controls-hint banner (currently snaps off after 4 s). Use the shared `fadeOutOpacityCurve(elapsedMs, durationMs)` helper. Hint fades over 350 ms (slightly longer than the title — it appears later, the player is more focused on gameplay).
- **DOC-PROPOSED-STORY-RECIPE** — docs/agent-debug-recipes.md — game-design proposed-story workflow recipe _(pending)_
  Adds the eleventh recipe to docs/agent-debug-recipes.md showing the game-design agent's loop: (1) read the GDD + last sprint archive, (2) `npm run propose:new -- --title "..." --kind feature`, (3) fill in intent + acceptanceHints in the generated file, (4) wait for the dev terminal's next sprint plan, (5) the dev terminal runs `npm run propose:promote -- --into S<N>`. Closes the loop docs-wise.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
