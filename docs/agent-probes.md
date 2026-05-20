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

### `GET /__agf/snapshot` · `GET /__agf/snapshot?at=-N`

Returns the full ECS snapshot. Same shape `runtime.snapshot()`
produces in-page.

S095 AGF-PROBE-SNAPSHOT-HISTORY adds the optional `at` query param:
`at=0` (default) returns the LIVE snapshot, `at=-1` returns the
snapshot captured at the end of the previous fixedUpdate burst,
`at=-N` returns N steps back. The ring holds 32 entries. `at` must
be a non-positive integer:

- Positive values return HTTP 400 `AGF_BRIDGE_INVALID_SNAPSHOT_AT`.
- Negative values beyond the ring size return HTTP 400
  `AGF_PROBE_SNAPSHOT_OUT_OF_RANGE` (the error body reports the
  current `capacity` + `size`).

```bash
curl -s 'http://localhost:5173/__agf/snapshot' | jq '.payload.snapshot.entities | length'
curl -s 'http://localhost:5173/__agf/snapshot?at=-1' | jq '.payload.entities | length'
# Diff live vs. one tick ago:
diff <(curl -s 'http://localhost:5173/__agf/snapshot?at=0' | jq -S '.payload.snapshot') \
     <(curl -s 'http://localhost:5173/__agf/snapshot?at=-1' | jq -S '.payload')
```

Payload shape for the LIVE call (`at=0` or omitted):

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

Payload shape for a HISTORY call (`at=-N`) is the raw `WorldSnapshot`
in `payload` (no diagnostics / renderer-info envelope — historical
snapshots are just ECS state).

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

## Entity + component CRUD (S97 / S98)

Focused per-entity probes complement `POST /__agf/commands` (broad, batched) and `GET /__agf/snapshot` (the whole world). Use these when you want to read or write exactly one entity or component without round-tripping the full snapshot.

### `GET /__agf/entity/<entityId>` · `GET /__agf/entity/<entityId>?at=-N`

S97 AGF-PROBE-ENTITY-DUMP. Returns the full component map for one entity. Add `?at=-N` to read from the snapshot history ring (same indexing as `/snapshot?at=`).

```bash
curl -s 'http://localhost:5173/__agf/entity/player.1' | jq '.payload'
# → { entityId: "player.1", components: { BomberStats: {...}, GridPosition: {...}, ... } }

curl -s 'http://localhost:5173/__agf/entity/player.1?at=-3' | jq '.payload.components.GridPosition'
```

Error codes:
- `404 AGF_PROBE_ENTITY_NOT_FOUND` — id unknown
- `400 AGF_PROBE_SNAPSHOT_OUT_OF_RANGE` — `at` exceeds the 32-entry ring
- `400 AGF_BRIDGE_INVALID_ENTITY_PATH` — empty or extra path segments
- `400 AGF_BRIDGE_INVALID_SNAPSHOT_AT` — positive `at` (must be non-positive integer)

### `POST /__agf/entity`

S98 AGF-PROBE-ENTITY-CREATE. Creates a new entity with an initial component map.

```bash
curl -X POST 'http://localhost:5173/__agf/entity' \
  -H 'Content-Type: application/json' \
  -d '{"entityId":"qa-probe-1","components":{"Foo":{"x":1}}}'
# → { entityId: "qa-probe-1", components: { Foo: { x: 1 } } }
```

Error codes:
- `400 AGF_BRIDGE_INVALID_ENTITY_CREATE` — bad body shape (missing `entityId`, missing `components`, non-object components, array-as-components, etc.)
- `409 AGF_PROBE_ENTITY_EXISTS` — id already taken; DELETE first if you want to replace it.

### `DELETE /__agf/entity/<entityId>`

S98 AGF-PROBE-ENTITY-DELETE. Removes the entity wholesale.

```bash
curl -X DELETE 'http://localhost:5173/__agf/entity/qa-probe-1'
# → { deleted: "qa-probe-1" }
```

Error codes: `404 AGF_PROBE_ENTITY_NOT_FOUND`, `400 AGF_BRIDGE_INVALID_ENTITY_PATH`.

### `GET /__agf/component/<entityId>/<componentName>` · `?at=-N`

S96 AGF-PROBE-COMPONENT-AT. Returns one component value on one entity. Same `?at=` semantics as the entity probe.

```bash
curl -s 'http://localhost:5173/__agf/component/player.1/BomberStats' | jq '.payload.value'
```

Error codes: `404 AGF_PROBE_ENTITY_NOT_FOUND`, `404 AGF_PROBE_COMPONENT_NOT_FOUND`, `400 AGF_BRIDGE_INVALID_COMPONENT_PATH`, `400 AGF_BRIDGE_INVALID_SNAPSHOT_AT`, `400 AGF_PROBE_SNAPSHOT_OUT_OF_RANGE`.

### `POST /__agf/component/<entityId>/<componentName>`

