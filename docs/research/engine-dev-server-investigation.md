---
title: Engine dev server — investigation
status: draft (Sprint 30 / E.80)
owner: agent-first runtime
related:
  - HIGH_LEVEL_BACKLOG.md M15
  - engine/runtime/diagnostics/diagnostics-bus.ts (Sprint 26)
  - engine/runtime/recording/recorder.ts (Sprint 28)
  - engine/render/three-renderer.ts (`renderer.info`)
---

# Engine dev server — investigation

Sprint 30 / story `E.80`. Investigation only — no code lands from this doc; it produces a design and a sequenced implementation sprint plan for what becomes M15-a, M15-b, M15-c, etc.

## 1. Why we need it

AGF today exposes two surfaces:

- **Filesystem CLI** (`engine check / inspect / summarize / doctor / patch / replay / docs / migrate / asset`). Headless, reads project files.
- **Browser runtime** (`src/main.ts` + `engine/runtime/start.ts` mounting in a Vite dev page). `window.__agf.*` exposes a small live API in DEV: `snapshot()`, `diagnostics()`, `rendererInfo()`, `applyCommands(...)`, `copyDiagnostics()` (Sprint 27 — grandfathered), `reloadEvents`.

Gap: **agents cannot reach the running tab programmatically**. When the user has the game running and describes a bug, the only options today are:

1. Walk the user through DevTools console calls and paste-back. Human-mediated, slow, lossy.
2. Re-run a playtest with a similar setup. Misses the actual live state.

Neither matches AGF's agent-first stance ([[feedback-no-clipboard-state-transfer]]).

## 2. Use cases the bridge must cover

Listed in priority order. Each is something an agent should do without going through a human-mediated step.

| # | Use case | Primitives that already exist |
|---|---|---|
| 1 | Pull current world snapshot from a running tab | `runtime.snapshot()` |
| 2 | Pull the diagnostics ring buffer | `runtime.diagnostics.snapshot()` |
| 3 | Pull renderer info (geometries/textures/programs/draw-calls) | `renderer.info()` |
| 4 | Bundle (1) + (2) + (3) + project metadata as a single `AgentBugReport` | none yet (composes the above) |
| 5 | Start a recording, drive the game, stop and get the `Recording` JSON | `runtime.startRecording()` / `stopRecording()` (Sprint 28) |
| 6 | Inject `EngineCommand[]` into the running scene (live edit) | `runtime.applyCommands(...)` |
| 7 | Subscribe to a live diagnostics / HMR / scheduler stream | `diagnostics.subscribe(...)` (exists) |
| 8 | Trigger an asset HMR reload from outside | `runtime.invalidateAsset(ref)` |
| 9 | Read `agf:asset-changed` reload history | `window.__agf.reloadEvents` |
| 10 | (later) Send virtual input events (mouse/key) for Playwright-light tests | no existing primitive — would need a small input adapter |

Things the bridge explicitly does **not** do in v0:

- No production mode. Bridge is DEV-only.
- No authentication. Bind only to localhost.
- No cross-page coordination. One page at a time. Multi-tab is a later concern.
- No persistent agent connection across hot reloads. The page-side bootstrap reconnects on every HMR cycle.

## 3. Architecture options

### Option A — Vite plugin with `configureServer` (recommended)

Vite plugins can hook the dev server via `configureServer(server)` to register HTTP middleware and intercept WebSocket upgrades. We add a single plugin (`engine/dev/agf-dev-bridge.ts`) that:

1. Registers `/__agf/*` middleware on the Vite HTTP server.
2. Handles `/__agf/ws` upgrade requests with a `WebSocketServer` (`ws` package — already a transitive dep via the backend skeleton).
3. Holds at most one active page WebSocket connection per Vite dev server instance.
4. Forwards HTTP requests to the page over WS as `{ id, kind, payload? }` messages; the page replies `{ id, ok, payload?, error? }`; the server resolves the HTTP response.

Pros:
- Zero extra process. Lives in `npm run dev`.
- Shares Vite's port (default 5173), no separate URL to remember.
- HMR-friendly: the page-side bootstrap can re-open the WS on every `import.meta.hot.accept`.
- All deps already exist in the tree.

Cons:
- Vite-coupled. If a project ever runs without Vite (e.g. headless playtest robot), the bridge is unavailable. But headless playtests don't need it — they have direct programmatic access to `runtime.*` anyway.

### Option B — Standalone Node sidecar

Run `engine bridge --port 5174` as a separate process that owns the WS server. Vite proxies `/__agf/*` to it.

Pros:
- Decoupled from Vite.
- Easier to extend with persistent state (e.g. recording cache).

Cons:
- Two processes to keep alive. More moving parts in `npm run dev` orchestration.
- Port conflicts; CORS dance.
- More code to maintain.

### Option C — MCP server

Expose the bridge as a Model Context Protocol server an agent can connect to natively.

