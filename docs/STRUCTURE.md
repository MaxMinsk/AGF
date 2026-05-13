# Repository Structure

This folder is the public repository root for the engine. Example games are nested projects under `examples/` and should not redefine the repository root.

## Current Layout

What actually exists right now, mid-Sprint 1:

```text
.
  engine/
    core/
      ecs/                  // Story 3.1
      commands/             // Story 3.2
      math.ts
    tools/
      check/
      inspect/
      cli.ts
  examples/
    hello-3d/
  schemas/
  src/                      // Vite bootstrap, will stay thin (see below)
  tests/
    unit/
    e2e/
    fixtures/
  docs/
    adr/
    agent/
    research/
```

Notes:

- `src/` is the Vite entrypoint. It will stay small: only DOM mount + `runtime.start()`. Renderer, runtime, input, hot reload live under `engine/`, not under `src/`.
- `engine/runtime/`, `engine/render/`, `engine/physics/`, `engine/testkit/` and `examples/beacon-world/` are planned but not yet created.

## Target Layout

After Sprint 1 and Sprint 2:

```text
.
  engine/
    core/
    runtime/
    render/
    physics/
    tools/
    testkit/
  examples/
    hello-3d/
    beacon-world/
    backends/
  schemas/
  src/                      // unchanged: thin Vite entry only
  tests/
  docs/
    adr/
    agent/
    research/
  spikes/
```

## Boundaries

- `engine/core`: pure TypeScript runtime model, no browser or Three.js dependency.
- `engine/runtime`: browser lifecycle, input, audio, HMR, network client adapters.
- `engine/render`: Three.js-specific rendering adapter.
- `engine/physics`: Rapier-specific physics adapters.
- `engine/tools`: CLI, project validation, inspector and playtest runner.
- `engine/testkit`: fixtures and assertions used by engine and example tests.
- `examples`: games built with the engine.
- `examples/beacon-world`: future main dogfood sample game as a nested project.
- `schemas`: JSON Schema files for project data.
- `examples/backends`: optional reference backend implementations, outside the engine core.
- `docs`: decisions, workflows, research and agent rules.
- `spikes`: temporary experiments. Keep findings in `docs/research/spikes/`.

## Naming

- All documentation, comments, identifiers, diagnostics and user-facing in-app text should be English unless localization is the task.
- Components: `PascalCase`, data-only, schema-backed.
- Systems: `PascalCaseSystem`, explicit reads/writes.
- Commands: dot-namespaced strings, e.g. `entity.create`.
- Schemas: kebab-case or domain names, e.g. `scene.schema.json`.
- Examples: kebab-case folders, e.g. `hello-3d`.

## Import Rules

- Systems do not import Three.js.
- Core does not import browser-only APIs.
- Tools may import schemas and project loaders.
- Render adapters may import Three.js and read render components.
- Server contracts come from protocol schemas, not hand-copied message shapes.
- Backend implementations must depend on AGF protocol/world contracts, not the other way around.
