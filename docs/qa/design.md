# QA-workflow design — two-terminal Dev + QA Claude split

**Status:** design, planning sprint S092 deliverable. Implementation is split into the follow-up sprints listed at the end of this document.

**Audience:** the agent that will execute the implementation stories; the user reviewing the design.

---

## 1. Goal

Run two Claude terminals in parallel against the same AGF repository:

| Terminal | Role | Owns |
|---|---|---|
| **dev** | implements sprint stories, opens / merges PRs (current behaviour) | `engine/`, `examples/`, `tests/`, `backlog/sprints/`, `scripts/` |
| **qa** | reviews each merged PR, files bug tickets back into the backlog | `backlog/qa-tickets/` (new), `qa-artifacts/` (repros, screenshots) |

QA does **not** run a regression suite — its scope is "did the PR that just landed work?". When QA happens to hit a bug in pre-existing functionality, it files **two** tickets: the bug itself, and a companion ticket for adding an automated regression test that would have caught it.

Non-goals: QA does not edit gameplay code, does not amend dev's sprint JSON, does not run preflight on its own, does not approve / merge PRs.

---

## 2. Constraints from the existing backlog engine

These are hard constraints — the design works inside them rather than reshaping them.

- **Sprint schema is strict** (`schemas/backlog/sprint.schema.json`, `additionalProperties: false`). Adding a new optional field on `story` or `sprint` requires a schema edit. Bug tickets can't piggyback unknown fields.
- **Story status enum is closed:** `pending | in_progress | implemented | deferred`. No `"verified"` / `"rejected"` states. QA verification must live outside this enum.
- **`followUps[]` is `array<string>`** (`backlog/sprints/*.sprint.json`). Structured data (severity, repro, PR link) can't be embedded — only freeform prose.
- **At most one `active` sprint** (`AGF_BACKLOG_MULTIPLE_ACTIVE` error). QA can't open its own active sprint while dev has one.
- **CLI mutate is read-write but narrow.** `scripts/backlog/mutate.mjs` supports `claim`, `done`, `defer` against a *single existing story*. There is no `add-story` / `add-bug` command yet.
- **Single long-lived sprint branch** (CLAUDE.md §"Working Mode"). Two agents committing to the same branch race each other; the convention is branch-per-actor.
- **`backlog:check` blocks commits when it errors** — both agents must keep the validators green.

These two together — strict schema + single active sprint — mean QA cannot just "open a bug story in the active sprint" without merge-conflicting with dev on every commit. The design routes around that with a separate artefact type.

---

## 3. Where bug tickets land

**Decision:** QA writes to a new artefact directory `backlog/qa-tickets/` — *not* to any `*.sprint.json`. Dev harvests tickets into the appropriate sprint at planning time.

Alternatives weighed:

| Option | Pro | Con | Verdict |
|---|---|---|---|
| A. New story in the active sprint | backlog engine handles it natively | git conflict on every QA commit (same JSON); bloats sprint scope mid-flight | rejected |
| B. New story in a pending `S<N+1>` "intake" sprint | decoupled writes; dev imports on next promotion | conflicts when the intake sprint gets flipped to `active`; QA has to chase the moving target | rejected |
| C. **Separate `backlog/qa-tickets/*.qa-ticket.json` directory** | zero overlap with sprint files; QA can file freely, dev promotes on its own cadence; schema can be richer (severity, repro, links) | requires a new schema + check + promote script; adds one engine concept | **chosen** |
| D. GitHub Issues | already exists | leaves the JSON-first backlog engine; agents need extra auth + API; dev's planning loses the data | rejected |

**Ticket lifecycle:**

```
QA creates  →  backlog/qa-tickets/QA-YYYY-MM-DD-NNN.qa-ticket.json
            ↓  (commits + opens a rolling PR labelled qa-intake)
            ↓
Main merges →  ticket file lives in main; visible to dev terminal
            ↓
Dev promotes → scripts/backlog/promote-qa.mjs reads the file,
            →   appends a story to the next-planning sprint,
            →   moves the source file to backlog/qa-tickets/archive/
```

Promotion happens during sprint planning (after archive of the previous sprint, before opening the next). Dev still owns when promoted tickets actually get implemented.

---

## 4. QA-ticket schema

New file: `schemas/qa-ticket.schema.json`.

