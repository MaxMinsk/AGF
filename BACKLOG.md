# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S093 — QA workflow engine + docs (S092 follow-up)

Status: **active** (started 2026-05-20). Source: `backlog/sprints/S093.sprint.json`.

### Stories

- **QA-INTAKE-SCHEMA** — QA-ticket JSON schema + check.mjs validation _(implemented)_
  Landed `schemas/qa-ticket.schema.json` (every field from S092 design §4) and extended `scripts/backlog/check.mjs` to walk `backlog/qa-tickets/*.qa-ticket.json` (skipping `archive/`), parse + validate via the existing AJV instance, and emit AGF_QA_TICKET_PARSE / _SCHEMA / _DUPLICATE_ID diagnostics. Empty inbox is silent. Conditional rule baked into the schema: when type='regression-needed', regressionFor must be set.
- **QA-INTAKE-NEW** — scripts/backlog/qa-ticket.mjs new "<title>" scaffold helper _(implemented)_
  scripts/backlog/qa-ticket.mjs implements the `new` subcommand: writes a fresh `QA-YYYY-MM-DD-NNN.qa-ticket.json` (date in UTC; NNN auto-incremented past the highest existing for today) into `--into <dir>` (default `backlog/qa-tickets/`). Pre-fills agfFormatVersion=1, filedAt=now, id, title (from positional arg). Flags: `--severity`, `--type`, `--found-in-pr`, `--found-in-sprint`, `--regression-for`. Body uses literal `TODO: ...` placeholders for repro / expected / actual / summary so a `grep TODO backlog/qa-tickets/` lists every unfinished ticket, AND the placeholders are long enough to satisfy schema minLength so the file passes backlog:check on first save. Refuses to clobber an existing path. Prints the absolute path to stdout for `$EDITOR` piping. New npm script `qa:ticket` wraps the CLI.
- **QA-INTAKE-PROMOTE** — scripts/backlog/promote-qa.mjs — tickets → pending-sprint stories _(implemented)_
  scripts/backlog/promote-qa.mjs walks `backlog/qa-tickets/*.qa-ticket.json`, validates each against schemas/qa-ticket.schema.json (aborts on any failure — no partial writes), filters by `--min-severity`, and builds one story per ticket. Story ids follow `BUG-<UPPERCASE-SLUG>-<NNN>` / `REGRESSION-<UPPERCASE-SLUG>-<NNN>` to satisfy the sprint schema's `^[A-Z][A-Z0-9-]*$` pattern. NNN auto-increments past existing story-id collisions. The story `summary` embeds a fenced QA-repro block (severity, filedAt, repro steps, expected, actual, logs, screenshot, playtest, source ticket id) so the sprint render carries the full reproducer. Bug↔regression-test pairs are linked via `dependsOn` so the bug fix can't be claimed until the regression test exists. After the write, the script runs `scripts/backlog/check.mjs --json` inline; on any error it restores the original sprint JSON and exits non-zero. Successful promotion archives source files via `renameSync` into `backlog/qa-tickets/archive/<sprint-id>/`. Flags: `--into S0NN` (required, must be pending), `--min-severity`, `--dry-run`, `--qa-dir <path>` / `--sprints-dir <path>` / `--skip-check` (test-time overrides). New npm script `qa:promote`.
- **QA-ACCEPTANCE-CONVENTION** — backlog:check warns when an implemented story lacks `acceptance:` line _(implemented)_
  scripts/backlog/check.mjs gains a soft rule: every story.status='implemented' must have a first verification[] entry whose trimmed text matches `/^acceptance\s*:/i`. Missing acceptance fires AGF_BACKLOG_NO_ACCEPTANCE warning. Restricted to non-archived sprints — backfilling 80+ archived sprints would drown the output (~600 warnings, confirmed). New work (active + pending sprints) is enforced from now; the legacy clean-up is a follow-up sprint when we want it.
- **QA-DOCTOR-INBOX** — engine doctor surfaces QA inbox count + critical-age warning _(implemented)_
  BacklogReport gains an optional `qaInbox` block (total, bySeverity, oldest 5 sorted by severity-then-filedAt, staleCritical for >24h tickets). summarizeBacklog walks backlog/qa-tickets/*.qa-ticket.json (skipping archive/) and populates it. formatBacklog renders a `QA inbox: N ticket(s) (...)` line followed by the top 5 with severity tags + a stale-critical warning when applicable. Empty inbox → block omitted. Doctor's `--diagnostics-from`-style flags weren't needed (the inbox lives in the same repo root the doctor already reads).
- **QA-DOCS-AGENT-ONBOARD** — QA agent onboarding docs (agent.md + ticket-template.md + regression-promotion.md) _(implemented)_
  Three docs landed under docs/qa/: (1) agent.md — onboarding (read-first list, file-ownership table, qa-intake branch convention, CLI tools, live probes, the acceptance: contract, ticket filing loop, what counts as a bug, what to never do); (2) ticket-template.md — minimum body, full body with example, per-field reference table, severity tiers, type guide; (3) regression-promotion.md — decision tree, two worked examples (new-PR-only bug vs old-functionality regression), heuristics on .playtest.json + flaky-bug handling.
- **QA-DOCS-CLAUDE-MD** — Update CLAUDE.md + AGENTS.md with the QA-workflow section _(pending)_
  Add a §QA-Workflow block to `CLAUDE.md`: file-ownership table (dev writes engine/examples/tests/sprints/, QA writes backlog/qa-tickets/ + notes/qa/ + examples/**/playtests/qa-proposed/), the qa-intake/YYYY-WW branch convention, the rebase-from-main rule at story start. Update the §Working-Mode bullets accordingly. Add a one-line pointer in `AGENTS.md` so non-Claude agents notice the role exists. Keep both files as terse as possible.
- **QA-AGENT-DEFINITION** — .claude/agents/qa-reviewer.md subagent definition _(pending)_
  Land `.claude/agents/qa-reviewer.md`: name + description (so the parent agent can route to it via subagent_type), model (Sonnet — cheaper for verification work), tools allowlist (Read, Bash limited to read-only commands + qa-ticket.mjs + playtest runner, WebFetch off, Write restricted to backlog/qa-tickets/** + notes/qa/** + examples/**/playtests/qa-proposed/**), short system prompt that points at docs/qa/agent.md as the canonical onboarding read.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
