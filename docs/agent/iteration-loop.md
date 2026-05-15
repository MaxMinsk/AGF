# Agent Iteration Loop

Practical reference for the tools an agent uses to iterate on an AGF project. Everything here is text-driven and JSON-friendly; no GUI required.

Pair with [`debug-protocol.md`](debug-protocol.md), [`skills/playtest-debugging.md`](skills/playtest-debugging.md) and [`skills/engine-check.md`](skills/engine-check.md). When in doubt, those win.

## At-a-glance flow

```
edit text file
   ├─ scene/manifest/material → Vite HMR + `agf:asset-changed`
   ├─ playtest scenario       → `npm run playtest:watch` reruns the matching scenario
   └─ engine code             → vite hot module replace
       │
inspect state
   ├─ engine inspect <project>          → live scene normalised, filterable
   ├─ engine inspect --component <Name> → narrow on a component
   ├─ engine inspect --diff a.json b.json → human/json diff of two saved snapshots
   └─ engine inspect ... --save path     → write the JSON payload to a file, no shell redirection
       │
run gameplay
   ├─ npm run dev   → http://127.0.0.1:5173/?project=<id>
   ├─ window.__agf surface (16 calls — see skills/playtest-debugging.md)
   └─ /__agf/* HTTP endpoints (12 routes — see skills/playtest-debugging.md)
       │
robot playtest
   ├─ examples/<project>/playtests/*.playtest.json — describe scenario as data
   ├─ npm run test:e2e        → run every scenario once
   └─ npm run playtest:watch  → rerun the matching scenario on every save
```

## Sprint workflow

One long-lived `sprint/<N>-<slug>` branch per sprint. Inside the sprint:

1. Pick a story from `BACKLOG.md` (or via `/start-next`).
2. Implement, marking `Status: Implemented` in the BACKLOG entry.
3. Commit immediately — the smallest relevant verification (typecheck / one unit suite / `engine check`) is enough mid-sprint. **Do not** run `npm run preflight` per story.
4. At sprint close (`/archive-sprint`): run preflight, move detail to `BACKLOG_ARCHIVE.md`, promote the next sprint into Current Sprint, push the branch, open a single PR with `gh pr create`, auto-merge with `gh pr merge --squash --auto`.

The whole policy is captured in `[[feedback-workflow]]` memory.

## `engine inspect` flags

| Flag | Meaning |
|---|---|
| `--component <Name>` | Keep only entities that have all listed components (repeatable). |
| `--query A,B` | Same intent; comma-separated single argument. AND of components. |
| `--entity <id>` | Keep only entities whose id matches (repeatable). |
| `--json` | Emit machine-readable JSON to stdout. |
| `--save <path>` | Write JSON payload to that path. Parent dirs created. `stderr` confirms; `stdout` stays clean. |
| `--diff <a.json> <b.json>` | Compare two saved snapshots. Combinable with `--json` / `--save`. |
| `--watch` | Stream NDJSON to stdout, one line per refresh. See [`inspect-stream.md`](inspect-stream.md). |

Saved snapshots round-trip:

```bash
npm run engine:inspect -- examples/beacon-world --component Pickup --save before.json
# ... do something ...
npm run engine:inspect -- examples/beacon-world --component Pickup --save after.json
npm run engine:inspect -- --diff before.json after.json
```

## `window.__agf` surface (DEV builds only)

Sixteen calls — see the table in [`skills/playtest-debugging.md`](skills/playtest-debugging.md). The day-to-day ones:

- `__agf.snapshot()` — current `WorldSnapshot`.
- `__agf.diagnostics()` — retained diagnostic list.
- `__agf.applyCommands([...])` — mutate the live world.
- `__agf.rendererInfo()` — counters incl. `gpuMs` on WebGL2 + `EXT_disjoint_timer_query_webgl2`.
- `__agf.frameTiming()` — windowed `fixedUpdateMs / frameUpdateMs / renderMs`.
- `__agf.pick({ x, y })` — ray cast at NDC.
- `__agf.reloadCount` / `__agf.reloadEvents` — HMR observation tools.

