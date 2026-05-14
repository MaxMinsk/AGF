# Contributing to AgentsGameFramework

Thank you for your interest in AGF. Before you start, a few honest signals:

- **AGF is pre-alpha**. Architecture, schemas, ECS APIs, CLI commands and the dev bridge are all expected to change without deprecation.
- **AGF is agent-first**. Most of the project's design decisions optimise the AI-coding-agent's `edit → check → run → playtest` loop, not a human-developer GUI workflow.
- **External contributions are welcome but not the primary input today**. The maintainer is moving fast; PRs that fight the project's direction will be closed with a short note rather than long discussion.

If those tradeoffs are fine, the rest of this file describes how to send a change that has a high chance of landing.

## Prerequisites

- Node.js `>=20.19.0` (matches `package.json#engines`).
- A modern browser (Playwright is bundled; `npx playwright install` is run via `postinstall` on first install).
- .NET 9 SDK only if you change `examples/backends/dotnet-world-server/`.

## Setup

```bash
git clone https://github.com/MaxMinsk/AGF.git
cd AGF
npm ci
npm run dev     # opens the showcase app
```

To list available example projects, open `http://localhost:5173/` and pick one from the selector. Direct URLs work too:

```
http://localhost:5173/?project=hello-3d
http://localhost:5173/?project=beacon-world
http://localhost:5173/?project=shadows-bench
```

## What to read before opening a PR

The repository is intentionally documentation-heavy because that documentation is the agent's primary context.

| File | Why |
|---|---|
| `README.md` | One-page project status. |
| `CLAUDE.md` | Non-negotiable engineering rules. Read this first. |
| `AGENTS.md` | Agent-loop conventions and hard rules. |
| `docs/ARCHITECTURE.md` | Runtime boundaries and adapter shapes. |
| `docs/STRUCTURE.md` | Target repository layout. |
| `BACKLOG.md` | Active sprint and the next sprint. |
| `HIGH_LEVEL_BACKLOG.md` | Roadmap epics. |
| `docs/agent/debug-protocol.md` | How to debug a running game programmatically. |

If your change relates to an item already in `BACKLOG.md` or `HIGH_LEVEL_BACKLOG.md`, link the story id in the PR body.

## Engineering rules (hard)

These are checked by `npm run preflight` and by CI. PRs that violate them will fail before review.

- **English only** in tracked repo content (code, comments, identifiers, docs, commits, diagnostics). Personal notes live under the gitignored `Notes/` folder.
- **No `engine/core` → `engine/render`, `three`, DOM or Vite imports.** Verified by `npm run imports:check`.
- **No raw `world.query()` in hot-path systems.** Use a cached `createQuery` handle. Verified by `npm run systems:check`.
- **Schemas first.** New ECS components, materials, scenes or commands land as JSON Schema first, TypeScript types second, system third, adapter call last.
- **No clipboard / download flows** for state transfer between the running game and an agent. Use the dev bridge or `window.__agf`.
- **No hidden Three.js / Rapier objects in components.** ECS data stays plain JSON-shaped.

## How a change should look

1. Pick the smallest coherent slice (one bug, one feature flag, one schema field).
2. Inspect existing files before editing.
3. Add or update tests covering the new behaviour.
4. Run the smallest relevant verification first (`npm run typecheck`, `npm run test`, `npm run engine:check -- examples/<project>`).
5. Run `npm run preflight` before opening the PR.
6. In the PR body, name the verification steps that ran green and any deferred risk.

## Branching and commits

- AGF runs in sprint-shaped batches. Single-change contributions go on a `feature/<slug>` branch cut from `main`.
- One PR per branch. Commits are concise; the PR body carries the explanation.
- Commit messages stay in English. Reference story ids if applicable (`feat(M21-cam-cinematic): …`).

## Running the test suite

```bash
npm run typecheck
npm run test            # 64 Vitest files, ~408 tests
npm run test:e2e        # ~25 Playwright scenarios
npm run preflight       # everything above + bundle + hygiene
```

`npm run preflight` may report Playwright flakes under parallel load. Re-run the affected specs in isolation before assuming a regression.

## Reporting bugs

Open an issue with:

- AGF commit hash (`git rev-parse HEAD`).
- Reproduction steps or, if possible, a JSON bug report from `window.__agf.bugReport()` / `curl http://localhost:5173/__agf/bug-report`.
- Observed vs expected behaviour.
- Browser + OS if rendering-related.

For security issues, see `SECURITY.md` — do not file public issues.

## Licensing

AGF is Apache-2.0. By submitting a PR, you agree your contribution is licensed under the same terms. No CLA is required at this stage.