S97 AGF-PROBE-COMPONENT-WRITE. Writes one component value on one entity. The component name is allowed to be new (write can ADD a component the entity didn't already carry).

```bash
curl -X POST 'http://localhost:5173/__agf/component/player.1/BomberStats' \
  -H 'Content-Type: application/json' \
  -d '{"value":{"maxBombs":10,"range":5,"alive":true}}'
# → { entityId: "player.1", component: "BomberStats", value: { maxBombs: 10, ... } }
```

Error codes: `404 AGF_PROBE_ENTITY_NOT_FOUND`, `400 AGF_BRIDGE_INVALID_COMPONENT_WRITE` (missing `value` key), `400 AGF_BRIDGE_INVALID_COMPONENT_PATH`.

---

## Input injection (S98)

### `POST /__agf/input/action`

S98 AGF-PROBE-INPUT-INJECT. Writes a generic `InputAction { action, value? }` transient on an entity. Project input systems read + clear it each frame, translating the abstract action name into project-specific transients (e.g. `'place-bomb'` → `PlaceBombRequest` in Kaboom Crew). Use this when Playwright keyboard.press can't reach the in-game input system because of the focus chain.

Engine stays project-agnostic; the supported action names depend on the project's input system. Kaboom Crew's recognised actions: `'place-bomb'`, `'restart'`, `'move-up'`, `'move-down'`, `'move-left'`, `'move-right'`, `'stop'`. Unknown actions are silently consumed.

```bash
curl -X POST 'http://localhost:5173/__agf/input/action' \
  -H 'Content-Type: application/json' \
  -d '{"entityId":"player.1","action":"place-bomb"}'
# → { entityId: "player.1", action: "place-bomb" }
```

Error codes:
- `404 AGF_PROBE_ENTITY_NOT_FOUND` — entity id unknown
- `400 AGF_BRIDGE_INVALID_INPUT_ACTION` — missing/empty `entityId` or `action` field

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

### `GET /__agf/render/debug-mode` · `POST /__agf/render/debug-mode`

S091 AGF-RENDER-DEBUG-MODE-AGENT. Read or flip the renderer-level
debug material override. Modes:

- `off` — restore every original material (default state).
- `wireframe` — set `material.wireframe = true` on every standard /
  basic / lambert / phong / physical material in the scene.
- `unlit-white` — replace every mesh material with a flat
  `MeshBasicMaterial({ color: 0xffffff })`. Useful to debug shape
  vs. lighting independently.
- `normals` — replace with `MeshNormalMaterial`. Catches flipped
  triangles (mismatched winding shows the wrong hemisphere).
- `uv` — replace with a tiny ShaderMaterial that draws `rgb = (uv.x,
  uv.y, 0)`. Catches packed-atlas / UV-wrap bugs.

Toggling to `off` restores every original material; the override
material is disposed. The companion HUD pill (S091
AGF-RENDER-DEBUG-OVERLAY-HUD) is mounted in the topRight while
mode != off so the player / agent can't accidentally leave the
override on.

```bash
curl 'http://localhost:5173/__agf/render/debug-mode'
# → { "mode": "off" }
curl -X POST 'http://localhost:5173/__agf/render/debug-mode' \
  -H 'Content-Type: application/json' \
  -d '{"mode":"wireframe"}'
# → { "mode": "wireframe" }
curl -X POST 'http://localhost:5173/__agf/render/debug-mode' \
  -H 'Content-Type: application/json' \
  -d '{"mode":"off"}'
# → { "mode": "off" }
```

Invalid mode strings (anything outside the v1 set above) return
HTTP 400 with `AGF_BRIDGE_INVALID_RENDER_DEBUG_MODE`.

### `GET /__agf/render/freecam` · `POST /__agf/render/freecam`

S095 AGF-RENDER-DEBUG-FREECAM. Agent-driven free-fly camera override.
When set, the renderer creates (and pins active) a debug
`PerspectiveCamera` at the supplied pose; the project's normal active
camera is suspended. Sending `{ off: true }` releases the override and
the project camera takes over again. Pure agent observability — not
a player feature; useful for inspecting blast aftermath, off-screen
entities, prefab layout.

POST body shapes:

- `{ position: [x, y, z], lookAt: [x, y, z] }` — set the override.
- `{ off: true }` — clear the override.

```bash
# Look down at the arena from above-and-behind.
curl -X POST 'http://localhost:5173/__agf/render/freecam' \
  -H 'Content-Type: application/json' \
  -d '{"position":[10,12,10],"lookAt":[0,0,0]}'
# → { "freecam": { "position": [10,12,10], "lookAt": [0,0,0] } }

# Read the live override (null when off).
curl -s 'http://localhost:5173/__agf/render/freecam' | jq '.payload.freecam'

# Release the override.
curl -X POST 'http://localhost:5173/__agf/render/freecam' \
  -H 'Content-Type: application/json' \
  -d '{"off":true}'
```

Body validation rejects non-finite numbers, wrong-length tuples, and
non-object payloads with HTTP 400 `AGF_BRIDGE_INVALID_FREECAM`.

### `GET /__agf/audio/master-volume` · `POST /__agf/audio/master-volume`

S095 AGF-AUDIO-MASTER-VOLUME. Master multiplier applied to every
subsequent `runtime.audio.play(id, { volume })` call:
`el.volume = clamp(master * (volume ?? 1), 0, 1)`. Calling this does
NOT retroactively change clips that are already playing — those keep
their captured volume until they restart on the next `play()`.

```bash
curl 'http://localhost:5173/__agf/audio/master-volume'
# → { "value": 1 }
curl -X POST 'http://localhost:5173/__agf/audio/master-volume' \
  -H 'Content-Type: application/json' \
  -d '{"value":0.3}'
# → { "value": 0.3 }
```

Non-number bodies return HTTP 400 `AGF_BRIDGE_INVALID_AUDIO_VOLUME`.
Non-finite values (NaN, Infinity) are ignored on the runtime side —
the response carries the unchanged master.

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