Production builds leave `window.__agf` undefined.

## Dev-bridge HTTP endpoints (DEV only)

Twelve routes under `/__agf/*` — see the table in [`skills/playtest-debugging.md`](skills/playtest-debugging.md). Day-to-day:

- `GET /__agf/snapshot` — for tooling outside the page.
- `GET /__agf/diagnostics` — paired with the page bus.
- `GET /__agf/events` — SSE stream of live diagnostics + reload events.
- `POST /__agf/commands` — apply an EngineCommand array.
- `POST /__agf/project-patch` — deep-merge a JSON patch onto `project.json` on disk + Vite reloads.
- `GET /__agf/bug-report` — bundle (project meta + snapshot + diagnostics + renderer info + frame timing).

Used by Playwright traces, the shadow-tuner save flow, and ad-hoc `curl` debugging.

## Playtest scenarios

A scenario is JSON validated by `schemas/playtest.schema.json` and lives at `examples/<project>/playtests/*.playtest.json`. The Playwright runner under `tests/e2e/playtest-runner.spec.ts` discovers scenarios at module load time and emits one test per file.

Steps:

```jsonc
{ "kind": "wait", "seconds": 0.2 }
{ "kind": "applyCommands", "commands": [/* EngineCommand[] */] }
{ "kind": "expectComponent", "entityId": "...", "component": "...", "match": { /* partial deep match */ } }
{ "kind": "expectEntityMissing", "entityId": "..." }
```

`expectComponent.match` is **deep** partial match (Playwright's `toMatchObject`). Nested keys are checked recursively without changing the scenario schema.

### Iterating fast

`npm run playtest:watch` watches `examples/*/playtests/*.playtest.json`. On every save it parses the scenario, extracts `scenario.id`, and runs `npx playwright test tests/e2e/playtest-runner.spec.ts --grep <id>`. Playwright's `reuseExistingServer` keeps each rerun sub-second after the first.

Run `npm run dev` in one terminal and `npm run playtest:watch` in another for the tightest edit-run loop.

## Recipes

### "What does the scene look like right now?"

```bash
npm run engine:inspect -- examples/beacon-world
```

### "What changed between two states of the world?"

```bash
npm run engine:inspect -- examples/beacon-world --save /tmp/agf/before.json
# trigger something via the browser, applyCommands, or a playtest run
npm run engine:inspect -- examples/beacon-world --save /tmp/agf/after.json
npm run engine:inspect -- --diff /tmp/agf/before.json /tmp/agf/after.json
```

### "Run this scenario over and over while I tweak it"

```bash
npm run dev                # terminal 1
npm run playtest:watch     # terminal 2 — edit the .playtest.json file to retrigger
```

### "Confirm a hot-reload actually fired in a Playwright test"

Don't grep the console — read `window.__agf.reloadCount` before and after. See `tests/e2e/glb-hot-reload.spec.ts` for the pattern.

### "Get a one-shot screenshot for a regression test"

```bash
npm run engine:screenshot -- <projectId> --out test-results/<name>.png
```

Boots headless Chromium against the dev server, awaits `__agf.rendererReady` (which respects `project.render.criticalAssets`), writes the PNG.

### "Bundle everything I know about the current page for a bug report"

```bash
curl http://127.0.0.1:5173/__agf/bug-report > /tmp/agf-bug.json
```

or inside the page:

```ts
await window.__agf.copyDiagnostics();   // writes JSON to clipboard + returns string
```

### "Tune a numeric value visually instead of guessing"

See [`dev-tuner.md`](dev-tuner.md). Spawn sliders via `__agf.dev.tuner.add(...)`, let the user dial, remove them, bake the values into the JSON.
