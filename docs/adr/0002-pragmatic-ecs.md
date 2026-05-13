# ADR-0002: Pragmatic ECS

## Status

Accepted

## Context

The engine needs a world model that is easy for agents to inspect, edit, validate and test. A Unity-like mutable object graph is familiar but tends to hide dependencies in lifecycle hooks and object references.

## Decision

Use a pragmatic ECS: entities are ids, components are schema-backed data, systems operate through typed contexts, and mutations flow through commands.

## Consequences

Scenes and prefabs stay text-friendly. Systems can be unit-tested without the renderer. The first implementation can use simple `Map` storage instead of archetype/chunk storage.

## Alternatives Considered

- Unity-style `GameObject` runtime: familiar but harder to test and hot reload safely.
- Full high-performance archetype ECS: valuable later, too complex for the first vertical slice.
- Event bus as primary architecture: flexible but difficult for agents to trace.

