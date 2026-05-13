# ADR-0007: Protocol Schema v0

## Status

Accepted

## Context

AGF needs a stable contract for client/server messages so that multiple backend implementations (C#/.NET first, Node.js soon, others later) interoperate with the same web client. The contract has to be:

- Agent-readable. JSON; no protobuf-style binary blobs at v0.
- Tool-validatable. The same `ajv`-based pipeline that already validates scenes and materials should validate wire messages and recorded fixtures.
- Pragmatic. Small surface, easy to extend, no premature versioning machinery.

## Decision

Persistent-world messages are described by a single root JSON Schema, `schemas/protocol.schema.json`, modelled as a discriminated union over `kind`. Each message variant has:

- `kind`: dot-namespaced string, same naming style as `EngineCommand` (`world.snapshot`, `player.join`, `player.leave`, `intent.move`).
- `payload`: variant-specific object with `additionalProperties: false`.
- Optional `sequence`: monotonic per-connection integer, used for ordering and replay.

The schema is the source of truth. Reference backends (`examples/backends/*`) must produce/consume messages that validate against it; the client validates inbound messages at the boundary before they reach the command pipeline.

v0 ships four message kinds:

- `world.snapshot` — server → client, periodic or on-demand state dump.
- `player.join` / `player.leave` — server → client, presence changes.
- `intent.move` — client → server, normalised 2D movement input.

## Consequences

- The same diagnostic flow (`AGF_SCHEMA_*` codes) covers protocol messages once `engine check` is taught to walk a project's `net/` folder.
- Backends in different languages can either generate types from the JSON Schema (TS / C#) or keep a hand-written DTO and rely on schema validation at runtime.
- The discriminator is wide open for new `kind` values; adding a message is one entry in the schema plus tests, no engine-core churn.
- Binary transports (MessagePack, FlatBuffers, custom WebSocket framing) are out of scope until a real perf budget forces the conversation. The schema describes the logical shape; the wire format can evolve underneath later.

## Alternatives Considered

- **Protobuf / FlatBuffers as the source of truth.** Better wire efficiency but worse agent ergonomics and a heavier toolchain. Deferred.
- **TypeScript types only.** Free at design time, but the runtime has no validation and other-language backends would have to re-derive the shape. Rejected — we want one schema both languages and `engine check` consume.
- **One schema file per `kind`.** Cleaner files but more `$ref`/cross-file machinery; for four message kinds the single-file form is easier to load and review. Re-evaluate when the count crosses ~12.
