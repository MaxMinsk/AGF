// Shared lookup from EntityId → adapter LightHandle, mirroring
// `MeshHandleRegistry`. LightLifecycleSystem owns the lifecycle; future
// LightSyncSystem reads handles to push transforms / param patches.

import type { EntityId } from "../core/ecs/types";
import type { LightAcquireSpec, LightHandle, ThreeRenderAdapter } from "./three-render-adapter";

export type LightHandleRegistry = {
  acquireFor(entityId: EntityId, spec: LightAcquireSpec): LightHandle;
  release(entityId: EntityId): void;
  handleFor(entityId: EntityId): LightHandle | undefined;
  entityIds(): IterableIterator<EntityId>;
  size(): number;
  clear(): void;
};

export function createLightHandleRegistry(adapter: ThreeRenderAdapter): LightHandleRegistry {
  const entityToHandle = new Map<EntityId, LightHandle>();
  return {
    acquireFor(entityId, spec): LightHandle {
      const existing = entityToHandle.get(entityId);
      if (existing !== undefined) return existing;
      const handle = adapter.acquireLight(spec);
      entityToHandle.set(entityId, handle);
      return handle;
    },
    release(entityId): void {
      const handle = entityToHandle.get(entityId);
      if (handle === undefined) return;
      adapter.releaseLight(handle);
      entityToHandle.delete(entityId);
    },
    handleFor(entityId): LightHandle | undefined {
      return entityToHandle.get(entityId);
    },
    entityIds(): IterableIterator<EntityId> {
      return entityToHandle.keys();
    },
    size(): number {
      return entityToHandle.size;
    },
    clear(): void {
      for (const handle of entityToHandle.values()) {
        adapter.releaseLight(handle);
      }
      entityToHandle.clear();
    }
  };
}
