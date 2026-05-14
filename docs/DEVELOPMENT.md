# Development

This file documents the day-to-day development workflow. AGF is the public engine repository root; example games are nested under `examples/`.

## Commands

```bash
# Run the showcase app (picks a project via `?project=<name>`)
npm run dev

# Engine CLI surface (all run via `tsx engine/tools/cli.ts <cmd>`)
npm run engine:check -- examples/hello-3d
npm run engine:inspect -- examples/hello-3d
npm run engine:inspect -- examples/hello-3d --json
npm run engine:doctor -- examples/hello-3d
npm run engine:summarize -- examples/hello-3d
npm run engine:migrate -- examples/hello-3d
npm run engine:asset -- optimize examples/beacon-world
npm run engine:replay -- <recording.json>
npm run engine:docs -- examples/hello-3d
npm run engine:patch -- examples/hello-3d <patch.json>

# Verification
npm run typecheck                 # tsc --noEmit
npm run test                      # vitest
npm run test:e2e                  # playwright
npm run repo:hygiene              # local mirror of CI Cyrillic check
npm run imports:check             # engine/core import boundary
npm run systems:check             # no raw world.query() in hot paths
npm run bundle:check              # dist/assets size budgets
npm run preflight                 # everything above + build

# Reference backends
npm run backend:node              # Node smoke validator (no transport)
npm run backend:node:serve        # Node smoke + WebSocket --serve mode
npm run backend:dotnet            # .NET skeleton (smoke-only)
dotnet build examples/backends/dotnet-world-server/GameServer.csproj
```

## Quality Gates

Before a code task is considered done:

- Repository documentation, code comments, identifiers, diagnostics and user-facing in-app text are in English.
- TypeScript typecheck passes.
- Unit tests pass for changed core logic.
- Browser smoke/playtest passes for visible runtime changes.
- `engine check` passes for changed project files.
- Diagnostics are actionable for an agent.
- Generated files are not edited by hand.
- `npm run preflight` passes for meaningful implementation tasks.

## Local Workflow

1. Read the relevant docs and ADRs.
2. Inspect existing files before editing.
3. Keep changes scoped to the task.
4. Add or update tests around behavior.
5. Run the smallest useful verification first.
6. Summarize what changed, what was verified and what remains risky.

For failures, follow `docs/agent/debug-protocol.md`. For "does it work?" discussions, use `docs/QUALITY_AXES.md`.

## Project Validation

`npm run preflight` runs the local mirror of CI (`repo:hygiene`, `engine:check:examples`, `imports:check`, `systems:check`), then typecheck, unit tests, production build, bundle-size check and Playwright e2e in sequence.

Use `engine check` before launching or editing a project deeply:

```bash
npm run engine:check -- examples/hello-3d
npm run engine:check -- examples/hello-3d --json
npm run engine:inspect -- examples/hello-3d
npm run engine:inspect -- examples/hello-3d --json
```

Diagnostics are designed for agents and include `severity`, `code`, `file`, `path`, `message` and optional `suggestion`.

## Documentation Workflow

Architecture decisions go in `docs/adr/`. Research notes go in `docs/research/`. Agent-specific workflows go in `docs/agent/`.

Write repository documentation in English. External notes may link to non-English material, but the repo's own docs, comments and diagnostics should remain English.

Keep docs short enough for agents to load quickly. Prefer links to deeper references instead of copying large external content.

## Backlog Workflow

- Use `HIGH_LEVEL_BACKLOG.md` for broad roadmap epics.
- Use `BACKLOG.md` for the active detailed sprint and next detailed sprint.
- Use `BACKLOG_ARCHIVE.md` for completed sprint details.
- Move completed sprint details to the archive at sprint close.

## Claude Code Setup

Claude Code project memory is stored in `CLAUDE.md`. Project slash commands are stored in `.claude/commands/`, and project subagents are stored in `.claude/agents/`.

Useful project commands:

- `/start-next`
- `/implement-story`
- `/check-docs`
- `/review-agent`
- `/sample-game`

Useful project subagents:

- `engine-architect`
- `schema-guardian`
- `playtest-runner`
- `backend-planner`
