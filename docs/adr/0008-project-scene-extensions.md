# ADR-0008: Project Scene Extensions

## Status

Accepted

## Context

The base scene schema (`schemas/scene.schema.json`) ships with the engine and lists only built-in components — `Camera`, `MeshRenderer`, `Name`, `Networked`, `PlayerControlled`, `Presence`, `Spin`, `Transform`. Real games introduce their own components (Beacon World's `Pickup`, `Carrier`, `Repairable`; future projects will have entirely different vocabularies). We need a way for a project to extend the scene grammar without amending the engine.

A previous iteration put `Pickup`, `Carrier`, `Repairable` directly into the root scene schema and the engine's `componentNames` suggestion list. That was wrong: those types are gameplay-specific to one example and should not live in the engine.

## Decision

Projects extend the scene grammar through a project-local file:

```
examples/<projectId>/schemas/scene-extensions.schema.json
```

Shape:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "<Project> Scene Extensions",
  "components": {
    "<ComponentName>": { "$ref": "#/definitions/<componentName>Component" }
  },
  "definitions": {
    "<componentName>Component": { ... }
  }
}
```

`engine check`:

1. Loads the base scene schema.
2. If `<projectDir>/schemas/scene-extensions.schema.json` exists, deep-merges:
   - `extensions.components` → `entity.properties.components.properties`
   - `extensions.definitions` → top-level `definitions`
3. Compiles the merged schema with AJV and uses it for that project only.
4. Builds the suggestion list as `[...builtIn, ...extensionComponentNames]` so `AGF_SCHEMA_UNKNOWN_PROPERTY` diagnostics on `.components.*` paths point the author at project-recognised names.

Per-project systems live in `examples/<projectId>/src/systems/` and are registered in `src/app.ts` conditionally on `projectId`. `engine/` never imports anything under `examples/`.

## Consequences

- The engine stays generic. New games don't require engine changes.
- `engine check` is no longer cached as a single global compiled scene schema; it caches per `projectDir`. The static `project`/`assetSources`/`material` validators are still global.
- A project's component vocabulary is auditable in one place — its own `scene-extensions.schema.json`.
- Future tooling (inspector overlay, command palette autocomplete) can read the merged schema and learn the full component vocabulary without engine knowledge.
- The extension schema is itself unversioned at v0. If extension shape evolves, add a `$schema`-style version marker before introducing a v1 layout.

## Alternatives Considered

- **One global schema with all known components.** Simple, but couples the engine to every example. Rejected — it's exactly the mistake this ADR fixes.
- **Per-project JSON Schema with no merge — projects ship a full standalone schema.** Possible but duplicates the base grammar across every project and breaks the suggestion list for built-ins. Rejected.
- **Schema-less ECS with a TypeScript-only registry.** Would lose `engine check`'s ability to catch typos in scene JSON. Rejected — schema-first validation is the spine of AGF.
