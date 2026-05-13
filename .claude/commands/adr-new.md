---
description: Draft a new ADR in docs/adr/ with the standard template
argument-hint: <slug> — short kebab-case slug, e.g. "rapier-physics"
---

Create a new ADR file for `$ARGUMENTS`.

Workflow:

1. Inspect `docs/adr/` to find the highest existing NNNN prefix. The new ADR uses the next number, zero-padded to four digits.
2. Create `docs/adr/NNNN-$ARGUMENTS.md` with these sections, in this order:
   - `# Title` — short imperative line matching the slug.
   - `## Status` — one of `Proposed`, `Accepted`, `Superseded by NNNN`.
   - `## Context` — what is the problem, what constraints apply, what is changing.
   - `## Decision` — the concrete chosen path.
   - `## Consequences` — positive, negative and follow-up consequences.
   - `## Alternatives Considered` — at least one alternative with a one-line reason it was rejected.
3. Keep the file short. Each section 2–6 sentences. Link to related ADRs by file name.
4. If the ADR changes any rules already in `CLAUDE.md`, `AGENTS.md`, `docs/ARCHITECTURE.md` or `docs/STRUCTURE.md`, update those files in the same patch.

Use English. Do not commit until the user reviews the draft.
