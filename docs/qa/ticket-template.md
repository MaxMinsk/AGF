# QA ticket template

You normally start a ticket with `npm run qa:ticket -- new "<title>" ...` which writes a scaffold with `TODO:` markers. This file documents the field list verbosely so you can write one by hand or audit the scaffold output.

The canonical schema lives at [`schemas/qa-ticket.schema.json`](../../schemas/qa-ticket.schema.json) — keep this doc in sync with it.

---

## Minimum required body

```jsonc
{
  "agfFormatVersion": 1,
  "id": "QA-2026-05-20-001",
  "title": "Short, specific, ≥ 5 chars",
  "filedAt": "2026-05-20T14:23:00Z",
  "severity": "major",
  "type": "bug",
  "repro": [
    "Step 1 — user-facing language",
    "Step 2 — what the agent / user does",
    "Step 3 — what to observe"
  ]
}
```

That's a valid ticket. `backlog:check` will accept it. Everything below is optional but strongly encouraged.

---

## Full body

```jsonc
{
  "agfFormatVersion": 1,
  "id": "QA-2026-05-20-001",
  "title": "Bot suicides when stepping into its own fresh blast on the wide map",
  "filedAt": "2026-05-20T14:23:00Z",
  "foundInPr": 100,
  "foundInSprint": "S090",
  "severity": "major",
  "type": "bug",
  "summary": "Bot's wander path picks the cell its newly-placed bomb covers. Reproducible on hard difficulty, wide map only.",
  "repro": [
    "Load examples/kaboom-crew with ?difficulty=hard&map=wide",
    "Wait for the bot to reach the corridor between (6,5) and (8,5)",
    "Observe: bot places a bomb, then walks into the projected blast"
  ],
  "expected": "Bot should treat its own about-to-explode bomb's projected cells as danger and pick a different direction.",
  "actual": "Bot steps into the projected blast and dies. The danger map in KABOOM-BOT-DANGER-AVOID covers only bombs placed by other bombers.",
  "logs": "AGF_KABOOM_BOT_DEATH bot.1 at (7,5) — caused by bot.1's own blast originating at (7,5)",
  "screenshot": "qa-artifacts/QA-2026-05-20-001/death-frame.png",
  "playtest": "examples/kaboom-crew/playtests/qa-proposed/bot-self-blast.playtest.json",
  "epicHint": "KABOOM-CREW-MVP-1"
}
```

---

## Field reference

| Field | Required | Notes |
|---|---|---|
| `agfFormatVersion` | yes | Always `1`. Bumps on a breaking schema change. |
| `id` | yes | `QA-YYYY-MM-DD-NNN`. Auto-assigned by `qa:ticket new`. |
| `title` | yes | One line. Becomes the story title on promotion. |
| `filedAt` | yes | ISO-8601 UTC timestamp. The scaffold sets it. |
| `foundInPr` | no | GitHub PR number where you observed the bug. |
| `foundInSprint` | no | Sprint id under review when filed — useful if PR isn't merged. |
| `severity` | yes | `critical` (build broken / unplayable) · `major` (core feature regression) · `minor` (edge case) · `polish` (cosmetic) |
| `type` | yes | `bug` (fix needed) · `regression-needed` (file together with a `bug` ticket, requires `regressionFor`) · `doc` · `ux` |
| `summary` | no | One paragraph context. Inlined into the promoted story's summary. |
| `repro` | yes | Array of strings, each a step in user-facing language. ≥ 1 entry. |
| `expected` | no | What should have happened. Strongly recommended. |
| `actual` | no | What actually happened. Strongly recommended. |
| `logs` | no | Quote relevant console / diagnostics lines. Short — link a file for long captures. |
| `screenshot` | no | Repo-relative path under `qa-artifacts/`. |
| `playtest` | no | Repo-relative path to a draft `.playtest.json` under `examples/<project>/playtests/qa-proposed/`. |
| `regressionFor` | **yes** when `type='regression-needed'` | Bug ticket id this regression test would cover. |
| `epicHint` | no | Epic id to nudge promotion into a specific epic. |

---

## Severity tiers — quick guide

- **critical:** site doesn't build, smoke test fails, browser crash, blank canvas, infinite loop, data corruption. Dev should drop everything to triage.
- **major:** core feature does not work as documented in the story's `acceptance:` line. Players can play around it but it's clearly broken.
- **minor:** narrow edge case. The 99% path works; this is the 1%.
- **polish:** visual / audio / wording. No behavioural difference.

When uncertain, pick the next-lower tier — dev can re-rank during promotion.

---

## Type — when to use which

- `bug`: behaviour does not match the acceptance criterion. Most common.
- `regression-needed`: this is a *companion* ticket to a `bug`. File only when the bug exists in pre-existing functionality and a `*.playtest.json` could catch the regression in CI. Requires `regressionFor`.
- `doc`: the story's acceptance line is missing, ambiguous, or wrong. Or `CLAUDE.md` / `docs/**` is misleading.
- `ux`: behaviour matches acceptance but the experience is wrong. "Bot path-finds correctly but the path indicator is invisible." Explain *why* it's wrong; dev decides the fix scope.
