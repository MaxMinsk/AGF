# AGF Agent Probe Catalogue

One-stop reference for every probe surface an agent can hit while
the dev server is running. All routes live under `/__agf/` and accept
JSON. The dev bridge proxies each route to the currently-attached
page over a websocket; multi-page setups multiplex by `playerId`.

Pair this doc with:
- `docs/diagnostics-policy.md` — severity scale + AGF_* code naming
- `docs/agent/debug-protocol.md` — when to reach for what during a
  bug-hunt
- `examples/kaboom-crew/README.md` — sample project-level surface
  layered on top (`window.__agf.kaboom.*`)

Every route is GET unless marked POST. Responses are wrapped in
`{ ok: boolean, payload?: ..., error?: { code, message } }`.

---

## Snapshot the world

### `GET /__agf/snapshot`

Returns the full ECS snapshot. Same shape `runtime.snapshot()`
produces in-page.

```bash
curl -s http://localhost:5173/__agf/snapshot | jq '.payload.snapshot.entities | length'
```

Payload shape:

```ts
{
  agfFormatVersion: 1,
  projectId: string | null,
  profile: string | null,
  playerId: string | null,
  capturedAt: string,           // ISO timestamp
  snapshot: WorldSnapshot,      // entities + components
  diagnostics: RuntimeDiagnostic[],
  rendererInfo: { … },          // see /__agf/renderer-info
  reloadEvents: HotReloadEvent[]
}
```

---

## Diagnostics bus

### `GET /__agf/diagnostics`

Snapshot of the in-process runtime diagnostics ring buffer (last 200
events, configurable per project).

```bash
curl -s http://localhost:5173/__agf/diagnostics \
  | jq '.payload.snapshot[] | select(.severity != "info")'
```

### `GET /__agf/events`

Server-Sent Events stream of live diagnostic emissions. Useful for
watching `AGF_*` codes flow in real time during a probe session.

```bash
curl -N http://localhost:5173/__agf/events?playerId=<id>
```

Each line is one `data: { … }` SSE frame carrying a
`RuntimeDiagnostic`.

---

## Renderer

### `GET /__agf/renderer-info`

Compact counter block — meshes / lights / buckets / handleLeak /
drawCalls / triangles / gpuMs / etc.

```bash
curl -s http://localhost:5173/__agf/renderer-info \
  | jq '.payload.rendererInfo'
```

### `GET /__agf/renderer-inspect`

S83 AGF-AGENT-RENDERER-PROBE. Rich dump combining
`/__agf/renderer-info` with the explicit list of entity ids holding
mesh handles. The S82 ghost-player bug-hunt was the motivator —
`handleLeak: 8` told us the count, but only this endpoint reveals
WHICH ids leaked.

```bash
curl -s http://localhost:5173/__agf/renderer-inspect \
  | jq '.payload.info.handleLeak, .payload.handles.entityIds'
```

Payload shape:

```ts
{
  info: { … same as rendererInfo … },
  handles: { count: number, entityIds: string[] }
}
```

---

## Commands

### `POST /__agf/commands`

Apply an array of engine commands to the live world. Same shape
`runtime.applyCommands()` accepts — `entity.create`,
`entity.delete`, `component.set`, `component.remove`, `scene.load`.

```bash
curl -s -X POST http://localhost:5173/__agf/commands \
  -H 'Content-Type: application/json' \
  -d '{"commands":[{"kind":"component.set","entityId":"player.1","component":"BomberStats","data":{"maxBombs":3,"range":3,"alive":true}}]}' \
  | jq
```

Returns `{ payload: { applied: number } }`.

---

## Console log

### `GET /__agf/console-log`

Last ~200 lines from `console.{log,warn,error,info,debug}` on the
page. Lets an agent see WebGPU validation warnings, three.js
`warnOnce` text, and other browser-side noise without launching
playwright.

```bash
curl -s http://localhost:5173/__agf/console-log | jq '.payload.lines[-20:]'
```

---

## Reload events

### `GET /__agf/reload-events`

Hot-reload event log (Vite HMR → AGF reload propagation). Useful
when the page didn't update after a save — sift through the event
stream to see what fired and what was skipped.

### `GET /__agf/pool-inventory`

S88 AGF-POOL-INVENTORY-PROBE. Snapshot of every renderer pool's
`live` (current size) + `peak` (high-water mark since boot) handle
counts. Use it to confirm a project's pre-warm pass actually ran
(`peak >= 1` on the relevant pool) or to spot pools that grew under
live demand and are now over-provisioned.

```bash
curl 'http://localhost:5173/__agf/pool-inventory'
# → { "pools": [
#       { "name": "instanced", "live": 1, "peak": 1 },
#       { "name": "batched",   "live": 0, "peak": 0 },
#       { "name": "particle",  "live": 1, "peak": 2 }
#     ] }
```

### `GET /__agf/runtime/timescale` · `POST /__agf/runtime/timescale`

S90 AGF-DEV-BRIDGE-TIME-SCALE. Read or set the engine-level
time-scale that the loop multiplies into every system's dt.
Clamped to `[0.05, 4]`; non-finite values fall back to `1`. The
response always carries the final clamped value so the caller can
diff against its intent.

```bash
curl 'http://localhost:5173/__agf/runtime/timescale'
# → { "scale": 1 }
curl -X POST 'http://localhost:5173/__agf/runtime/timescale' \
  -H 'Content-Type: application/json' \
  -d '{"value":0.25}'
# → { "scale": 0.25 }
```

### `POST /__agf/asset/invalidate?playerId=<id>`

Manually invalidate an asset binding on the page (used by the
Vite plugin when a material/glb file changes; agents rarely call
this directly).

```bash
curl -X POST 'http://localhost:5173/__agf/asset/invalidate?playerId=<id>' \
  -H 'Content-Type: application/json' \
  -d '{"ref":"runtime/materials/hero.material.json"}'
```

---

## Recording (deterministic replay)

### `POST /__agf/recording/start` · `POST /__agf/recording/stop`

Capture every applied command + the current scene into a
`Recording` blob suitable for `engine replay`.

```bash
curl -X POST http://localhost:5173/__agf/recording/start
# … drive the page …
curl -X POST http://localhost:5173/__agf/recording/stop \
  | jq '.payload.commands | length'
```

---

## Health

### `GET /__agf/health`

Just `{ ok: true, page: ... }` — useful to wait for the dev bridge
in CI before issuing other probes.

---

## Conventions

- Every payload is wrapped: `{ ok: boolean, payload?, error? }`.
  `error.code` is `AGF_*` so agents grep on a stable token.
- Routes that need the active page proxy through a websocket. A
  502 with `AGF_BRIDGE_PAGE_TIMEOUT` means no page is attached or
  the page didn't reply within 3 s.
- For the page-side mirror (no curl), `window.__agf` exposes
  `snapshot()`, `applyCommands()`, `diagnostics()`,
  `rendererInfo()`, `rendererInspect()`, `frameTiming()`,
  `copyDiagnostics()` plus project-specific surfaces (e.g.
  `window.__agf.kaboom.*` in Kaboom Crew).
- Outputs are stable enough to grep against in CI. Adding a new
  field is non-breaking; reshaping or renaming is a breaking
  change and gets called out in the relevant sprint commit.
