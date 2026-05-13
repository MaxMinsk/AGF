# ADR-0005: Command Pipeline For Runtime Mutations

## Status

Accepted

## Context

Hot reload, inspector edits, playtests and multiplayer all need observable mutations. Direct mutation makes replay, diagnostics and network sync harder.

## Decision

All meaningful world mutations flow through explicit commands such as `entity.create`, `entity.delete`, `component.set` and `scene.load`.

## Consequences

Runtime changes can be logged, replayed, tested and generated from scene diffs. Systems become easier to reason about. Some simple operations require slightly more ceremony, which is acceptable for traceability.

## Alternatives Considered

- Direct component mutation everywhere: simple but opaque.
- Event bus for mutations: flexible but too easy to lose causality.
- Immutable world replacement only: clean but costly and awkward for renderer/physics adapters.