```jsonc
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "additionalProperties": false,
  "required": ["agfFormatVersion", "id", "title", "filedAt", "severity", "type", "repro"],
  "properties": {
    "agfFormatVersion": { "const": 1 },
    "id":            { "type": "string", "pattern": "^QA-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{3}$" },
    "title":         { "type": "string", "minLength": 5 },
    "filedAt":       { "type": "string", "format": "date-time" },
    "foundInPr":     { "type": "integer", "minimum": 1 },
    "foundInSprint": { "type": "string", "pattern": "^S[0-9]{2,4}$" },
    "severity":      { "enum": ["critical", "major", "minor", "polish"] },
    "type":          { "enum": ["bug", "regression-needed", "doc", "ux"] },
    "summary":       { "type": "string" },
    "repro":         { "type": "array", "items": { "type": "string", "minLength": 1 }, "minItems": 1 },
    "expected":      { "type": "string" },
    "actual":        { "type": "string" },
    "logs":          { "type": "string", "description": "Optional console / diagnostics excerpt." },
    "screenshot":    { "type": "string", "description": "Repo-relative path under qa-artifacts/." },
    "playtest":      { "type": "string", "description": "Optional .playtest.json scenario the agent built as a reproducer." },
    "regressionFor": { "type": "string", "description": "When type='regression-needed', the bug ticket id this regression test would cover." },
    "epicHint":      { "type": "string", "description": "Optional epic id to nudge promotion into a specific epic." }
  },
  "allOf": [
    {
      "if":   { "properties": { "type": { "const": "regression-needed" } } },
      "then": { "required": ["regressionFor"] }
    }
  ]
}
```

**Conventions:**

- `id` is `QA-YYYY-MM-DD-NNN` where `NNN` is the next free three-digit slot for that date — keeps tickets sortable and avoids collisions between two QA sessions on the same day.
- `severity` × `type` matrix: `critical` is "the PR ships a broken build", `major` is "core feature regression", `minor` is "edge-case glitch", `polish` is "looks off".
- `repro` must be **steps in user-facing language**, not "the system X writes component Y". QA reproducing a bug means a human or another agent can re-walk the steps.
- `playtest` lets QA upgrade the repro to an automated scenario file (existing `examples/*/playtests/*.playtest.json` format — see `tests/e2e/playtest-runner.spec.ts`). Strongly preferred for `regression-needed` tickets.
- `regressionFor` couples a regression-test ticket to the bug it covers. The promote script ensures both end up in the same sprint and the bug's story `dependsOn` the regression-test story (so the test must exist before the fix is verified).

---

## 5. Promotion CLI

New file: `scripts/backlog/promote-qa.mjs`.

```bash
# Default: promote every ticket in backlog/qa-tickets/ into the named pending sprint.
node scripts/backlog/promote-qa.mjs --into S093

# Filter: promote only critical/major. Skips polish/minor for later cycles.
node scripts/backlog/promote-qa.mjs --into S093 --min-severity major

# Dry-run: print what would land, don't touch files.
node scripts/backlog/promote-qa.mjs --into S093 --dry-run
```

Behaviour:

1. Loads every `backlog/qa-tickets/*.qa-ticket.json` (skipping `archive/`).
2. Validates each against `schemas/qa-ticket.schema.json`.
3. For each ticket:
   - Generates a story id: `BUG-<short-slug>-<NNN>` for bugs, `REGRESSION-<short-slug>-<NNN>` for regression-needed.
   - Builds the story body: `title` = ticket title; `summary` = ticket summary + a **fenced "QA repro" block** with the repro steps, expected, actual, logs, screenshot path; `verification[]` left empty (dev fills it on implementation); `epic` = `ticket.epicHint` if present, else inherits the sprint's default epic.
   - Adds `dependsOn` linking bug → regression-test pairs.
4. Writes the new stories into the target sprint JSON (must be `status: "pending"` and writable).
5. Runs `node scripts/backlog/check.mjs` inline; on failure, restores the sprint JSON + leaves tickets in place + exits 1.
6. On success, `git mv`s each promoted ticket file to `backlog/qa-tickets/archive/<sprint-id>/<original>.json` so the audit trail survives.

The `summary` field is the only place richer-than-string metadata lives in the sprint engine. The promote script embeds severity + foundInPr + filedAt + the repro steps as a fenced section so the sprint render picks it up unchanged.

