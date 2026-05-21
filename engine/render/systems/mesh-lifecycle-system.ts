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
export const BATCHABLE: string = "Batchable";

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
    // BatchingSystem (M17-bucketer) owns batched entities; their visual
    // is an InstancedMesh slot, not a per-entity Mesh. Skip them here so
    // the two systems don't double-up. Two signals matter:
    //   1. explicit `Batchable` component — opt-in from the historical
    //      tagged path;
    //   2. `BatchedMeshHandle` set by BatchingSystem after it placed the
    //      entity in a bucket — covers the S50 auto-batch path where the
    //      entity has no Batchable tag.
    const renderable = new Set<EntityId>();
    for (const id of renderableQuery!.run()) {
      if (world.hasComponent(id, BATCHABLE)) continue;
      if (world.hasComponent(id, "BatchedMeshHandle")) continue;
      renderable.add(id);
    }

    // Release departed (also entities that became Batchable since last frame).
    const tracked: EntityId[] = [];
    for (const id of registry.entityIds()) tracked.push(id);
    for (const id of tracked) {
      if (renderable.has(id)) continue;
      registry.release(id);
      if (world.hasComponent(id, RENDER_MESH_HANDLE)) {
        world.removeComponent(id, RENDER_MESH_HANDLE);
      }
    }

    // Acquire newcomers + ensure RENDER_MESH_HANDLE is present.
    //
    // S104 BUG FIX: a `scene.load` command wipes every component,
    // including RENDER_MESH_HANDLE. The registry's per-entity handle
    // table SURVIVES the wipe (it's a renderer-level cache, not a
    // world component). So if the new scene re-creates an entity with
    // the same id, `registry.handleFor(id)` returns the existing
    // handle and the acquire branch was previously skipped — leaving
    // the entity without RENDER_MESH_HANDLE. Downstream systems
    // (MeshTransformSyncSystem, MaterialBindingSystem) query for that
    // component, so the entity's Three.js mesh transform stays frozen
    // at the pre-scene-load value. Now: ensure RENDER_MESH_HANDLE is
    // written every frame for every renderable that has a handle in
    // the registry, whether the handle is fresh or cached.
    for (const id of renderable) {
      let handle = registry.handleFor(id);
      if (handle === undefined) {
        const meshComponent = world.getComponent<MeshRendererComponent>(id, MESH_RENDERER);
        if (meshComponent === undefined) continue;
        handle = registry.acquireFor(id, meshComponent.mesh, meshComponent.color);
        if (handle === undefined) continue;
      }
      const existing = world.getComponent<{ id?: number }>(id, RENDER_MESH_HANDLE);
      if (existing?.id !== handle) {
        world.setComponent(id, RENDER_MESH_HANDLE, { id: handle });
      }
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
