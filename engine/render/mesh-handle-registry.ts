// Shared lookup table from EntityId to the adapter's MeshHandle.
// MeshLifecycleSystem (M21-d) owns the lifecycle (acquire / release); the
// other renderer paths (MaterialBindingSystem M21-e, MeshTransformSyncSystem
// M21-f, and during the transition ThreeRenderer itself) read the registry
// to find the handle they should be writing to.

import {
  BoxGeometry,
  CylinderGeometry,
  PlaneGeometry,
  SphereGeometry,
  type BufferGeometry
} from "three";

import type { EntityId } from "../core/ecs/types";
import type { MeshHandle, ThreeRenderAdapter } from "./three-render-adapter";

export type MeshHandleRegistry = {
  /** Acquire a mesh handle for an entity. Idempotent — returns the existing handle when the entity is already known. */
  acquireFor(entityId: EntityId, meshRef: string, color?: string): MeshHandle | undefined;
  /** Release the adapter mesh for an entity, if any. Safe to call on absent entities. */
  release(entityId: EntityId): void;
  /** Look up the handle for an entity. */
  handleFor(entityId: EntityId): MeshHandle | undefined;
  /** Reverse lookup — used by M17-instance-picking to map a Three.js Object3D hit back to the AGF entity. */
  entityForHandle(handle: MeshHandle): EntityId | undefined;
  /** Live snapshot of every entity currently holding a handle. */
  entityIds(): IterableIterator<EntityId>;
  /** Size of the registry, for diagnostics + doctor leak checks. */
  size(): number;
  /** Release everything. Used at renderer dispose. */
  clear(): void;
};

export function createMeshHandleRegistry(adapter: ThreeRenderAdapter): MeshHandleRegistry {
  const entityToHandle = new Map<EntityId, MeshHandle>();
  const handleToEntity = new Map<MeshHandle, EntityId>();

  return {
    acquireFor(entityId, meshRef, color): MeshHandle | undefined {
      const existing = entityToHandle.get(entityId);
      if (existing !== undefined) return existing;
      const geometry = isExternalMeshRef(meshRef)
        ? createPlaceholderGeometry()
        : createPrimitiveGeometry(meshRef);
      if (geometry === undefined) return undefined;
      const acquire: { geometry: BufferGeometry; color?: string } = { geometry };
      if (color !== undefined) acquire.color = color;
      const handle = adapter.acquireMesh(acquire);
      entityToHandle.set(entityId, handle);
      handleToEntity.set(handle, entityId);
      return handle;
    },
    release(entityId): void {
      const handle = entityToHandle.get(entityId);
      if (handle === undefined) return;
      adapter.releaseMesh(handle);
      entityToHandle.delete(entityId);
      handleToEntity.delete(handle);
    },
    handleFor(entityId): MeshHandle | undefined {
      return entityToHandle.get(entityId);
    },
    entityForHandle(handle): EntityId | undefined {
      return handleToEntity.get(handle);
    },
    entityIds(): IterableIterator<EntityId> {
      return entityToHandle.keys();
    },
    size(): number {
      return entityToHandle.size;
    },
    clear(): void {
      handleToEntity.clear();
      for (const handle of entityToHandle.values()) {
        adapter.releaseMesh(handle);
      }
      entityToHandle.clear();
    }
  };
}

export function createPrimitiveGeometry(name: string): BufferGeometry | undefined {
  switch (name) {
    case "box":
      return new BoxGeometry(1, 1, 1);
    case "sphere":
      return new SphereGeometry(0.5, 32, 20);
    case "cylinder":
      return new CylinderGeometry(0.5, 0.5, 1, 24);
    case "plane":
      return new PlaneGeometry(1, 1);
    default:
      return undefined;
  }
}

export function createPlaceholderGeometry(): BufferGeometry {
  // Near-zero box keeps the mesh in the scene graph without flashing a visible
  // placeholder while the real geometry loads asynchronously.
  return new BoxGeometry(0.0001, 0.0001, 0.0001);
}

export function isExternalMeshRef(ref: string): boolean {
  return ref.endsWith(".glb") || ref.endsWith(".gltf");
}
