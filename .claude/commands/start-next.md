---
description: Pick the next backlog task and prepare an implementation plan
argument-hint: [optional focus]
---

Inspect `BACKLOG.md`, `HIGH_LEVEL_BACKLOG.md`, `CLAUDE.md`, `AGENTS.md`, and the relevant docs for the next task. If `$ARGUMENTS` is provided, focus on that area.

Return:

- the recommended next story;
- why it is next;
- files likely to change;
- verification commands, noting when commands do not exist yet;
- risks or decisions to confirm before editing.

Do not edit files unless the user explicitly asks you to proceed with implementation.
