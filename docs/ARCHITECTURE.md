# Architecture

AgentsGameFramework (AGF) is an agent-first web game framework. The main product is not a visual editor; it is a text-first runtime and tooling environment where an AI agent can safely edit files, validate them, run the game headlessly, inspect state and iterate.

The repository root is the public engine repository. Example games are nested projects under `examples/`.

## Core Shape

```text
project files -> schemas -> normalized project -> ECS world -> systems -> commands -> adapters
                                                                  -> render/audio/physics/net
```

The source of truth is project files:

- `project.json`
- `scenes/*.scene.json`
- `prefabs/*.prefab.json`
- `materials/*.material.json`
- `shaders/**/*.glsl`
- `scripts/**/*.ts`
- `playtests/**/*.playtest.ts`
- `net/protocol/*.schema.json`

## Runtime Layers

- `core`: ECS world, components, commands, scheduler, schemas, project loading.
- `runtime`: browser bootstrap, loop, input, audio, hot reload and network client adapters.
- `render`: Three.js adapter, material/shader binding and debug gizmos.
- `physics`: Rapier adapters, added after the first playable foundation.
- `tools`: CLI, inspector, agent-oriented JSON outputs and playtest runner.
- `examples/backends`: optional reference backend implementations for persistent-world profiles.

## Dependency Rules

- `core` must not import Three.js, DOM APIs, Playwright, Vite or C# server code.
- Gameplay systems operate on ECS data and commands, not renderer objects.
- Render, physics, audio and network are adapters over ECS state.
- Project files are validated before they are normalized into runtime data.
- Generated files are not edited by hand.

## Deployment Profiles

- `static`: client-only single-player build deployable as a static site.
- `connected`: static client plus backend APIs for accounts, saves, leaderboards or world persistence.
- `authoritative`: client plus a server implementation with server-owned simulation and snapshots.

Backend implementations are outside the engine core. A C#/.NET server may be the first reference backend, but AGF contracts must also allow a Node.js server or another implementation.

## Agent Loop

```text
inspect -> edit text files -> engine check -> typecheck/test -> run/playtest -> screenshot/trace -> summarize
```

Agent tooling is CLI-first. Commands should produce stable human-readable output and machine-readable `--json` output. Optional adapters such as MCP, HTTP or WebSocket can be added later, but they must stay thin wrappers over the same CLI/shared command implementations instead of becoming separate engine logic.

Every diagnostic should include `file`, `path`, `severity`, `message` and, when possible, `suggestion`.