**No schema change to the sprint engine** — the only new schema is `qa-ticket.schema.json`.

---

## 6. Regression-test escalation flow

QA's heuristic for "should this bug also get an automated test?":

| Symptom | Promote a `regression-needed` ticket? |
|---|---|
| Bug exists *only* in the diff of the just-merged PR (functionality didn't work in the very first commit it appeared in) | **No** — the dev sprint's test gates should have caught it; bump severity + leave a comment in the bug ticket so dev tightens existing coverage |
| Bug exists in a feature that landed in a *previous* merged PR (regression in old behaviour) | **Yes — always.** File the bug AND a `regression-needed` ticket. |
| Visual / cosmetic glitch only, no behavioural difference | No — `polish` severity bug only; QA can attach a screenshot |
| Unreproducible / flaky on first probe | Re-probe twice. If still flaky after three attempts, file with `severity: minor` and label the type `bug` with `actual: "flaky — could not reproduce reliably"` |

The regression-needed ticket's `repro` is **the same** as the bug's repro, and its `playtest` field should reference a draft `*.playtest.json` file QA has authored under `examples/<project>/playtests/qa-proposed/`. Dev moves the file into the project's main `playtests/` directory when implementing.

The QA agent is allowed (and encouraged) to write the `.playtest.json` file as part of filing the regression ticket. That's the one exception to the "QA doesn't write to project code" rule — `playtests/qa-proposed/` is a QA-owned subdirectory.

---

## 7. Concurrency rules — how the two terminals coexist

The critical invariant: **the two agents never write to the same files**.

| File | Dev | QA |
|---|---|---|
| `engine/**`, `examples/**/src/**`, `tests/**` | write | read only |
| `backlog/sprints/*.sprint.json` | write | read only |
| `backlog/epics/*.epic.json` | write | read only |
| `scripts/**`, `package.json` | write | read only |
| `BACKLOG.md`, `BACKLOG_ARCHIVE.md` (generated) | write (via render) | read only |
| `backlog/qa-tickets/*.qa-ticket.json` | read + delete-on-promote | write |
| `examples/<project>/playtests/qa-proposed/**` | read + move-on-promote | write |
| `qa-artifacts/**` (screenshots, console dumps) | read | write |
| `docs/qa/**` (QA-flow docs) | write (during a planning sprint) | read |

**Branch policy:**

- Dev keeps the current `sprint/<N>-<slug>` branch convention.
- QA works on rolling `qa-intake/YYYY-WW` branches (one per ISO calendar week) — keeps PR titles meaningful and avoids one giant always-open PR.
- QA's PR is labelled `qa-intake` and targets `main`. It carries only files under `backlog/qa-tickets/`, `examples/**/playtests/qa-proposed/`, and `qa-artifacts/`. The PR description lists each ticket id + one-line summary.
- Dev's sprint branch rebases off `main` at the start of every story so it picks up freshly-merged QA tickets without explicit coordination.

**Why this can't merge-conflict:** QA only adds new files in directories that dev never modifies. Dev only modifies files in directories QA never touches. Both agents read each other's outputs. Git can fast-forward both sides independently.

**One edge case** — when dev runs `promote-qa.mjs`, it deletes the source ticket files. If QA pushes new tickets between the read and the delete, the new tickets remain in `backlog/qa-tickets/` and dev's commit doesn't touch them. Next promotion picks them up. Safe.

**Two-Claude race on the active sprint:** dev edits the active sprint JSON freely; QA never reads-then-writes it, so no race. Even if QA naively reads BACKLOG.md mid-render, the worst case is QA sees a stale list of stories — it doesn't cause data loss.

---

## 8. Acceptance-criteria standard (developer's obligation)

For QA to verify a story, dev must declare *what a successful behaviour looks like in user-facing terms*. Today `verification[]` is a freeform array of strings that mixes "what the dev did" with "how it was tested". We add a convention:

The **first entry** of every `verification[]` array on an *implemented* story must start with `acceptance: ` (literal prefix). The rest of the entry is one sentence describing how a user / agent would observe the feature working. Existing implementation-side notes follow as subsequent entries.

Example:

```jsonc
"verification": [
  "acceptance: Boot examples/kaboom-crew, press Esc, see the Audio: ON|OFF toggle in the pause menu; clicking it mutes every SFX without reload.",
  "audio-fx.ts: muted flag short-circuits play(); existing audio-fx unit tests stay green",
  "bootstrap.ts pause menu button toggles audioFx.setMuted + writes localStorage",
  "Muted state survives a reload (localStorage takes precedence absent a ?audio= override)"
]
```

Backlog-check enforcement (optional first pass — easy to add later):

- For any story with `status: "implemented"`, warn (`AGF_BACKLOG_NO_ACCEPTANCE`, severity `warning`) if no entry of `verification` starts with `acceptance:`.
- Promote to `error` after a grace period (one or two sprints) so we don't break existing archived sprints retroactively.

QA reads the first `acceptance:` line as its job description for the story. Without one, QA returns a `severity: polish` ticket of type `doc` asking dev to add one — keeps the loop in-system.

---

## 9. Documentation deliverables

Files to add or update during the implementation sprint:

| File | Purpose | Status |
|---|---|---|
| `CLAUDE.md` | Add a §QA-Workflow section pointing at the role split, file ownership table, and the qa-intake PR convention. Update the §Working-Mode section to note the rebase-from-main step. | edit |
| `AGENTS.md` | Repo-wide rules — add a note that the QA-agent role exists and has its own onboarding doc. | edit |
| `docs/qa/agent.md` | **Onboarding doc the QA terminal loads on first boot.** Lists what to read (test-recipe, agent-probes, this design doc), what tools to run, the file-ownership table, the ticket schema with examples, the regression-promotion heuristic. | new |
| `docs/qa/ticket-template.md` | A canonical "fill in the blanks" qa-ticket scaffold the QA agent can copy from. | new |
| `docs/qa/regression-promotion.md` | The flow chart from §6, expanded with examples. | new |
| `.claude/agents/qa-reviewer.md` | Claude Code subagent definition — name, model, tool allowlist (Read, Bash, WebFetch limited, etc.), short system prompt that points at `docs/qa/agent.md`. | new |
| `schemas/qa-ticket.schema.json` | The schema from §4. | new |
| `scripts/backlog/promote-qa.mjs` | The CLI from §5. | new |
| `scripts/backlog/check.mjs` | Extend to also validate `backlog/qa-tickets/**/*.qa-ticket.json`. | edit |
| `docs/agent-probes.md` | No edit — QA reuses the existing probes. | unchanged |
| `docs/agent/test-recipe.md` | Add a "Reading a PR diff as QA" subsection — the QA-specific opening of the same recipe. | edit |

---

## 10. Tooling needs

The good news from the inventory pass:

- **`/__agf/*` probes already cover most of what QA needs.** snapshot, diagnostics, renderer-info, renderer-inspect, console-log, pool-inventory, asset-inventory, runtime/timescale — all live. No new probes needed for v1.
- **Playtest framework exists** (`examples/*/playtests/*.playtest.json` + `tests/e2e/playtest-runner.spec.ts` + `scripts/watch-playtests.mjs`). QA writes new scenarios into `playtests/qa-proposed/` and the existing runner picks them up.
- **`.claude/agents/playtest-runner.md` already exists.** QA-reviewer subagent can delegate playtest execution to it for the heavy-lifting cases.

What's missing and gets built this implementation:

- `scripts/backlog/qa-ticket.mjs new "<title>"` — scaffolds a fresh `QA-YYYY-MM-DD-NNN.qa-ticket.json` with today's date and the next free NNN. Pre-fills `agfFormatVersion`, `filedAt`, an empty `repro` array, and a TODO marker on `severity` / `type`. Eliminates 30 seconds of friction per ticket.
- `npm run qa:check` — runs `backlog:check` plus a focused pass over the qa-tickets directory, prints any tickets with `severity: critical` so QA notices it has urgent inbox.
- A small Playwright helper `tests/e2e/qa-helpers/probe-pr.spec.ts` (sketch — not part of v1) — boots a project, takes a snapshot, dumps console, captures a screenshot named after the QA ticket id. Each QA session can copy it as a starting point.

---

## 11. Success criteria + dogfood plan

The implementation sprint succeeds when:

1. `backlog/qa-tickets/` directory + schema exist and validate via `backlog:check`.
2. `scripts/backlog/promote-qa.mjs` round-trips a fixture ticket into a pending sprint and back to the archive.
3. `docs/qa/agent.md` is concise enough for a fresh Claude to load in < 30 seconds and start filing meaningful tickets.
4. The first dogfood sprint after implementation runs both terminals concurrently for ≥ 3 days. Measured outcomes:
   - At least one merged PR gets a QA review with a filed ticket (positive: QA caught something; or `severity: polish` if no bug).
   - At least one `regression-needed` ticket has been filed and promoted.
   - Zero merge conflicts on `backlog/**` between the two terminals.
   - Dev's preflight runtime is unchanged from the pre-QA baseline (we didn't break CI).

