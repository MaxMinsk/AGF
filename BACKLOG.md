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
- **QA-INTAKE-PROMOTE** — scripts/backlog/promote-qa.mjs — tickets → pending-sprint stories _(pending)_
  Promotion CLI from S092 design §5. `node scripts/backlog/promote-qa.mjs --into S093 [--min-severity major] [--dry-run]`: walks `backlog/qa-tickets/*.qa-ticket.json`, validates each, generates a sprint story (id `BUG-<slug>-<NNN>` / `REGRESSION-<slug>-<NNN>`), embeds a fenced QA-repro block in the story `summary`, links bug↔regression-test pairs via `dependsOn`, writes to the target sprint JSON (must be status=pending), runs check.mjs inline (restores on failure), and `git mv`s promoted source files to `backlog/qa-tickets/archive/<sprint-id>/`. Dry-run prints the plan without touching files.
- **QA-ACCEPTANCE-CONVENTION** — backlog:check warns when an implemented story lacks `acceptance:` line _(pending)_
  Extend `scripts/backlog/check.mjs` with a soft rule (warning, not error): for every story where status='implemented', the first entry of `verification[]` should start with the literal prefix `acceptance:` (case-insensitive). Emit `AGF_BACKLOG_NO_ACCEPTANCE` warning per offending story. Grace period: warning only — promote to error in a later sprint once the existing archived sprints have been cleaned up. Add a doctor-side note that summarises the count.
- **QA-DOCTOR-INBOX** — engine doctor surfaces QA inbox count + critical-age warning _(pending)_
  Extend `engine/tools/doctor/project-doctor.ts` with a `qaInbox` block populated by walking `backlog/qa-tickets/*.qa-ticket.json` from repo root. Report: total tickets, breakdown by severity, ids of the oldest critical and oldest major. Recommendation when any `critical` ticket has filedAt older than 24h (suggests dev to promote ASAP). The format pass prints the section under `QA inbox:` after the existing Backlog block.
- **QA-DOCS-AGENT-ONBOARD** — QA agent onboarding docs (agent.md + ticket-template.md + regression-promotion.md) _(pending)_
  Write three concise markdown docs under `docs/qa/`: (1) `agent.md` — onboarding for a fresh QA Claude (what to read, what tools, file-ownership table from design §7, ticket schema link, the 'acceptance:' contract); (2) `ticket-template.md` — fill-in-the-blanks scaffold mirroring the schema; (3) `regression-promotion.md` — the heuristic flow chart from design §6 expanded with two worked examples (new-PR-only bug → no regression ticket; old-functionality bug → both tickets). Each doc < 250 lines.
- **QA-DOCS-CLAUDE-MD** — Update CLAUDE.md + AGENTS.md with the QA-workflow section _(pending)_
  Add a §QA-Workflow block to `CLAUDE.md`: file-ownership table (dev writes engine/examples/tests/sprints/, QA writes backlog/qa-tickets/ + notes/qa/ + examples/**/playtests/qa-proposed/), the qa-intake/YYYY-WW branch convention, the rebase-from-main rule at story start. Update the §Working-Mode bullets accordingly. Add a one-line pointer in `AGENTS.md` so non-Claude agents notice the role exists. Keep both files as terse as possible.
- **QA-AGENT-DEFINITION** — .claude/agents/qa-reviewer.md subagent definition _(pending)_
  Land `.claude/agents/qa-reviewer.md`: name + description (so the parent agent can route to it via subagent_type), model (Sonnet — cheaper for verification work), tools allowlist (Read, Bash limited to read-only commands + qa-ticket.mjs + playtest runner, WebFetch off, Write restricted to backlog/qa-tickets/** + notes/qa/** + examples/**/playtests/qa-proposed/**), short system prompt that points at docs/qa/agent.md as the canonical onboarding read.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
