# Build a Game in AGF

This is the **one-page contract** for an agent that needs to assemble a small game on AGF. It points at the right tools and conventions so you don't re-discover the loop every session.

Companion reading: [`iteration-loop.md`](iteration-loop.md), [`debug-protocol.md`](debug-protocol.md), [`rules.md`](rules.md). When in doubt, those win.

## Mental Model

```
project JSON  ──►  schemas  ──►  ECS world  ──►  systems  ──►  renderer / physics / network adapters
        ▲                                                         │
        └────────────── engine check / inspect / doctor  ◄────────┘
```

You author **data** (JSON) and **systems** (TypeScript). Adapters (Three.js, Rapier, the Node backend) live behind interfaces so gameplay code never touches a `THREE.Mesh` or a Rapier rigid body directly.

## Loop

For every change:

1. **Discover.** What components / scenes / assets already exist?
   - `npm run engine:list -- components` — built-ins + project-local catalog.
   - `npm run engine:list -- examples` — every example project AGF ships.
   - `npm run engine:explain -- component <Name>` — fields, required flags, an authoring example.
2. **Edit.** JSON or TypeScript. Never adapter internals.
3. **Validate.** `npm run engine:check -- examples/<project>`. Treat warnings as TODOs.
4. **Type-check.** `npm run typecheck`.
5. **Inspect.** `npm run engine:inspect -- examples/<project>` for ECS state, optionally with `--component`, `--entity`, `--watch`.
6. **Run.** `npm run dev` and open `/?project=<id>` — confirm the change is visible.
7. **Playtest.** Scripted scenarios live under `examples/<project>/playtests/`. Add or update one when you change a gameplay mechanic.
8. **Diagnose.** `curl http://localhost:5173/__agf/bug-report` for a snapshot + diagnostics dump. Pipe it into `engine inspect --state-from <file>` for offline filtering.

## Common Recipes

### Add a new entity to a scene

1. `npm run engine:list -- components examples/<project>` — confirm the components you want already exist.
2. Edit `examples/<project>/scenes/<scene>.scene.json`, append an entry to `entities`.
3. `npm run engine:check -- examples/<project>` — schema errors come back with `severity`, `code`, `file`, `path`, `message`, `suggestion`.

### Start a brand-new project

```
npm run engine:new -- my-game --template hello-3d
```

The CLI copies the template tree, rewrites `project.json`/`template.json` for the new id, and runs `engine check` on the result.

### Add a project-local component

1. Declare it in `examples/<project>/project-local-components.schema.json` (JSON Schema; one `properties.<Name>` definition per component).
2. Use it in scenes — it will surface in `engine list components <projectDir>`.
3. Build a `System` that reads/writes the component. Register the system via the project's `bootstrap.ts`.

### Wire a custom system

- Use scheduler-registered systems (`fixedUpdate` or `frameUpdate`).
- Use cached `createQuery` handles. Raw `world.query()` in hot paths is a CI failure (`systems:check`).
- Read ECS data, write ECS data. Don't store Three.js or Rapier objects in components — adapters are stateful but invisible to gameplay.

### Import an asset

```
npm run engine:asset -- import examples/<project> path/to/source.glb --id <assetId>
```

Records provenance in `asset-sources.json`; pair with `engine:asset -- optimize` if you ship to production.

### Snapshot the screen

```
npm run engine:screenshot -- <projectId> --out test-results/<name>.png
```

Boots a transient headless Chromium against the dev server, awaits `rendererReady`, writes the PNG.

## Hard Rules

(Mirrors `CLAUDE.md` so you don't have to load both.)

- **English only** in code, comments, identifiers, docs, commits, diagnostics. Personal notes go to `Notes/` (gitignored).
- **No `engine/core` → `engine/render`, `three`, DOM, Vite imports** (`imports:check`).
- **No raw `world.query()` in hot-path systems** (`systems:check`).
- **Schemas first.** JSON Schema before TS type before system before adapter call.
- **No clipboard / download flows** for state transfer between the running game and an agent — use the dev bridge.
- **No hidden Three.js / Rapier objects** in components.

## Where the agent surfaces live

| Need | CLI | HTTP | `window.__agf` |
|---|---|---|---|
| ECS state snapshot | `engine inspect` | `GET /__agf/snapshot` | `__agf.snapshot()` |
| Diagnostics bus | — | `GET /__agf/diagnostics` | `__agf.diagnostics()` |
| Run a command | — | `POST /__agf/commands` | `__agf.applyCommands([...])` |
| Save / load | — | — | `__agf.save()`, `__agf.load()` |
| Bug report bundle | — | `GET /__agf/bug-report` | `__agf.bugReport()` |
| Renderer info | — | — | `__agf.rendererInfo()` |
| Recording | — | `POST /__agf/recording/{start,stop}` | `__agf.startRecording()`, `__agf.stopRecording()` |

The HTTP surface is enabled in DEV only. Production builds ship without `/__agf/*` and without `window.__agf` writes you can depend on; treat them as developer affordances, not engine APIs.

## When to stop

Mark the work done when:

- `npm run engine:check -- examples/<project>` is clean.
- The smallest relevant test or playtest covers the new behaviour.
- A short note in the PR body explains *why* (not just *what*).

If you can't get the loop green in one pass, leave a structured comment with the failing diagnostic and move on — don't paper over the failure with a wider `try/catch` or a disabled check.