**Dogfood sprint (planned, not part of this design):** the first dogfood sprint should be a low-stakes Kaboom Crew polish sprint, so the QA agent has obvious user-facing surface to verify (visual polish, audio events, HUD widgets) — exactly what we've been shipping in S088 → S090.

---

## 12. Open questions / risks

- **Risk: QA latency.** If QA only reviews after dev merges, regressions land in main before QA sees them. Mitigation: agents are cheap, so QA *can* run a pre-merge probe on the open PR if the user wants — design supports both modes, the qa-tickets path is the same.
- **Risk: ticket-id race between two QA sessions.** Two QA terminals filing `QA-2026-05-20-001` simultaneously could conflict. Mitigation: `qa-ticket.mjs new` scans the directory + existing ids in this branch, increments past the max. Two separate branches will still collide; we accept that as a v2 problem (single-QA-agent is the default).
- **Risk: dev forgets to promote.** Tickets stagnate in the directory. Mitigation: `engine doctor` adds a "QA inbox: N tickets, M critical" line so it's visible at every doctor run. `npm run preflight` includes a `qa:check` that warns on critical-severity tickets older than one sprint.
- **Risk: `regression-needed` tickets pile up faster than dev can implement them.** Healthy state — tracks our test-coverage debt. The promotion can be lazy (one regression-test story per implementation sprint is fine).
- **Risk: the QA agent invents bugs that aren't bugs** (bad spec interpretation). Mitigation: the `acceptance:` line is the contract — if dev wrote one and QA followed it, the ticket is valid by definition. Disputes go in the ticket as `severity: polish, type: doc`.

