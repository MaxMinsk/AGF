# Regression-test promotion — when to file the second ticket

You sometimes hit a bug that has nothing to do with the PR you're reviewing. The story you're verifying touches the audio system; the bug is in the bot AI. That's a **regression in old functionality**. When that happens, you file two tickets, not one:

1. The bug itself — `type: bug, severity: ...`
2. A **regression-needed** ticket — `type: regression-needed, regressionFor: <bug-ticket-id>`

The second ticket becomes the story for adding an automated test that would have caught the regression. Dev links the two via `dependsOn` at promotion time so the bug fix can't be marked implemented until the regression test exists.

The decision tree below is what `notes/qa-workflow-design.md` §6 spells out. Memorise the two worked examples — they cover 90% of cases.

---

## Decision tree

```
Did the bug exist BEFORE the PR you're reviewing landed?
│
├── No (bug is new — introduced by this PR or one merged today)
│     └── File ONE ticket: type=bug, severity=...
│         (no regression-needed; dev's test gates should have caught
│          it, so they need to tighten existing coverage — leave a
│          note in the bug ticket's summary)
│
└── Yes (regression — bug exists in a previously-shipped feature)
      │
      └── Is the bug reproducible in a deterministic *.playtest.json?
            │
            ├── Yes → File TWO tickets: the bug + regression-needed
            │   Author the .playtest.json under
            │   examples/<project>/playtests/qa-proposed/ and reference
            │   it from BOTH tickets' `playtest` field.
            │
            └── No (e.g. flaky, requires human eye) → File ONE ticket
                (the bug). Add `severity: minor` notation
                "regression but no clean automated repro" so dev knows
                automation is parked.
```

---

## Worked examples

### Example 1 — New-PR-only bug

> PR #105 ships `KABOOM-PAUSE-AUDIO-MUTE`. You boot the project. The Esc menu doesn't show the Audio toggle. You inspect the diff — the toggle button was added in this PR.

**File:** one `type: bug` ticket.

```json
{
  "id": "QA-2026-05-20-001",
  "title": "Esc pause menu missing the Audio toggle introduced in S089",
  "severity": "major",
  "type": "bug",
  "foundInPr": 105,
  "repro": ["Boot examples/kaboom-crew", "Press Esc", "Observe: no Audio toggle"],
  "expected": "Audio: ON | OFF button visible alongside Resume / Restart / Difficulty.",
  "actual": "Three buttons only — Resume, Restart, Difficulty."
}
```

**Do not** file a regression-needed ticket. The feature is brand new. The right reaction from dev is to tighten existing tests, not add a regression suite for code that didn't ship before.

### Example 2 — Old-functionality regression

> PR #110 ships `KABOOM-BOMB-COLOR-VARIETY` (cosmetic only — random colour per bomb). You boot the project. Bombs now have varied colours. You also notice the **bot walks into its own blast** — a behaviour that worked fine before in S088. The bot-AI code wasn't touched in PR #110, but something downstream broke.

**File:** two tickets.

```json
// Bug ticket
{
  "id": "QA-2026-05-20-002",
  "title": "Bot suicides into its own freshly-placed bomb (regression)",
  "severity": "major",
  "type": "bug",
  "foundInPr": 110,
  "summary": "Pre-existing behaviour — bot avoided its own bomb in S088. Regressed in PR #110.",
  "repro": [
    "Load examples/kaboom-crew with ?difficulty=hard",
    "Wait for the bot to place a bomb in a corridor",
    "Observe: bot walks into the projected blast and dies"
  ],
  "expected": "Bot avoids its own about-to-explode bombs (worked in S088).",
  "actual": "Bot steps into the projected blast.",
  "playtest": "examples/kaboom-crew/playtests/qa-proposed/bot-self-blast.playtest.json"
}
```

```json
// Regression-needed companion ticket
{
  "id": "QA-2026-05-20-003",
  "title": "Add automated regression test for the bot-self-blast bug",
  "severity": "major",
  "type": "regression-needed",
  "regressionFor": "QA-2026-05-20-002",
  "summary": "Companion to the bot-self-blast bug. Playtest scenario asserts the bot is alive 1.5 s after placing a bomb on a corridor cell.",
  "repro": [
    "Load examples/kaboom-crew with ?difficulty=hard",
    "Bot places a bomb; observe alive=true 1.5 s later"
  ],
  "playtest": "examples/kaboom-crew/playtests/qa-proposed/bot-self-blast.playtest.json"
}
```

Dev's `promote-qa.mjs` will link the bug story's `dependsOn` to the regression-test story's id so the bug fix can't be claimed implemented until the test exists.

---

## Heuristics for "deterministic .playtest.json"

A regression-needed ticket is most valuable when paired with a small `.playtest.json` that reproduces the bug. The playtest schema (see `examples/beacon-world/playtests/*.playtest.json` for examples) supports:

- `applyCommands` — drive the world via engine commands
- `wait` — pause for a fixed duration
- `expectComponent` — assert a component value on an entity
- `expectEntityMissing` — assert an entity is gone

If the bug needs key presses or mouse input, you need a Playwright spec instead. File the regression-needed ticket without a playtest, but flag in the summary that it'll require Playwright-level work.

If the bug is hardware-dependent (WebGPU vs WebGL behaviour, browser-specific timing), file the regression-needed ticket with a note in the summary: dev decides whether to gate the test behind a CI matrix flag.

---

## On flaky bugs

Three rules of thumb:

1. Re-probe twice before filing. Three attempts total. Flakiness < 30% → file with `severity: minor`.
2. If you can reduce it to a deterministic scenario (specific timing / seed), the flakiness was probably real and the seed should pin it. File with `severity: major` and link the seeded `.playtest.json` from the regression ticket.
3. If you can't pin it, file `severity: minor` AND a `regression-needed` ticket with `summary: "needs flaky-test mitigation — re-run gate"`. Dev decides whether to chase the root cause or add retry logic.

---

## When you're unsure

File the bug. File the regression-needed. Dev can defer the regression-needed at promotion time (`scripts/backlog/mutate.mjs defer <id> --reason "not cost-effective to automate"`). It's cheap to file, expensive to miss.
