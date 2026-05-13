# Agent Iteration Loop

Practical reference for the tools an agent uses to iterate on an AGF project. Everything here is text-driven and JSON-friendly; no GUI required.

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
   ├─ window.__agf.snapshot()        → live world snapshot (DEV only)
   ├─ window.__agf.applyCommands([…]) → mutate live world (DEV only)
   ├─ window.__agf.lastReloadedAsset → last asset ref that hot-reloaded (DEV only)
   └─ window.__agf.reloadCount       → monotonic counter for any test that waits on "another reload"
       │
robot playtest
   ├─ examples/<project>/playtests/*.playtest.json — describe scenario as data
   ├─ npm run test:e2e        → run every scenario once
   └─ npm run playtest:watch  → rerun the matching scenario on every save
```

## `engine inspect` flags

| Flag | Meaning |
|---|---|
| `--component <Name>` | Keep only entities that have all listed components (repeatable). |
| `--query A,B` | Same intent; comma-separated single argument. AND of components. |
| `--entity <id>` | Keep only entities whose id matches (repeatable). |
| `--json` | Emit machine-readable JSON to stdout. |
| `--save <path>` | Write the JSON payload to that path instead of stdout. Parent dirs are created. `stderr` gets a one-line confirmation; `stdout` stays clean. |
| `--diff <a.json> <b.json>` | Compare two previously saved snapshots. Combinable with `--json` / `--save`. |

Saved snapshots round-trip:

```bash
npm run engine:inspect -- examples/beacon-world --component Pickup --save before.json
# ... do something ...
npm run engine:inspect -- examples/beacon-world --component Pickup --save after.json
npm run engine:inspect -- --diff before.json after.json
```

## `window.__agf` (DEV builds only)

```ts
window.__agf = {
  snapshot(): WorldSnapshot;
  applyCommands(commands: ReadonlyArray<EngineCommand>): void;
  lastReloadedAsset?: string;
  reloadCount: number;
};
```

Use `reloadCount` rather than parsing console logs when a test needs to wait for an asset hot-reload:

```ts
const baseline = await page.evaluate(() => window.__agf!.reloadCount);
// ... edit the file ...
await page.waitForFunction(
  (n) => (window.__agf?.reloadCount ?? 0) > n,
  baseline
);
```

Production builds leave `window.__agf` undefined. The string-format console log (`[agf] hot-reloaded asset <ref>`) still exists but is for humans only.

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