---

## 13. Implementation sprints (followUps for this planning sprint)

The promotion of this design into running code is split across two sprints. They're seeded as `followUps[]` on S092's JSON so the next planning round picks them up.

**Sprint S093 — QA workflow engine + docs**
- `QA-INTAKE-SCHEMA` — add `schemas/qa-ticket.schema.json`; extend `scripts/backlog/check.mjs` to validate `backlog/qa-tickets/**`.
- `QA-INTAKE-PROMOTE` — `scripts/backlog/promote-qa.mjs` (filter + dry-run + archive move + check-on-write).
- `QA-INTAKE-NEW` — `scripts/backlog/qa-ticket.mjs new "<title>"` scaffold helper.
- `QA-DOCS-AGENT-ONBOARD` — write `docs/qa/agent.md` + `docs/qa/ticket-template.md` + `docs/qa/regression-promotion.md`.
- `QA-DOCS-CLAUDE-MD` — update `CLAUDE.md` (file-ownership table + QA section) + `AGENTS.md` (note the role).
- `QA-AGENT-DEFINITION` — `.claude/agents/qa-reviewer.md`.
- `QA-DOCTOR-INBOX` — `engine doctor` surfaces the qa-tickets inbox count + critical-age warning.
- `QA-ACCEPTANCE-CONVENTION` — extend `backlog:check` with the `AGF_BACKLOG_NO_ACCEPTANCE` warning on implemented stories without an `acceptance:` line.

**Sprint S094 — first dogfood + iterate**
- A normal Kaboom-Crew-polish sprint that runs with the QA terminal active. The QA-side deliverable is "≥1 filed ticket per merged PR + ≥1 regression-needed ticket promoted". The dev-side deliverable is whatever stories make sense at the time.

**Out of scope for both sprints:**
- Pre-merge QA review (deferred until we know the post-merge flow works).
- A web dashboard for QA tickets (the JSON files + BACKLOG.md are enough).
- Cross-sprint analytics on QA throughput.

---

End of design.
