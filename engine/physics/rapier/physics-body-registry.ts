// M24-sync: shared `EntityId → BodyHandle` table for the
// PhysicsSyncSystem + future M24-raycast / M24-character. Mirrors
// MeshHandleRegistry / LightHandleRegistry — the system owns
// acquire/release lifecycle, the adapter does the GPU/Rapier work, the
// registry is the lookup layer in between.

import type { EntityId } from "../../core/ecs/types";
import type {
  BodyAcquireSpec,
  BodyHandle,
  ColliderAcquireSpec,
  ColliderHandle,
  RapierAdapter
} from "./rapier-adapter";

export type PhysicsBodyRegistry = {
  acquireFor(entityId: EntityId, spec: BodyAcquireSpec): BodyHandle;
  release(entityId: EntityId): void;
  handleFor(entityId: EntityId): BodyHandle | undefined;
  /** Acquire (or reacquire) the collider for an entity. Releases the previous one if any. */
  setCollider(entityId: EntityId, spec: ColliderAcquireSpec): ColliderHandle | undefined;
  entityIds(): IterableIterator<EntityId>;
  size(): number;
  clear(): void;
};

export function createPhysicsBodyRegistry(adapter: RapierAdapter): PhysicsBodyRegistry {
  const entityToBody = new Map<EntityId, BodyHandle>();
  const entityToCollider = new Map<EntityId, ColliderHandle>();

  return {
    acquireFor(entityId, spec): BodyHandle {
      const existing = entityToBody.get(entityId);
      if (existing !== undefined) return existing;
      const handle = adapter.acquireBody(spec);
      entityToBody.set(entityId, handle);
      return handle;
    },
    release(entityId): void {
      const collider = entityToCollider.get(entityId);
      if (collider !== undefined) {
        // Rapier auto-removes colliders when their body drops; our adapter
        // mirrors that so we just clear our reverse index.
        entityToCollider.delete(entityId);
      }
      const body = entityToBody.get(entityId);
      if (body === undefined) return;
      adapter.releaseBody(body);
      entityToBody.delete(entityId);
    },
    handleFor(entityId): BodyHandle | undefined {
      return entityToBody.get(entityId);
    },
    setCollider(entityId, spec): ColliderHandle | undefined {
      const bodyHandle = entityToBody.get(entityId);
      if (bodyHandle === undefined) return undefined;
      const previous = entityToCollider.get(entityId);
      if (previous !== undefined) adapter.releaseCollider(previous);
      const collider = adapter.acquireCollider(bodyHandle, spec);
      if (collider === undefined) return undefined;
      entityToCollider.set(entityId, collider);
      return collider;
    },
    entityIds(): IterableIterator<EntityId> {
      return entityToBody.keys();
    },
    size(): number {
      return entityToBody.size;
    },
    clear(): void {
      for (const id of [...entityToBody.keys()]) {
        const body = entityToBody.get(id);
        if (body !== undefined) adapter.releaseBody(body);
      }
      entityToBody.clear();
      entityToCollider.clear();
    }
  };
}
