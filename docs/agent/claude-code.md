# Claude Code Setup

This repo is implemented primarily through Claude Code (and pairs with the Claude Agent SDK for the dev-bridge / subagent orchestration in `.claude/`).

## Project Memory

Claude Code loads `CLAUDE.md` as project memory. Keep it short and operational:

- critical non-negotiables;
- current sprint phase;
- architecture summary in one paragraph;
- expected workflow;
- planned commands.

Do not copy the full architecture docs into `CLAUDE.md` — link to them. The whole point of `CLAUDE.md` is to surface what an agent needs to know *before* doing anything; the linked docs are what the agent reads *while* doing the thing.

Per-user / per-session memory lives outside the repo, under the Claude Code memory store (handled automatically). Repo-content stays in tracked files.

## Slash Commands

Project commands live in `.claude/commands/`. Current set:

| Command | Purpose |
|---|---|
| `/start-next` | Pick the next BACKLOG story and prepare an implementation plan before touching code. |
| `/implement-story <id>` | Implement a specific backlog story, marking it `Status: Implemented` on commit. |
| `/check-docs` | Review documentation consistency — typically run mid-sprint or before a docs-only commit. |
| `/review-agent` | Review recent changes against the `AGENTS.md` / `docs/agent/rules.md` non-negotiables. |
| `/sample-game` | Work on the Beacon World sample direction. |
| `/asset-pipeline` | Work on asset sourcing, import, metadata, loading or optimization tasks. Pairs with `docs/agent/asset-pipeline.md`. |
| `/adr-new` | Draft a new ADR in `docs/adr/` with the standard template. |
| `/archive-sprint` | Close a sprint — move its detailed stories from `BACKLOG.md` to `BACKLOG_ARCHIVE.md`, promote the next sprint, run preflight. |

Slash commands are short imperative entries — they reference the underlying skill memo (`docs/agent/skills/<name>.md`) for the actual workflow. Promoting a memo to a slash command is a deliberate move; do it only when the memo is invoked routinely.

## Subagents

Project subagents live in `.claude/agents/`. Current set:

| Subagent | When to delegate |
|---|---|
| `engine-architect` | Architecture, ADRs, engine boundaries (`engine/core` vs `engine/render` vs `engine/runtime`), ECS / commands / schema decisions, tradeoff analysis. |
| `schema-guardian` | Scene / project / material / shader / LOD / asset-sources / protocol schemas, validation diagnostics, JSON data boundaries, TS / C# contract alignment. |
| `playtest-runner` | Playwright smoke tests, robot playtests, screenshot artifacts, traces, runtime inspection, visual verification plans. |
| `backend-planner` | Backend-agnostic persistent shared-world server design, reference C# / Node implementations, realtime transport, world snapshots, protocol contracts. |
| `asset-pipeline` | Asset sourcing, Meshy / Blender workflow, CC0 libraries, source metadata, runtime asset layout, GLB import, texture / material workflow, web optimization. |

The router (Claude Code's default agent) picks one of these when the task lines up; explicit invocation via `Agent({ subagent_type: "..." })` overrides the routing. Subagent files in `.claude/agents/*.md` are kept short — descriptions only.

## Reliability Docs

The doc map an agent reads before doing real work:

- `docs/agent/build-a-game.md` — one-page contract: pipeline, recipes, common mistakes, `__agf` surface, exit criteria.
- `docs/agent/asset-pipeline.md` — end-to-end asset loop (`_sources` → import → optimize → manifest → scene reference).
- `docs/agent/iteration-loop.md` — fast feedback flow (engine inspect filters, dev bridge endpoints, `__agf`).
- `docs/agent/test-recipe.md` — canonical verification recipe (engine check → typecheck → unit → playtest → e2e).
- `docs/agent/debug-protocol.md` — debugging loop + artifact expectations.
- `docs/agent/template-policy.md` — when examples become templates.
- `docs/agent/dev-tuner.md` — slider API for visual-judgment values.
- `docs/agent/inspect-stream.md` — `engine inspect --watch --json` contract.
- `docs/diagnostics.md` — canonical `AGF_*` diagnostic codes.
- `docs/QUALITY_AXES.md` — definition of "works" beyond build success.
- `docs/agent/skills/*.md` — focused workflow memos (engine-check, scene-authoring, system-authoring, playtest-debugging, prefab-authoring, material-authoring).

## Workflow

One long-lived `sprint/<N>-<slug>` branch per sprint. Story commits are atomic — when `BACKLOG.md` marks a story `Status: Implemented`, the change is committed without waiting for explicit instruction. Preflight runs once at sprint close; the sprint PR is opened via `gh pr create` + `gh pr merge --auto`. See [`feedback-workflow`] memo for the full rule set.

## Local Settings

Use `.claude/settings.local.json` for personal local preferences. It is ignored by git.

Shared settings (`.claude/settings.json`) should be added carefully — only when the team agrees they are safe for everyone (e.g. the read-only permission allowlist).