Pros:
- Native fit with Claude's MCP client.

Cons:
- Specific to one agent. AGF should not lock in a single agent integration; the wire protocol must stay plain HTTP so other tooling (curl, generic test harnesses) can also drive it.
- Out of scope for v0. A thin MCP adapter can layer on top of the Option A HTTP surface later.

### Decision

**Option A** (Vite plugin). It is the smallest change that delivers every use case and aligns with how Vite users already think about dev-server middleware. Option C remains a future thin adapter layered on top of A.

## 4. Endpoint surface

All routes are HTTP and live under `/__agf/`. The page-side bootstrap opens a WS to `/__agf/ws` and answers RPC messages there.

### Synchronous reads

```
GET  /__agf/health
GET  /__agf/snapshot
GET  /__agf/diagnostics
GET  /__agf/renderer-info
GET  /__agf/bug-report
GET  /__agf/reload-events
```

All return JSON. `/__agf/bug-report` composes snapshot + diagnostics + renderer-info + project id + active profile + networking config into one `AgentBugReport` (see `schemas/bug-report.schema.json`, to land in M15).

### Recording

```
POST /__agf/recording/start
POST /__agf/recording/stop   → returns the Recording JSON
GET  /__agf/recording/status → { active: boolean, commandsCaptured: number }
```

