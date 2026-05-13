# AGF Reference Backends

This folder holds reference implementations of an AGF persistent-world backend.

Reference backends are **not** part of the engine. The engine ships:

- `schemas/protocol.schema.json` — the wire contract.
- The client-side runtime (`engine/runtime/`) — eventually a network adapter that consumes the same schema.
- World snapshot semantics — derived from the existing `WorldSnapshot` shape.

A backend implementation must:

- Treat `schemas/protocol.schema.json` as the source of truth for messages.
- Validate inbound messages at the boundary before accepting them.
- Be replaceable. Picking C#/.NET, Node.js or anything else is an integration choice for the project that uses AGF, not an engine choice.

## Current Skeletons

- `node-world-server/` — Node + TypeScript starting point. Loads the protocol schema, validates a couple of sample messages and reports ready. No transport yet.

C#/.NET reference is planned but not yet scaffolded (see ADR-0001 and ADR-0006).

## How A Backend Should Be Added

1. Pick a transport (SignalR for the C# reference, raw WebSockets for the Node skeleton, anything else when justified).
2. Create `examples/backends/<name>/` with its own `README.md`, `src/`, and language-appropriate manifest (`package.json`, `*.csproj`, …).
3. Validate every inbound message against `schemas/protocol.schema.json`.
4. Emit only messages that validate against the same schema.
5. Keep the backend isolated — no engine code reaches into a specific backend, and vice versa. Profile contracts cross the seam, not internal types.
