# Skill: system-authoring

## Trigger

Use when creating or changing gameplay systems — anything that reads or writes ECS state once per fixed step or animation frame.

## Workflow

1. **Grep for an existing primitive first.** `ls engine/core/systems/`, search `schemas/components/`, skim `docs/agent/_audit-*.md`. If `Spin` / `Tween` / `WaypointMover` / `ParticleEmitter` / `CinematicCamera` already covers the behaviour, use it — don't clone. Project-local clones are smell #1 in code review.
2. Identify the component reads + writes the new system needs. Add any project-local component to `examples/<project>/schemas/scene-extensions.schema.json` BEFORE writing the system.
3. Decide `frameUpdate` (rendered-frame cadence) vs `fixedUpdate` (deterministic, 60 Hz default). Physics and replay want `fixedUpdate`.
4. **Cache `world.createQuery([...])` handles.** Raw `world.query()` inside hot paths fails `systems:check` (run in preflight). Cold paths (HMR invalidate, round reset, CLI tools) may use raw `query()` with a `// agf-allow: world.query` marker.
5. Read components via `world.getComponent`, write via `world.setComponent`. Never store Three.js / Rapier objects in components — adapters are stateful but invisible.
6. Register the system from the project's `bootstrap.ts → registerSystems(context)`. Use `context.scheduler.register(createMySystem())`.
7. Add unit tests using a small `new World()` fixture; integration / playtest coverage only when player-visible.
8. Profile-gate the registration when the system shouldn't run in every profile (`static`, `connected`, …).

## System shape

```ts
// examples/<project>/src/systems/my-system.ts
import type { World, QueryHandle } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

export function createMySystem(): System {
  let cachedWorld: World | undefined;
  let query: QueryHandle | undefined;

  return {
    name: "my-system",
    frameUpdate(context: SystemContext): void {
      const { world, time } = context;
      if (world !== cachedWorld) {
        query = world.createQuery(["MyComponent", "Transform"]);
        cachedWorld = world;
      }
      for (const id of query!.run()) {
        const config = world.getComponent<MyComponentData>(id, "MyComponent");
        const transform = world.getComponent<TransformData>(id, "Transform");
        if (config === undefined || transform === undefined) continue;
        // … compute …
        world.setComponent(id, "Transform", { ...transform, position: nextPosition });
      }
    }
  };
}
```

The cached-query pattern: query handles store the matching entity set per component-revision. The first call rebuilds the set; subsequent calls return the cached snapshot until World mutates one of the queried components.

## Engine vs project-local

| Lives in | Rules |
|---|---|
| `engine/core/systems/` | Reusable across every project. No `Three.js`, no DOM, no `examples/*` imports. |
| `engine/render/systems/` | Renderer adapter; reads ECS, may import Three.js. Should still be data-driven. |
| `engine/runtime/` | Bridges (input, network, persistence, dev-bridge). Browser-only allowed. |
| `examples/<project>/src/systems/` | Project-specific gameplay. Owns the project's bespoke components. |

If a project-local system stays generic across two projects, promote it to `engine/core/systems/`. Don't pre-emptively generalise — wait for the second consumer.

## Hard rules

- ECS systems are the default container for new runtime behaviour. Deviation must be documented inline at the site (see `AGENTS.md`).
- Cached `createQuery` handles only; cold-path raw `query()` is marked.
- No per-frame Three.js resource allocation (`new MeshStandardMaterial`, `new BufferGeometry`, …) — reuse scratch buffers.
- Systems should be deterministic for a fixed input and `dt` whenever possible.
- Systems should not own long-lived hidden state unless explicitly modelled as a component or a registered service.
- No raw `addEventListener` on `window` from inside a system's per-frame loop; subscribe once at construction.

## Common pitfalls

- **Scaffolding `GroupRotator` when `Spin` exists.** Grep first.
- **Calling `world.query([...])` inside `frameUpdate` without caching.** ~18,000× slower than a cached handle.
- **Reading the renderer adapter from a gameplay system.** The renderer reads ECS, never the other way round.
- **Allocating per-frame.** A new `Vector3` per entity per frame builds up GC pressure on idle scenes.
- **Storing per-system state on globals.** Use closures (the `let cachedWorld` pattern) or a dedicated component.

## Verification

- Scheduler order test if order matters (rare — most systems are order-independent within a phase).
- Unit test for the deterministic case (set components, run one frame, assert outputs).
- Browser smoke only when the system touches input / rendering / network.
- `npm run typecheck` + `npm run test` + `npm run engine:check -- examples/<project>` before commit.
