# Glossary

- **Agent-first:** Designed so an AI coding agent can inspect, edit, validate, run and test the game through text files and tools.
- **Entity:** Stable id for an object in the world. It has no behavior by itself.
- **Component:** JSON-serializable data attached to an entity, such as `Transform`, `Health` or `MeshRenderer`.
- **System:** Logic that reads/writes component data through a typed context.
- **Pragmatic ECS:** Simple ECS focused on clarity, validation and tests before high-performance storage.
- **Command:** Explicit mutation request, such as `component.set`, `entity.create` or `scene.load`.
- **Command log:** Ordered list of applied commands for debugging, replay and agent inspection.
- **Scene:** JSON file describing entities and component data.
- **Prefab:** Reusable entity or entity group template.
- **Normalized scene:** Validated, resolved scene data after prefab expansion and defaults.
- **Adapter:** Boundary that translates ECS state to external systems: renderer, physics, audio or network.
- **Profile:** Deployment/runtime mode such as `static`, `connected` or `authoritative`.
- **World snapshot:** Serializable representation of relevant world state for tests, inspector and network sync.
- **Authoritative server:** Server that owns important gameplay state and validates client input.
- **Prediction:** Client-side temporary simulation used to hide network latency.
- **Reconciliation:** Client correction after receiving authoritative server state.

