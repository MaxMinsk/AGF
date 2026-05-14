# AgentsGameFramework

> Pre-alpha browser game framework, optimised for AI coding agents.

**AgentsGameFramework (AGF)** is a TypeScript browser game framework whose primary user is a coding agent, not a human in a visual editor. Scenes, components, materials, assets, diagnostics and tests are all text-native — an agent can author, validate, run and playtest a game by editing JSON and TypeScript files.

| | |
|---|---|
| **Status** | Pre-alpha (Sprint 42 archived, Sprint 43 active) |
| **License** | Apache-2.0 |
| **Runtime** | TypeScript, Vite, Three.js, Rapier (optional) |
| **Tests** | Vitest (~408 unit) + Playwright (~25 e2e) |
| **Engine root** | `engine/` |
| **Example games** | `examples/` |

This repository **is** the engine. There is no separate npm-published package yet; AGF is consumed by editing files inside this repository and running the showcase app.

## Quickstart

```bash
git clone https://github.com/MaxMinsk/AGF.git
cd AGF
npm ci

# 1. Open the showcase app in your browser
npm run dev
#    http://localhost:5173/?project=hello-3d
#    http://localhost:5173/?project=beacon-world
#    http://localhost:5173/?project=batch-bench
#    http://localhost:5173/?project=physics-bench
#    http://localhost:5173/?project=shadows-bench

# 2. Inspect a project's ECS state from the CLI
npm run engine:inspect -- examples/hello-3d

# 3. Verify a project's JSON / schemas pass all checks
npm run engine:check -- examples/hello-3d

# 4. Run the full preflight (typecheck + unit + build + bundle + e2e)
npm run preflight
```

## What works today

Engine runtime:

- Pragmatic Map-backed ECS with command pipeline and JSON-Schema-validated components.
- Three.js renderer split into scheduler-registered systems (lights, materials, meshes, environment, post-processing) behind a thin `ThreeRenderAdapter`.
- Materials: 5 builtin shader kinds + textures + custom `ShaderMaterial` + external `.vert`/`.frag` shader files.
- Lights, shadows (PCF / PCSS / VSM / CSM), generated `RoomEnvironment` and HDR equirect via `RGBELoader` + `PMREMGenerator`.
- Cameras: orbit and follow components as data; cinematic playback is on the next sprint.
- Batching: `InstancedMesh` bucketer (S35) and `BatchedMesh` system (S38) for varied-geometry / shared-material entities.
- Picking: `runtime.pick(screen)` resolves entity ids — including instances inside `BatchedMesh` buckets (S42).
- Physics: Rapier adapter with rigid bodies, primitive colliders, sensors, kinematic character controller, raycast, debug overlay and static-mesh / heightfield colliders.
- Persistence: per-project save/load with a component allowlist.
- Hot reload: scene / material / shader-file HMR through Vite.
- Frame-rate-independent fixed-step physics with interpolation.

Agent surfaces:

- CLI: `engine check`, `inspect`, `summarize`, `doctor`, `migrate`, `asset`, `replay`, `docs`, `patch`.
- Dev bridge: HTTP + WebSocket endpoints under `/__agf/*` for snapshot, diagnostics, commands, recording, asset invalidation.
- `window.__agf` global exposing snapshot / commands / save/load / recording / dev tuner.
- Deterministic recorder + `engine replay` for headless reproduction.

Example projects:

- `examples/hello-3d` — starter scene with parent/child hierarchy.
- `examples/beacon-world` — dogfood sample game with persistence, physics and networking hooks.
- `examples/batch-bench` — InstancedMesh + BatchedMesh regression target.
- `examples/physics-bench` — Rapier scaling fixture.
- `examples/shadows-bench` — CSM / camera / RTS-scene visual showcase.
- `examples/backends/node-world-server` — reference Node backend (smoke + optional WebSocket `--serve`).
- `examples/backends/dotnet-world-server` — reference .NET backend skeleton (no transport yet).

## Architecture

```
project JSON → schemas → ECS world → systems → adapters → browser
                                ↑                    ↑
                                |                    |
                          engine check         Three / Rapier
                          engine inspect       (adapters, not core deps)
                          engine doctor
```

Boundaries that are enforced by `npm run preflight`:

- `engine/core/` may not import `engine/render/`, `three`, DOM, Vite, Playwright.
- Hot-path ECS systems must use cached `createQuery` handles, not raw `world.query()`.
- Project-specific gameplay code lives under `examples/<project>/`, never in `engine/`.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the longer version.

## Agent workflow

The intended `edit → validate → run → inspect` loop:

1. **Read** — `BACKLOG.md`, `HIGH_LEVEL_BACKLOG.md`, relevant schemas under `schemas/`, the example project's `template_context.md`.
2. **Edit** — JSON project files / TypeScript ECS systems.
3. **Validate** — `npm run engine:check -- examples/<project>`.
4. **Type-check** — `npm run typecheck`.
5. **Test** — `npm run test` and / or `npm run engine:inspect -- examples/<project>`.
6. **Run** — `npm run dev` and open the project URL.
7. **Diagnose** — `curl http://localhost:5173/__agf/bug-report` for a one-shot snapshot.

For a deeper walkthrough, see [`docs/agent/debug-protocol.md`](docs/agent/debug-protocol.md).

## Documentation map

| Audience | File |
|---|---|
| Getting started | this README |
| Engineering rules | [`CLAUDE.md`](CLAUDE.md) |
| Agent loop conventions | [`AGENTS.md`](AGENTS.md) |
| Architecture | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Repository layout | [`docs/STRUCTURE.md`](docs/STRUCTURE.md) |
| Development workflow | [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) |
| Quality axes | [`docs/QUALITY_AXES.md`](docs/QUALITY_AXES.md) |
| Debug protocol | [`docs/agent/debug-protocol.md`](docs/agent/debug-protocol.md) |
| Active sprint | [`BACKLOG.md`](BACKLOG.md) |
| Roadmap epics | [`HIGH_LEVEL_BACKLOG.md`](HIGH_LEVEL_BACKLOG.md) |
| Archived sprints | [`BACKLOG_ARCHIVE.md`](BACKLOG_ARCHIVE.md) |
| Research notes | [`docs/research/`](docs/research/) |
| Contributing | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| Security | [`SECURITY.md`](SECURITY.md) |
| Third-party notices | [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) |

## Current limitations

AGF is honest about what it does **not** do today:

- No visual editor. Authoring is text + diagnostics.
- No animation authoring / skeletal-animation blending / navmesh.
- No 2D / sprite path — 3D only.
- No mature UI layout system; HUDs are built ad-hoc per project.
- No npm-published package — consume by working inside this repository.
- No production-grade backend. Reference Node `--serve` and .NET skeletons exist; auth, persistence and ops tooling do not.
- Multiplayer is solo-first persistent-world shape, not high-frequency competitive netcode.
- WebGPU renderer is not implemented yet (`M21-webgpu-spike` is queued).

## Roadmap

The high-level roadmap lives in [`HIGH_LEVEL_BACKLOG.md`](HIGH_LEVEL_BACKLOG.md). Near-term focus areas (Sprint 43+):

- **Public-repo readiness** — license, metadata, docs sync, CI parity, e2e stability.
- **Renderer Phase 2 tail** — modern-PCF PCSS, CSM-PCSS, env-cube, cam-cinematic, WebGPU spike.
- **Asset pipeline** — KTX2 / Basis texture compression, LOD metadata, decoder-vendor verification.
- **Agent authoring helpers** — `engine new`, `engine list components`, `engine explain component`, screenshot CLI.

## License

[Apache License 2.0](LICENSE). Third-party notices in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
