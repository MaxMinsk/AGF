---
description: Implement a specific backlog story using repo workflow
argument-hint: [story id or title]
---

Implement backlog story `$ARGUMENTS`.

Workflow:

1. Read `CLAUDE.md`, `AGENTS.md`, `BACKLOG.md`, `HIGH_LEVEL_BACKLOG.md`, and relevant ADR/research docs.
2. Inspect existing files before editing.
3. Identify the smallest useful implementation scope.
4. Make code/docs changes.
5. Run the smallest relevant verification available.
6. Run `npm run preflight` for meaningful implementation tasks when practical.
7. Summarize changed files, verification and remaining risks.

Important:

- Use English for all repository files.
- Do not edit generated files by hand.
- If planned commands do not exist yet, say so clearly and verify by file review or available commands.
