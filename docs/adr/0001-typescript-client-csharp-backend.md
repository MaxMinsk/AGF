# ADR-0001: TypeScript Client And Backend-Agnostic Server Contracts

## Status

Accepted

## Context

The browser runtime needs direct access to web APIs, Three.js, Vite HMR, Playwright-driven inspection and fast iteration. At the same time, persistent-world multiplayer should not force one backend technology. C#/.NET is attractive as a reference implementation, but Node.js or another server should also be possible.

## Decision

Use TypeScript for the browser runtime and game authoring API. Define backend-agnostic protocol/world contracts. Keep backend implementations outside the engine core as reference integrations.

## Consequences

Client iteration stays light and web-native. Multiplayer can use C# without pushing .NET WebAssembly into the browser bundle, while still allowing Node.js or other servers. Shared network contracts must be generated or validated from a single schema source.

## Alternatives Considered

- C# in browser via WebAssembly: rejected for MVP because it adds runtime weight and JS interop complexity.
- TypeScript everywhere including backend: viable as a reference backend, but not required for the engine.
- Rust/WASM shared core: powerful but adds a third language too early.
