# Node World Server (reference backend)

Node + TypeScript reference backend for AGF persistent-world projects. The server has two modes:

1. **Smoke mode** (default) — loads `schemas/protocol.schema.json`, compiles it with AJV, validates a handful of sample messages and exits. Used to catch protocol-schema breakage at build time.
2. **Serve mode** (`--serve`) — opens a **WebSocket transport** on `localhost`, runs an in-memory `World` mirror, and validates every inbound message against the protocol schema. Used by `tests/e2e/multiclient-roundtrip.spec.ts` as the multiplayer harness, and as the backend for `examples/beacon-world`'s `connected` profile during local playtests.

## Run

From the repo root:

```bash
npm run backend:node          # smoke mode (validates samples, exits)
npm run backend:node:serve    # WebSocket transport on localhost
```

Smoke-mode expected output:

```
[node-world-server] starting...
[node-world-server] protocol schema loaded; awaiting client transport implementation.

Smoke test:
  player.join: valid
  player.leave: valid
  intent.move: valid
  world.snapshot: valid
```

Serve-mode expected output (port from `--port`, default `8787`):

```
[node-world-server] starting in serve mode...
[node-world-server] protocol schema loaded.
[node-world-server] WebSocket listening on ws://127.0.0.1:8787
```

## Scope

- Load `schemas/protocol.schema.json` via the same `ajv` setup used by `engine check`.
- Compile the schema once at startup; reuse the compiled validator on every inbound message.
- Validate inbound messages on the boundary. Reject anything that does not validate.
- Hold an in-memory `World` mirror that tracks `player.join` / `player.leave` / `intent.move` and broadcasts world snapshots.

## Explicit non-goals (today)

- **No authentication or account model.** `playerId` is a contract field, not a security boundary. `--serve` is for local-network playtests; do **not** expose it to the public internet.
- **No persistence.** World state is in-memory only and is lost on restart.
- **No SignalR / HTTP fallback.** WebSocket is the only transport.
- **No rate limiting or DoS protection.** Trust is assumed; mismatched clients are disconnected on protocol violation but not banned.
- **No replay / record / audit log.** AGF's deterministic replay tooling records the client side; server-side observability is left to the host integration.

## Layout

```
node-world-server/
  src/
    index.ts          # entrypoint (smoke + --serve dispatch)
    transport-ws.ts   # WebSocket adapter
    world.ts          # in-memory server-owned World mirror
  README.md           # this file
```

Keep new files small and self-contained — agents should be able to load any one of them as context. Each new transport / persistence / authentication layer should land in its own file, not inflated onto `index.ts`.