Recording state lives on the page (it's the existing `runtime.startRecording()` from Sprint 28); the bridge just RPC-proxies.

### Live mutation

```
POST /__agf/commands          body: { commands: EngineCommand[] }
POST /__agf/asset/invalidate  body: { ref: string }
```

`/__agf/commands` validates the body against `schemas/scene.schema.json`'s command definitions before forwarding. Invalid commands return 400 with a diagnostic envelope.

### Event streaming

```
GET /__agf/events  (Server-Sent Events)
```

Streams `{ kind, payload }` events:

- `diagnostic` — every new entry on the runtime diagnostics bus
- `asset-reload` — every `agf:asset-changed` HMR event
- `scheduler-tick` — sparse (every N ticks) for liveness; configurable
- `recording-event` — per captured command if a recording is active

SSE was chosen over WebSocket for the event stream because it's HTTP-native and any agent can `curl --no-buffer` it.

### Errors

A standard envelope across all routes:

```json
{
  "ok": false,
  "error": {
    "code": "AGF_BRIDGE_PAGE_NOT_CONNECTED",
    "message": "No active page on /__agf/ws — open http://localhost:5173 in a tab first."
  }
}
```

Defined error codes (initial set):

- `AGF_BRIDGE_PAGE_NOT_CONNECTED` — no WS yet.
- `AGF_BRIDGE_PAGE_TIMEOUT` — the page did not answer within 3s.
- `AGF_BRIDGE_INVALID_COMMAND` — `commands` body failed schema validation.
- `AGF_BRIDGE_RECORDING_NOT_ACTIVE` — `recording/stop` with no active recording.

## 5. Security stance

DEV-only. The plugin and the page-side bootstrap are excluded from production builds:

```ts
// engine/dev/agf-dev-bridge.ts
export default function devBridge(): Plugin {
  return {
    name: "agf-dev-bridge",
    apply: "serve", // never runs during `vite build`
    configureServer(server) { /* ... */ }
  };
}
```

Page-side bootstrap is gated by `import.meta.env.DEV`, mirroring the existing `window.__agf` gate.

Bind only to localhost. The plugin reads `server.config.server.host`; if the user has set `host: '0.0.0.0'` for testing on a phone, the plugin logs a loud warning and refuses to register the WS upgrade unless `AGF_DEV_BRIDGE_ALLOW_REMOTE=1` is explicitly set. Defensive default: localhost is the only safe surface.

No authentication. Agents running on the same machine reach `localhost:5173` directly; cross-machine access requires an SSH tunnel or explicit opt-in.

## 6. Integration with existing primitives

| Existing primitive | Bridge surface |
|---|---|
| `runtime.snapshot()` (Sprint 1) | `GET /__agf/snapshot` |
| `runtime.diagnostics.snapshot()` (Sprint 26) | `GET /__agf/diagnostics` |
| `runtime.diagnostics.subscribe(...)` (Sprint 26) | `GET /__agf/events` (SSE) |
| `runtime.renderer.info()` (Sprint 26) | `GET /__agf/renderer-info` |
| `runtime.startRecording()` / `stopRecording()` (Sprint 28) | `/__agf/recording/{start,stop}` |
| `runtime.applyCommands(...)` (Sprint 1) | `POST /__agf/commands` |
| `runtime.invalidateAsset(ref)` (Sprint 22+) | `POST /__agf/asset/invalidate` |
| `window.__agf.reloadEvents` (Sprint 22+) | `GET /__agf/reload-events` |

Everything the bridge exposes is already implemented on the runtime side. The plugin is a thin RPC adapter, not new engine functionality.

## 7. Page-side bootstrap

A small `engine/dev/page-bridge.ts` module imported by `src/main.ts` when `import.meta.env.DEV`:

```ts
// pseudocode
const ws = new WebSocket(`ws://${location.host}/__agf/ws`);
ws.onmessage = async (ev) => {
  const msg = JSON.parse(ev.data);
  try {
    const payload = await handle(msg);
    ws.send(JSON.stringify({ id: msg.id, ok: true, payload }));
  } catch (error) {
    ws.send(JSON.stringify({
      id: msg.id,
      ok: false,
      error: { code: "AGF_BRIDGE_PAGE_HANDLER_FAILED", message: String(error) }
    }));
  }
};
```

`handle` dispatches on `msg.kind` and calls the corresponding `app.*` method. `app` is the existing `AppHandle` from `src/app.ts` — the bridge does not introduce a parallel API.

HMR: the bootstrap calls `import.meta.hot.accept(() => ws.close())` so the WS reconnects after every hot reload.

## 8. Implementation sprint plan

Sized so each story is roughly one focused day. Stories enter `BACKLOG.md` as the next sprint pulls them.

1. **`M15-a` Plugin scaffold + health endpoint.** New `engine/dev/agf-dev-bridge.ts` Vite plugin. `GET /__agf/health` returns `{ ok: true, version }`. No WS yet. Wire into `vite.config.ts` (DEV-only). Unit test: plugin is `apply: "serve"`; production build excludes it.
2. **`M15-b` WS bootstrap + page bridge.** Add `engine/dev/page-bridge.ts`; `src/main.ts` imports it under `import.meta.env.DEV`. Bridge handshake message: `{ kind: "hello", projectId, profile }`. Plugin logs "page connected".
3. **`M15-c` Pull endpoints.** `GET /__agf/snapshot|diagnostics|renderer-info|reload-events`. Each route translates HTTP → WS RPC → page. 3-second timeout per request.
4. **`M15-d` Bug report endpoint + schema.** `GET /__agf/bug-report` composes the four above + project id + active profile + networking config. Add `schemas/bug-report.schema.json`. Validate the response shape on the page side before sending.
5. **`M15-e` Recording endpoints.** `/__agf/recording/{start,stop,status}` proxy to `runtime.startRecording/stopRecording`. Response is the `Recording` JSON.
6. **`M15-f` Live command injection.** `POST /__agf/commands` validates body via existing scene-command Ajv schemas; forwards to `runtime.applyCommands`. Reject malformed with structured `AGF_BRIDGE_INVALID_COMMAND` diagnostic.
7. **`M15-g` SSE event stream.** `GET /__agf/events`. Page subscribes to `runtime.diagnostics`, `import.meta.hot.on("agf:asset-changed")`, and forwards events to the WS, which the server fans out as SSE.
8. **`M15-h` Asset HMR trigger.** `POST /__agf/asset/invalidate` → `runtime.invalidateAsset(ref)`. Useful when an agent edits `.material.json` from the CLI and wants to push the change.
9. **`M15-i` `engine connect <url>` CLI.** Optional — thin agent-side wrapper. Agents can `curl` directly, so this is a convenience, not a dependency.

Each story is independently testable. M15-a, M15-b together prove the plumbing; M15-c onward incrementally exposes existing runtime APIs.

## 9. Risks and open questions

- **Single-page-per-bridge.** What happens if two tabs open the same project? V0: last WS wins; previous one is told `{ kind: "displaced" }`. Phase-2 could multiplex by `projectId+tabId`.
- **Network adapter conflicts.** The page may also hold a WS to the game backend (the existing `WsNetworkAdapter`). Both are independent connections; no protocol overlap. Confirm with a multi-WS smoke test in M15-b.
- **Vite version sensitivity.** Vite 8 (current) has a stable `configureServer` API. Earlier versions can be ignored — AGF pins to ^8.0.12.
- **`ws` package licensing / size.** Already a transitive dep via the Node backend skeleton. No new direct cost.
- **Production accidentally including the bridge.** Mitigation: the plugin sets `apply: "serve"`; the page bootstrap is `if (import.meta.env.DEV) { ... }`. Add a unit test that `vite build` output never contains the string `/__agf/`.

## 10. Out of scope (not in this investigation)

- Cross-machine debug access.
- Authentication / authorization.
- MCP server adapter.
- Recording playback while another tab is paused (debugger-like stepping).
- Source map / breakpoint integration.

These can layer on top of the HTTP surface later without redesigning the core bridge.

## 11. Recommendation

Adopt **Option A** (Vite plugin) and ship the M15-a/b/c slice (scaffold + WS + pull endpoints) in the next sprint. The remaining stories follow incrementally; each is independently testable. Total scope: ~6–9 stories across one or two sprints.

This unblocks every "user describes a bug in their running tab" workflow without ever asking the user to open DevTools or paste JSON.
