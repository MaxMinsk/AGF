# ADR-0003: Three.js As MVP Renderer

## Status

Accepted

## Context

The engine needs 3D, basic 2D overlays, shaders and a broad web ecosystem. It also needs to stay code-first and avoid a heavy editor-first dependency.

## Decision

Use Three.js as the MVP renderer adapter.

## Consequences

The engine controls its own scene/prefab/ECS model while reusing a mature web renderer. We must own resource lifecycle, render adapter boundaries, 2D abstractions and performance budgets.

## Alternatives Considered

- Babylon.js: more batteries included, but larger API surface and more competing abstractions.
- PlayCanvas engine: strong ECS reference, but editor/platform assumptions are less text-first.
- PixiJS: excellent for 2D, not sufficient for 3D.

