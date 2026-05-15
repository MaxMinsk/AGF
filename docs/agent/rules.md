# Agent Operating Rules

`AGENTS.md` at the repo root is the authoritative list of hard rules — read it first. This file is the longer-form companion for agents working day-to-day in the repo.

## Before Editing

- Read `README.md`, `docs/ARCHITECTURE.md` and the relevant ADRs under `docs/adr/`.
- Use `rg` / `rg --files` (or the project Explore tool) to inspect the workspace.
- Identify whether the task touches core, runtime, render, tools, examples or server.
- **Grep before scaffolding.** If your task could be solved by an existing engine primitive (`Spin`, `Tween`, `WaypointMover`, `ParticleEmitter`, `CinematicCamera`, …), use it. Cloning the behaviour as a project-local system is a smell.
- Open `docs/diagnostics.md` if your change might emit a new `AGF_*` code.

## While Editing

- Use English for repository documentation, comments, identifiers, diagnostics and user-facing in-app text unless localization is the task.
- Keep source of truth in text files.
- Prefer schemas and typed contracts over conventions.
- Put behaviour in scheduler-registered systems, not in renderer adapters or bootstrap glue.
- Route meaningful world mutations through commands.
- Resolve texture / mesh / material refs through the asset registry — do not bypass it with raw `new TextureLoader()` calls.
- Keep diagnostics agent-readable (`code`, `file`, `path`, `severity`, `message`, `suggestion`).

## Before Finishing

- Run or document the relevant verification (see `docs/agent/test-recipe.md`).
- Mention files changed, including any project-local schemas / scenes.
- Mention what was not verified.
- Do not claim a visual feature works without a browser or screenshot check.
- Mark the BACKLOG.md story `Status: Implemented` and commit. (Branch-and-PR happen once per sprint, at sprint close.)

## Review Bias

When reviewing changes, prioritise:

- Hidden mutable state in renderer adapters or bootstrap glue.
- Broken schema / runtime contract (missing diagnostic, missing fixture, mismatched type).
- Renderer leaking into core, or `engine/core` importing from `engine/render` / Three / DOM / Vite / Playwright.
- Commands bypassed by direct world mutation.
- Vague diagnostics (no suggestion, no path, free-form message instead of a code).
- Missing tests for changed behaviour.
- Custom system / component / shader that duplicates an engine primitive.
- Texture / material refs that won't resolve under the asset registry (raw URLs, bare manifest ids in `MeshRenderer.material`).

## Doc-And-Code Pairing

When you change behaviour that an agent will trip over later, also update the matching skill memo under `docs/agent/skills/`. The ownership map in the sprint audit file (`docs/agent/_audit-*.md`, when present) tells you which file goes with which surface.
