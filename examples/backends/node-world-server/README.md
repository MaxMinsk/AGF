# Node World Server (skeleton)

Skeleton Node + TypeScript reference backend for AGF persistent-world projects. **It does not yet open a network port.** The current scope is to prove the boundary: this process loads `schemas/protocol.schema.json`, compiles it with AJV and validates a handful of sample messages.

## Run

From the repo root:

```bash
npm run backend:node
```

Expected output:

```
[node-world-server] starting...
[node-world-server] protocol schema loaded; awaiting client transport implementation.

Smoke test:
  player.join: valid
  player.leave: valid
  intent.move: valid
  world.snapshot: valid
```

## Scope (v0)

- Load `schemas/protocol.schema.json` via the same `ajv` setup used by `engine check`.
- Compile the schema once at startup; reuse the compiled validator on every inbound message.
- Validate a small set of representative sample messages on boot so a build that breaks the schema fails fast.

## Out Of Scope (v0)

- No HTTP / WebSocket / SignalR transport — picked when the first interactive use case appears (likely Beacon World's `connected` profile).
- No persistence — world state is in-memory only when it eventually lands.
- No authentication or account model — `playerId` is a contract field, not yet a security boundary.

## Layout

```
node-world-server/
  src/
    index.ts          # entrypoint stub (the file you actually run)
  README.md           # this file
```

Future additions land alongside `src/`: `transport-ws.ts` (WebSocket adapter), `world.ts` (server-owned `World` mirror), and so on. Keep new files small and self-contained — agents should be able to load any one of them as context.
