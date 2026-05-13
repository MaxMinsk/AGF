# Agent Operating Rules

## Before Editing

- Read `README.md`, `docs/ARCHITECTURE.md` and relevant ADRs.
- Use `rg`/`rg --files` to inspect the workspace.
- Identify whether the task touches core, runtime, render, tools, examples or server.

## While Editing

- Use English for repository documentation, comments, identifiers, diagnostics and user-facing in-app text unless localization is the task.
- Keep source of truth in text files.
- Prefer schemas and typed contracts over conventions.
- Put behavior in systems, not in renderer adapters.
- Route meaningful world mutations through commands.
- Keep diagnostics agent-readable.

## Before Finishing

- Run or document the relevant verification.
- Mention files changed.
- Mention what was not verified.
- Do not claim a visual feature works without a browser or screenshot check once browser tests exist.

## Review Bias

When reviewing changes, prioritize:

- hidden mutable state;
- broken schema/runtime contract;
- renderer leaking into core;
- commands bypassed by direct mutation;
- vague diagnostics;
- missing tests for changed behavior.
