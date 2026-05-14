// M21-d: own the create/destroy lifecycle of renderer mesh handles. Reads
// `MeshRenderer` (presence) and the `MeshRenderer.mesh` + `.color` fields;
// writes `RenderMeshHandle { id: number }` as a renderer-internal component
// so MaterialBindingSystem (M21-e) and MeshTransformSyncSystem (M21-f) can
// look up the handle without re-querying MeshRenderer.
//
// Lifecycle decisions live here; material patches + transform writes stay
// in the next two systems. ThreeRenderer continues to handle async asset
// loads until M21-e ships.

import type { EntityId } from "../../core/ecs/types";
import type { QueryHandle } from "../../core/ecs/world";
import type { World } from "../../core/ecs/world";
import type { System, SystemContext } from "../../core/systems/types";
import type { MeshHandleRegistry } from "../mesh-handle-registry";

export const MESH_RENDERER: string = "MeshRenderer";
export const RENDER_MESH_HANDLE: string = "RenderMeshHandle";

type MeshRendererComponent = {
  mesh: string;
  material?: string;
  color?: string;
};

export type MeshLifecycleSystemHandle = System & {
  /** Tracked entity count — exposed for diagnostics + the doctor leak check. */
  size(): number;
};

/**
 * Build a `frameUpdate` System that diffs the `MeshRenderer` set against
 * the entities currently held in the registry, acquires handles for
 * newcomers, releases handles for departures, and writes the
 * `RenderMeshHandle` component as a side effect. The component is keyed
 * by the same numeric handle the registry hands out, so downstream
 * readers can `world.getComponent("RenderMeshHandle")` and pipe straight
 * into the adapter without a second registry lookup.
 */
export function createMeshLifecycleSystem(
  registry: MeshHandleRegistry,
  options: { name?: string } = {}
): MeshLifecycleSystemHandle {
  const name = options.name ?? "render.mesh-lifecycle";
  let cachedWorld: World | undefined;
  let renderableQuery: QueryHandle | undefined;

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      renderableQuery = world.createQuery([MESH_RENDERER]);
      cachedWorld = world;
    }
    const renderable = new Set(renderableQuery!.run());

    // Release departed.
    const tracked: EntityId[] = [];
    for (const id of registry.entityIds()) tracked.push(id);
    for (const id of tracked) {
      if (renderable.has(id)) continue;
      registry.release(id);
      if (world.hasComponent(id, RENDER_MESH_HANDLE)) {
        world.removeComponent(id, RENDER_MESH_HANDLE);
      }
    }

    // Acquire newcomers.
    for (const id of renderable) {
      if (registry.handleFor(id) !== undefined) continue;
      const meshComponent = world.getComponent<MeshRendererComponent>(id, MESH_RENDERER);
      if (meshComponent === undefined) continue;
      const handle = registry.acquireFor(id, meshComponent.mesh, meshComponent.color);
      if (handle === undefined) continue;
      world.setComponent(id, RENDER_MESH_HANDLE, { id: handle });
    }
  };

  return {
    name,
    frameUpdate,
    size(): number {
      return registry.size();
    }
  };
}
