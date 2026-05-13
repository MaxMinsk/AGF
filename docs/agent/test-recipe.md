# Agent Test Recipe

Canonical one-page recipe for verifying any change to an AGF project. Every step references a script in `package.json` so it stays in sync with what actually runs.

The order is intentional: cheapest verification first, broadest last. Stop at the first failure, fix, and restart from the same step.

## 1. Edit JSON (or a project-local system)

Make the smallest coherent change.

- Scene data lives in `examples/<project>/scenes/*.scene.json`.
- Project-local components live in `examples/<project>/schemas/scene-extensions.schema.json`.
- Materials live in `examples/<project>/assets/runtime/materials/*.material.json`.
- Asset sources live in `examples/<project>/assets/_sources/asset-sources.json`.
- Gameplay logic lives in `examples/<project>/src/systems/*.ts`.

Do not edit `engine/` or root `schemas/` when authoring a project; those are engine-wide.

## 2. Schema check

```bash
npm run engine:check -- examples/<project>
```

Pass: `OK: <path>`. Fail: AJV diagnostics with codes such as `AGF_SCHEMA_UNKNOWN_COMPONENT`, `AGF_SCHEMA_REQUIRED_PROPERTY`, `AGF_ASSET_REFERENCE_MISSING`, `AGF_SCENE_DUPLICATE_ENTITY_ID`. Each diagnostic carries a `suggestion` that usually fixes the issue verbatim.

For typos the suggestion includes a Levenshtein `Did you mean "..."` hint.

## 3. Snapshot before / after

```bash
npm run engine:inspect -- examples/<project> --save .agf/snapshots/before.json
# … apply changes …
npm run engine:inspect -- examples/<project> --save .agf/snapshots/after.json
npm run engine:inspect -- --diff .agf/snapshots/before.json .agf/snapshots/after.json
```

The `--save` form writes byte-stable JSON (`projectDir` reduced to its basename, top-level keys sorted) so a diff between two runs on different machines is meaningful.

When the diff is long, truncate the noise:

```bash
npm run engine:inspect -- --diff before.json after.json --tail 10
```

`--tail N` keeps the last N changes and prints `Changes: X (showing last N, M hidden by --tail)` so the truncation is honest.

Filters work alongside `--save`:

```bash
npm run engine:inspect -- examples/<project> --query Repairable,Transform --save after.json
npm run engine:inspect -- examples/<project> --entity world.signal --save signal.json
```

## 4. Unit tests

```bash
npm run test
```

Add Vitest cases under `examples/<project>/tests/unit/` for project-local systems, or `tests/unit/` for engine work. Each case should reproduce a single observation in a clean `World`.

## 5. Playtest scenarios

```bash
npm run playtest examples/<project>
npm run playtest:watch
```

Scenarios live in `examples/<project>/playtests/*.playtest.json`. Each one is a sequence of input keys / commands followed by snapshot assertions. The watcher reruns the matching file on every save.

## 6. Browser dev session

```bash
npm run dev
# open http://127.0.0.1:5173/?project=<id>
```

Useful URL parameters:

- `?project=<id>` — pick a project.
- `?profile=<name>` — pick a profile declared in `project.json.profiles`. Defaults to the first one.
- `?server=ws://localhost:8787` — connect to a node-world-server.
- `?networked=1` — replace local PlayerControlled movement with outbound `intent.move`. Requires `?server=`.
- `?playerId=<id>` — stable player id for the outbound `player.join`.

In DEV mode the runtime exposes `window.__agf`:

- `__agf.snapshot()` — live world snapshot, same shape as `engine:inspect --json`.
- `__agf.applyCommands([…])` — mutate the running world; same `EngineCommand` shape the protocol uses.
- `__agf.resetRound()` — Beacon-specific: re-arm all beacons, respawn all consumed pickups, reset `RoundState`. Equivalent to pressing `KeyR` in the browser. Returns the number of mutations applied.
- `__agf.lastReloadedAsset`, `__agf.reloadCount` — track HMR.

## 7. End-to-end smoke

```bash
npm run test:e2e
```

Playwright drives the running dev server and asserts on the canvas and `window.__agf`. New e2e tests go in `tests/e2e/*.spec.ts`.

## 8. Backend round-trip (only if the change touches the protocol)

```bash
# Terminal A
PORT=8787 npm run backend:node:serve

# Terminal B
npm run dev
# open http://127.0.0.1:5173/?project=beacon-world&server=ws://127.0.0.1:8787&networked=1&playerId=alpha
```

Server-side timeouts log `[node-world-server] timeout playerId=...` after ~30 s of intent silence. Reconnection backoff prints `[ws-adapter] reconnecting in N ms`.

## 9. Sprint close (only at the end of a sprint, never per story)

```bash
npm run preflight
```

Runs `engine:check` on the canonical project, full typecheck, all Vitest suites, the production build and Playwright.

## Cheat sheet

```bash
# fast loop — change JSON / code, repeat:
npm run engine:check -- examples/<project>       # schema sanity
npm run engine:inspect -- examples/<project> --save after.json
npm run engine:inspect -- --diff before.json after.json --tail 10
npm run test                                     # unit tests
npm run playtest examples/<project>              # playtests
npm run dev                                      # human eyes / browser console
# sprint close only:
npm run preflight
```
