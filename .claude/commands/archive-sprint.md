---
description: Close a sprint by moving its detailed stories from BACKLOG.md to BACKLOG_ARCHIVE.md
argument-hint: <sprint-number>, e.g. "1"
---

Close Sprint `$ARGUMENTS`.

Workflow:

1. Read `BACKLOG.md`. Confirm every story in the named sprint is marked `Status: Implemented` (or explicitly deferred). Stop and report if any story is not Implemented.
2. Read `BACKLOG_ARCHIVE.md` for the archive shape used by previous sprints.
3. In `BACKLOG_ARCHIVE.md`, append a new `## Sprint $ARGUMENTS - <Sprint Name>` section that includes:
   - `Status: Completed and archived.`
   - `### Completed Work` — one bullet per story id and title.
   - `### Deliverables` — key files/folders shipped.
   - `### Verification` — what was actually run (preflight at sprint close, e2e screenshots, etc.).
   - `### Follow-Ups` — anything explicitly deferred or noted as risk.
4. In `BACKLOG.md`, delete the closed sprint's epics/stories and promote the next sprint's content to the `Current Sprint` slot. Add a new placeholder `Next Sprint` section.
5. Update `HIGH_LEVEL_BACKLOG.md` to mark moved epics as Active/Completed where appropriate.
6. Run `npm run preflight` (this is a sprint-close action — preflight is appropriate here).
7. Summarize moved stories and verification.

Do not commit until the user reviews the diff.
