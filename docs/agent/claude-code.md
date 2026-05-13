# Claude Code Setup

This repo is expected to be implemented primarily through Claude Code.

## Project Memory

Claude Code loads `CLAUDE.md` as project memory. Keep it short and operational:

- critical rules;
- current phase;
- architecture summary;
- expected workflow;
- planned commands.

Do not copy the full architecture docs into `CLAUDE.md`; link to them instead.

## Slash Commands

Project commands live in `.claude/commands/`.

Current commands:

- `/start-next`: pick the next backlog story and prepare an implementation plan.
- `/implement-story`: implement a specific backlog story.
- `/check-docs`: review documentation consistency.
- `/review-agent`: review recent changes against agent-first rules.
- `/sample-game`: work on the Beacon World sample direction.
- `/asset-pipeline`: work on asset source, import, metadata, loading or optimization tasks.
- `/adr-new`: draft a new ADR in `docs/adr/` with the standard template.
- `/archive-sprint`: close a sprint by moving its detailed stories to `BACKLOG_ARCHIVE.md`.

## Subagents

Project subagents live in `.claude/agents/`.

Current subagents:

- `engine-architect`: architecture, ADRs, boundaries and tradeoffs.
- `schema-guardian`: schemas, diagnostics and protocol contracts.
- `playtest-runner`: Playwright, robot playtests and visual verification.
- `backend-planner`: backend-agnostic persistent world networking and reference backend planning.
- `asset-pipeline`: asset sources, metadata, Meshy/Blender workflow, runtime loading and web optimization.

## Reliability Docs

- `docs/agent/iteration-loop.md`: fast feedback flow — `engine inspect` filters, `--save`, `--diff`, `window.__agf`, `playtest-runner` and `npm run playtest:watch`.
- `docs/agent/debug-protocol.md`: debugging loop and artifact expectations.
- `docs/agent/template-policy.md`: when examples become templates.
- `docs/QUALITY_AXES.md`: build/runtime/scene/playability/visual/protocol health.

## Local Settings

Use `.claude/settings.local.json` for personal local preferences. It is ignored by git.

Shared settings should be added carefully only when the team agrees they are safe for everyone.
