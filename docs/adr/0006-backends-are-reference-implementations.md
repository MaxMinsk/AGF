# ADR-0006: Backends Are Reference Implementations

## Status

Accepted

## Context

AGF needs persistent shared-world multiplayer, but the engine should remain a web game framework rather than a full-stack platform. The first reference backend may be C#/.NET, but users should be able to connect a Node.js server or another backend implementation.

## Decision

Keep backend implementations outside the engine core. Define protocol schemas, world snapshots and interaction contracts as backend-agnostic engine outputs. Place reference backend projects under `examples/backends/`.

## Consequences

AGF stays focused on the browser runtime, project data, validation, tooling and playtests. Backend examples can evolve independently. Any C# implementation must prove the contracts are usable, not become a required dependency.

## Alternatives Considered

- Bundling a C# backend as part of the engine: rejected because it makes AGF look like a full-stack framework and narrows adoption.
- Ignoring backend concerns entirely: rejected because persistent shared worlds need protocol and world-state seams from the start.
- Building Node.js first: viable later, but C# remains a useful reference for the current developer workflow.
