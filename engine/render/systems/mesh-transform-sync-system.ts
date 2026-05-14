// M21-f: push world-transforms from `LocalToWorld` (M21-b) onto the
// adapter mesh associated with each `RenderMeshHandle` (M21-d). This is
// the per-frame hottest path of the renderer — every visible entity pays
// one `adapter.setMeshTransform` call per frame. M17 batching will
// replace this for batched entities; un-batched ones keep coming through
// this system.

import type { ComponentName, EntityId } from "../../core/ecs/types";
import type { QueryHandle, World } from "../../core/ecs/world";
import type { System, SystemContext } from "../../core/systems/types";
import type { MeshHandleRegistry } from "../mesh-handle-registry";
import type { ThreeRenderAdapter } from "../three-render-adapter";

export const LOCAL_TO_WORLD: ComponentName = "LocalToWorld";
export const RENDER_MESH_HANDLE: ComponentName = "RenderMeshHandle";

type LocalToWorldComponent = {
  position: ReadonlyArray<number>;
  rotation: ReadonlyArray<number>;
  scale: ReadonlyArray<number>;
};

export type MeshTransformSyncDeps = {
  adapter: ThreeRenderAdapter;
  registry: MeshHandleRegistry;
};

export function createMeshTransformSyncSystem(
  deps: MeshTransformSyncDeps,
  options: { name?: string } = {}
): System {
  const name = options.name ?? "render.mesh-transform-sync";
  let cachedWorld: World | undefined;
  let renderableQuery: QueryHandle | undefined;

  return {
    name,
    frameUpdate(context: SystemContext): void {
      const world = context.world;
      if (world !== cachedWorld) {
        renderableQuery = world.createQuery([RENDER_MESH_HANDLE, LOCAL_TO_WORLD]);
        cachedWorld = world;
      }
      const entities = renderableQuery!.run();
      for (const id of entities) {
        const handle = deps.registry.handleFor(id);
        if (handle === undefined) continue;
        const ltw = world.getComponent<LocalToWorldComponent>(id, LOCAL_TO_WORLD);
        if (ltw === undefined) continue;
        deps.adapter.setMeshTransform(handle, {
          position: pad3(ltw.position),
          rotation: pad3(ltw.rotation),
          scale: pad3(ltw.scale, 1)
        });
      }
    }
  };
}

function pad3(value: ReadonlyArray<number>, fill = 0): readonly [number, number, number] {
  return [value[0] ?? fill, value[1] ?? fill, value[2] ?? fill];
}

export type { EntityId };
