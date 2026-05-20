# Invalid QA ticket handling

The QA terminal files tickets in good faith. Sometimes a ticket is **not actionable** — dev evaluates it and decides not to promote it into a sprint. This doc defines the convention.

The closed enum from `docs/qa/design.md` (§29) — `pending | in_progress | implemented | deferred` — applies to **sprint stories**, not QA tickets. QA tickets don't have a "rejected" state. The rejection happens by **archival path**: dev moves the JSON file to a sibling archive directory and writes a one-line rationale into a shared README.

## When does dev reject a ticket?

The four common cases, with the first sprint they hit in this repo:

| Case | Example | Convention |
|---|---|---|
| **Already fixed** | QA-2026-05-20-001 (S96) — the bug landed in the same PR's sprint-close commit; QA filed against a stale checkout. | Move to `archive/rejected/`. Reference the commit SHA + PR number in the README rationale. |
| **Intentional behavior** | QA-2026-05-20-003 (S98) — QA reported "promote-qa accepts active sprints" as a bug. Dev had relaxed that guard intentionally in S91 to support the dogfood loop; the test was updated to match. | Move to `archive/rejected/`. Cite the sprint where the behavior was made intentional + why. |
| **Duplicate of an open ticket** | QA-XXXX-NN-NN-NNN reports the same observation as QA-XXXX-NN-NN-MMM. | Move to `archive/rejected/`. Cross-reference the surviving ticket id in the README. |
| **Out of scope / won't fix** | QA suggests a feature that doesn't fit the project direction. | Move to `archive/rejected/`. Briefly explain the disposition (e.g. "deferred indefinitely — feature lives in the maybe pile, not the backlog"). |

## Mechanics

Working dir example (sprint where this convention solidified: S98):

```bash
# 1. Move the JSON.
mkdir -p backlog/qa-tickets/archive/rejected
git mv backlog/qa-tickets/QA-2026-05-20-001.qa-ticket.json \
       backlog/qa-tickets/archive/rejected/QA-2026-05-20-001.qa-ticket.json

# 2. Append rationale to the directory README (one bullet per ticket).
$EDITOR backlog/qa-tickets/archive/rejected/README.md

# 3. Commit as part of the dev terminal's sprint-plan commit, not as a
#    standalone rejection commit. Triage and sprint-plan are one
#    coherent step.
```

The `backlog/qa-tickets/archive/rejected/README.md` file already exists (seeded in S98) — open it and add a bullet for each newly-rejected ticket. Format:

```markdown
- **QA-2026-05-20-NNN** — `<severity> / <type> / <one-line summary>`. **<reason category>**: <rationale, with sprint/PR/commit references>.
```

## What does QA do when a ticket gets rejected?

- **Look at the README rationale first.** It explains exactly why dev declined.
- **If you disagree:** open a GitHub PR comment on the rejection commit, or file a fresh ticket with new context (a clearer repro, a counter-example, etc.). Don't re-file the same ticket — that's noise.
- **If you agree:** nothing more to do. The archive entry is the record.

## Mass-rejection (rare)

If dev winds up rejecting a whole sprint's worth of QA tickets — e.g. an entire PR was rolled back — group them under one rationale bullet in the README and reference the rollback commit. Don't pollute the file with per-ticket explanations when one sentence covers them all.

## See also

- [`docs/qa/design.md`](design.md) — the QA workflow contract (file-ownership table, ticket lifecycle).
- [`docs/qa/agent.md`](agent.md) — QA terminal onboarding (the role this doc complements).
- [`docs/qa/regression-promotion.md`](regression-promotion.md) — the regression-needed escalation flow.
- [`backlog/qa-tickets/archive/rejected/README.md`](../../backlog/qa-tickets/archive/rejected/README.md) — the live rejection ledger.
