# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S094 — QA flow automation — auto-merge + auto-pickup of merged sprint PRs

Status: **active** (started 2026-05-20). Source: `backlog/sprints/S094.sprint.json`.

### Stories

- **QA-AUTO-MERGE-ACTION** — .github/workflows/qa-intake-auto-merge.yml — auto-merge qa-intake PRs _(pending)_
  GitHub Action that auto-merges PRs labelled `qa-intake` once safety checks pass. Triggered on pull_request_target with the label event. Pipeline: (1) verify every changed file path matches one of `backlog/qa-tickets/**`, `examples/**/playtests/qa-proposed/**`, `qa-artifacts/**` — fail otherwise (`qa-intake PR must touch only QA-writable paths`); (2) wait for CI checks to finish via `gh pr checks --watch`; (3) on green, `gh pr merge --squash --auto`. Action runs on the repo's `GITHUB_TOKEN` (write-perm on contents/pulls). Eliminates the dev-terminal relay so QA tickets flow into main without human prompting.
- **QA-INTAKE-LABEL-CONVENTION** — QA scaffold helper prints the `gh pr create --label qa-intake` recipe _(pending)_
  The auto-merge action keys on the `qa-intake` label. Today the QA agent has to remember to add it. Update `scripts/backlog/qa-ticket.mjs` to print, after a successful scaffold, the exact `gh pr create --base main --label qa-intake --title "qa-intake: ..."` invocation the agent should run when ready to push the batch. Also document the convention in `docs/qa/agent.md` so a fresh agent finds it without needing the print-out.
- **QA-SPRINT-PR-LABEL** — Sprint PRs auto-label with `sprint` for QA discoverability _(pending)_
  Companion to the next story (QA-NEXT-PR). For QA's `gh pr list --label sprint --state merged` to actually return merged dev sprints, every sprint PR must carry the `sprint` label. Extend `scripts/backlog/pr-body.mjs` (or wherever the sprint PR open path lives) to default to `--label sprint`. Existing PRs are not retroactively labelled — convention applies to S094+ sprint PRs.
- **QA-NEXT-PR** — scripts/backlog/qa-next-pr.mjs — find the most recently merged sprint PR _(pending)_
  Helper command for the QA terminal: `npm run qa:next-pr` returns the most-recently-merged PR labelled `sprint` (or matching `^S\d+:` in the title as a fallback for un-labelled legacy PRs) that QA hasn't reviewed yet. "Reviewed" = a marker file `qa-artifacts/reviewed/PR-<N>.txt` exists OR a qa-ticket in `backlog/qa-tickets/` (including archive/) references the PR via `foundInPr`. Prints PR number, title, merged-at timestamp, and the `acceptance:` lines from the sprint's stories so the QA agent immediately sees what to verify. Wrap as `npm run qa:next-pr`.
- **QA-AGENT-AUTOLOAD** — QA agent runs qa:next-pr automatically when invoked _(pending)_
  Update `.claude/agents/qa-reviewer.md` system prompt + `docs/qa/agent.md` 'How to launch' section so the very first thing a QA session does is `npm run qa:next-pr`. If it returns a PR, the agent starts verifying it; if not, the agent reports 'caught up — exiting'. Eliminates the user-prompt 'go check the new sprint' step.
- **QA-FIX-NOTES-GITIGNORE** — Move QA artefacts to a tracked `qa-artifacts/` directory (closes QA-2026-05-20-001) _(implemented)_
  QA filed QA-2026-05-20-001: `Notes/` in .gitignore matches `notes/` on macOS's case-insensitive filesystem, blocking artefact commits. Tried `!notes/qa/` re-include first — confirmed git refuses to re-include children of an ignored parent directory. Final fix: dropped the broken re-include, retired the `notes/qa/` path entirely in favour of a dedicated **tracked** `qa-artifacts/` directory at the repo root. .gitignore gains a comment documenting the limitation so a future agent doesn't repeat the mistake. Schemas, docs, and the QA subagent definition all updated via bulk sed; only `qa-artifacts/README.md` is committed in this story — agents create per-ticket subdirs as needed.
- **QA-PROMOTE-FILED-TICKETS** — Promote QA-2026-05-20-{001,002} from S092 dogfood into this sprint _(pending)_
  First dogfood call: QA filed two tickets during S093 review (PR #102, merged). This story closes the loop by running `npm run qa:promote -- --into S094` to fold them into S094 as proper stories. QA-001 (notes/qa gitignored) becomes the work tracked by QA-FIX-NOTES-GITIGNORE above — defer the promoted story with a note pointing at QA-FIX-NOTES-GITIGNORE so we don't double-count. QA-002 (notes/qa-workflow-design.md broken link) was already fixed in S093 commit 0015475 — defer the promoted story with that hash + close.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
