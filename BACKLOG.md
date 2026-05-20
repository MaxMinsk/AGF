# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S092 — QA-workflow design — plan the two-terminal Dev + QA split

Status: **active** (started 2026-05-20). Source: `backlog/sprints/S092.sprint.json`.

### Stories

- **AGF-QA-WORKFLOW-DESIGN** — Plan the two-terminal Dev + QA Claude workflow (thorough design doc) _(implemented)_
  User wants to run two Claude terminals in parallel: terminal 1 is the developer (current setup); terminal 2 is a QA agent reviewing each merged PR and filing bug tickets back into the backlog. QA does NOT run regression — but on an old-functionality bug it files BOTH the bug AND a regression-test escalation. Deliverable is `notes/qa-workflow-design.md`, a thorough design covering: role split, ticket destination (new artefact dir `backlog/qa-tickets/` to dodge sprint-JSON conflicts), ticket schema (`schemas/qa-ticket.schema.json`), regression-promotion heuristic, concurrency rules (file-ownership table + qa-intake branch convention), acceptance-criteria standard on `verification[]`, documentation deliverables (CLAUDE.md / docs/qa/* / .claude/agents/qa-reviewer.md), tooling reuse (existing `/__agf/*` probes + playtest framework), success criteria + dogfood plan, and risks. Implementation is split across two follow-up sprints (S093 engine + docs; S094 first dogfood) seeded as followUps[] below.

### Follow-ups already noted

- S093 QA-INTAKE-SCHEMA — add schemas/qa-ticket.schema.json + extend scripts/backlog/check.mjs to validate backlog/qa-tickets/**.
- S093 QA-INTAKE-PROMOTE — scripts/backlog/promote-qa.mjs with --into / --min-severity / --dry-run; archives source files on success.
- S093 QA-INTAKE-NEW — scripts/backlog/qa-ticket.mjs new "<title>" scaffold helper (auto-id, today's date, empty repro skeleton).
- S093 QA-DOCS-AGENT-ONBOARD — write docs/qa/agent.md + docs/qa/ticket-template.md + docs/qa/regression-promotion.md.
- S093 QA-DOCS-CLAUDE-MD — update CLAUDE.md (file-ownership table + QA section) + AGENTS.md (note the role).
- S093 QA-AGENT-DEFINITION — .claude/agents/qa-reviewer.md subagent definition; tools allowlist, model, system prompt pointing at docs/qa/agent.md.
- S093 QA-DOCTOR-INBOX — engine doctor surfaces a "QA inbox: N tickets, M critical" line; preflight warns on critical tickets older than one sprint.
- S093 QA-ACCEPTANCE-CONVENTION — extend backlog:check with AGF_BACKLOG_NO_ACCEPTANCE warning on implemented stories whose verification[] lacks an `acceptance: ...` first entry.
- S094 QA-FIRST-DOGFOOD — run a normal Kaboom Crew polish sprint with the QA terminal active; success = ≥1 filed ticket per merged PR + ≥1 regression-needed ticket promoted + zero backlog/** merge conflicts.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
