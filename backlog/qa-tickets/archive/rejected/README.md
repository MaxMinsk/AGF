# Rejected QA tickets

Tickets the dev terminal evaluated and decided NOT to promote into a sprint, with the rationale. Same shape as `backlog/qa-tickets/archive/<sprint-id>/` (where promoted tickets land) but a distinct directory so the QA terminal can tell at a glance which tickets were acted on and which were declined.

Convention: one line per ticket below explaining why dev rejected it. Use `git mv` to land the JSON file alongside this README so the QA terminal still sees its full provenance. The full convention is documented in [`docs/qa/invalid-ticket-handling.md`](../../../../docs/qa/invalid-ticket-handling.md) (S98).

## Tickets

- **QA-2026-05-20-001** — `critical / bug / node:fs in browser bundle`. **Already fixed** in PR #108's sprint-close commit (`2712ef1 S096 fix: keep node:fs out of the browser bundle`). The QA terminal filed this 14 minutes AFTER PR #108 merged; the ticket reproduces what dev had already shipped. No follow-up work.

- **QA-2026-05-20-003** — `major / bug / promote-qa.mjs accepts active sprint targets`. **Behavior is intentional.** S091's commit `fix qa-promote test for relaxed active-sprint promotion` explicitly relaxed the guard to accept `active` sprints — required for the dogfood loop (QA files tickets while a sprint is live; dev promotes them into the same sprint). The unit test was updated in S091 to match. This ticket was filed against a stale view of the test expectation.

- **QA-2026-05-24-001** — `major / bug / 2 server-side unit tests failing on main after S119`. **Already fixed by test updates in S120-S125.** Both failures stemmed from a `ServerWorld` default change (the constructor now auto-spawns a bot for arcade-style solo flow), which made solo-session tests effectively 2-player and broke their invariants. The fix landed alongside S120-S125 work: tests now opt out with `new ServerWorld({ spawnBot: false })`. Full `npx vitest run` is green on main (1461 / 1471 passing, 10 intentional skips). QA filed the ticket against post-S119 HEAD `8cc8a0e` on 2026-05-24 12:16Z; by the time it was harvested on 2026-05-25 main was already at `25629b6` with the fix shipped. No further work needed.
