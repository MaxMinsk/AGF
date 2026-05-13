# ADR-0004: JSON Schemas As Source Of Truth

## Status

Accepted

## Context

Agents are good at editing text files, but runtime failures from malformed scenes are expensive. TypeScript does not validate JSON data at runtime.

## Decision

Use JSON/JSONC project files with JSON Schema validation for scenes, prefabs, materials, shaders and network protocols.

## Consequences

Errors can point to file and JSON path. Project data can be checked before the browser starts. Protocol schemas can become the source for both TypeScript and C# contracts.

## Alternatives Considered

- TypeScript scene files: strongly typed but easier to mix data and behavior.
- Binary editor format: rejected because it is not agent-friendly.
- Zod-only schemas: useful in code, but JSON Schema is more portable across TS/C# tooling.

