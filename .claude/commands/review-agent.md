---
description: Review recent changes against agent-first engine rules
argument-hint: [optional path]
---

Review recent changes under `$ARGUMENTS` against this repo's rules.

Prioritize findings about:

- renderer/DOM dependencies leaking into core;
- gameplay state bypassing ECS/commands;
- missing schema validation for project data;
- vague diagnostics;
- missing or inappropriate tests;
- non-English docs/comments/identifiers/diagnostics;
- backend code becoming mandatory for static client builds.
- missing updates to debug protocol, template policy or quality axes when recurring patterns appear.

Return findings first, ordered by severity, with file and line references when available.
