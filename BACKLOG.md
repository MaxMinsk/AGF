# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S092 — QA-workflow design — plan the two-terminal Dev + QA split

Status: **active** (started 2026-05-20). Source: `backlog/sprints/S092.sprint.json`.

### Stories

- **AGF-QA-WORKFLOW-DESIGN** — Plan the two-terminal Dev + QA Claude workflow (thorough design doc) _(in_progress)_
  User wants to run two Claude terminals in parallel: terminal 1 is the developer (current setup — closes sprint stories, opens + merges PRs); terminal 2 is a QA agent who reviews the functionality shipped in each PR and files bug tickets back into the backlog. QA does NOT run regression — but if QA hits a bug in old functionality, it files BOTH a bug ticket AND a story for adding a regression test to the automated suite. This sprint is planning-only: produce `notes/qa-workflow-design.md` covering the design end-to-end, including: (1) the role split (what each agent owns / never does), (2) where bug tickets land (next-sprint backlog vs a dedicated bug-stream sprint vs in-place follow-ups — pick the cleanest fit with the JSON-first backlog engine), (3) ticket format (story id naming, severity, repro-steps shape, links to the PR that introduced the regression), (4) regression-suite escalation flow (the QA agent's heuristic for deciding when an old-functionality bug warrants automation, the new-story format that points back to the bug), (5) backlog-engine schema changes needed (e.g. `source: 'qa'` flag on stories, optional `repro` field, optional `regressionTest` field), (6) concurrency rules (how do two Claudes share `backlog/sprints/*.sprint.json` without stepping on each other — file locks? lane convention? branch policy?), (7) acceptance-criteria checklist that the developer agent must produce per story so the QA agent has something concrete to verify against, (8) documentation deliverables (CLAUDE.md updates, AGENTS.md, a new QA-AGENTS.md or similar), (9) tooling — does QA need a dedicated playwright skill / probe / fixture set, (10) success criteria + dogfood plan (the first sprint where both agents actually run side by side). The deliverable is the design doc itself; this sprint does NOT ship any engine code or tooling — those follow-up sprints are seeded as `followUps` on this sprint JSON when the design lands.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
