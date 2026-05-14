// M17-bucketer: collapse entities tagged `Batchable` (sharing mesh +
// material + shadow flags + optional group hint) into a single
// `InstancedMesh` per bucket. Each entity gets a `BatchedMeshHandle`
// component pointing at `(bucketHandle, instanceIndex)`. Downstream
// renderer systems skip these entities — the bucket draws everything in
// one call.
//
// First-cut policy:
//   - Primitive geometries only (box / sphere / plane). External .glb
//     refs are deferred to M17-batched-mesh (loader needs to land first).
//   - Inline-color path only (no material manifest). Manifests are M17-mat
//     followup; the bucket would need a separate "apply manifest patch"
//     pass that knows when to share vs split.
//   - Capacity grows lazily via `adapter.resizeBucket`. Caps at 1024 per
//     bucket; exceeding emits a doctor recommendation (M17-doctor caught
//     this at static-analysis time anyway).
//
// Lifecycle:
//   - Acquire bucket on first entity → adapter.acquireBucket.
//   - addInstance + write BatchedMeshHandle { bucket, instance }.
//   - On Transform change: setBucketInstanceTransform.
//   - On Batchable removed / MeshRenderer removed: removeInstance + drop
//     handle.
//   - When bucket goes to 0 live slots → releaseBucket.

import type { ComponentName, EntityId } from "../../core/ecs/types";
import type { QueryHandle, World } from "../../core/ecs/world";
import type { System, SystemContext } from "../../core/systems/types";
import type { DiagnosticsBus } from "../../runtime/diagnostics/diagnostics-bus";
import {
  createPlaceholderGeometry,
  createPrimitiveGeometry,
  isExternalMeshRef
} from "../mesh-handle-registry";
import type {
  BucketHandle,
  InstanceIndex,
  ThreeRenderAdapter
} from "../three-render-adapter";

export const BATCHABLE: ComponentName = "Batchable";
export const MESH_RENDERER: ComponentName = "MeshRenderer";
export const SHADOW_FLAGS: ComponentName = "ShadowFlags";
export const LOCAL_TO_WORLD: ComponentName = "LocalToWorld";
export const BATCHED_MESH_HANDLE: ComponentName = "BatchedMeshHandle";

const DEFAULT_BUCKET_CAPACITY = 32;
const MAX_BUCKET_CAPACITY = 1024;

type BatchableComponent = { group?: string };
type MeshRendererComponent = { mesh: string; color?: string; material?: string };
type ShadowFlagsComponent = { cast?: boolean; receive?: boolean };
type LocalToWorldComponent = {
  position: ReadonlyArray<number>;
  rotation: ReadonlyArray<number>;
  scale: ReadonlyArray<number>;
};
type BatchedMeshHandleComponent = { bucket: BucketHandle; instance: InstanceIndex };

type BucketRecord = {
  handle: BucketHandle;
  bucketKey: string;
  mesh: string;
  color: string | undefined;
  shadowCast: boolean;
  shadowReceive: boolean;
  members: Map<EntityId, InstanceIndex>;
};

export type BatchingDeps = {
  adapter: ThreeRenderAdapter;
  diagnostics?: DiagnosticsBus | undefined;
};

export type BatchingSystemHandle = System & {
  bucketCount(): number;
  totalInstances(): number;
};

export function createBatchingSystem(
  deps: BatchingDeps,
  options: { name?: string } = {}
): BatchingSystemHandle {
  const name = options.name ?? "render.batching";
  let cachedWorld: World | undefined;
  let batchableQuery: QueryHandle | undefined;
  const bucketsByKey = new Map<string, BucketRecord>();
  const memberToBucket = new Map<EntityId, BucketRecord>();
  const warnedKeys = new Set<string>();

  const releaseEntity = (world: World, entityId: EntityId): void => {
    const record = memberToBucket.get(entityId);
    if (record === undefined) return;
    const instance = record.members.get(entityId);
    if (instance !== undefined) {
      deps.adapter.removeBucketInstance(record.handle, instance);
    }
    record.members.delete(entityId);
    memberToBucket.delete(entityId);
    if (world.hasComponent(entityId, BATCHED_MESH_HANDLE)) {
      world.removeComponent(entityId, BATCHED_MESH_HANDLE);
    }
    if (record.members.size === 0) {
      deps.adapter.releaseBucket(record.handle);
      bucketsByKey.delete(record.bucketKey);
    }
  };

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      batchableQuery = world.createQuery([BATCHABLE, MESH_RENDERER]);
      cachedWorld = world;
      // World swap (HMR / scene change). Drop in-flight state; the adapter
      // dispose path or the new frame will rebuild.
      for (const record of bucketsByKey.values()) {
        deps.adapter.releaseBucket(record.handle);
      }
      bucketsByKey.clear();
      memberToBucket.clear();
      warnedKeys.clear();
    }

    const currentBatchable = new Set<EntityId>(batchableQuery!.run());

    // Release members that left the Batchable + MeshRenderer set.
    for (const entityId of [...memberToBucket.keys()]) {
      if (!currentBatchable.has(entityId)) {
        releaseEntity(world, entityId);
      }
    }

    for (const entityId of currentBatchable) {
      const renderer = world.getComponent<MeshRendererComponent>(entityId, MESH_RENDERER);
      if (renderer === undefined) continue;
      if (isExternalMeshRef(renderer.mesh)) {
        // GLB mesh batching is deferred to M17-batched-mesh (needs async geometry).
        releaseEntity(world, entityId);
        continue;
      }
      if (renderer.material !== undefined) {
        // Manifest path is M17-mat; for now exclude manifest-coloured meshes.
        releaseEntity(world, entityId);
        continue;
      }
      const batchable = world.getComponent<BatchableComponent>(entityId, BATCHABLE);
      const flags = world.getComponent<ShadowFlagsComponent>(entityId, SHADOW_FLAGS);
      const cast = flags?.cast !== false;
      const receive = flags?.receive !== false;
      const bucketKey = `${renderer.mesh}|${renderer.color ?? ""}|${cast ? "1" : "0"}:${receive ? "1" : "0"}|${batchable?.group ?? ""}`;

      let record = bucketsByKey.get(bucketKey);
      if (record === undefined) {
        const geometry = createPrimitiveGeometry(renderer.mesh) ?? createPlaceholderGeometry();
        const handle = deps.adapter.acquireBucket({
          geometry,
          capacity: DEFAULT_BUCKET_CAPACITY,
          ...(renderer.color !== undefined ? { color: renderer.color } : {}),
          castShadow: cast,
          receiveShadow: receive
        });
        record = {
          handle,
          bucketKey,
          mesh: renderer.mesh,
          color: renderer.color,
          shadowCast: cast,
          shadowReceive: receive,
          members: new Map()
        };
        bucketsByKey.set(bucketKey, record);
      }

      // If the entity moved buckets (e.g. mesh changed), drop from the old.
      const previousRecord = memberToBucket.get(entityId);
      if (previousRecord !== undefined && previousRecord !== record) {
        releaseEntity(world, entityId);
      }

      let instance = record.members.get(entityId);
      if (instance === undefined) {
        const currentLive = deps.adapter.bucketLiveCount(record.handle);
        const capacity = deps.adapter.bucketCapacity(record.handle);
        if (currentLive >= capacity) {
          const newCapacity = Math.min(MAX_BUCKET_CAPACITY, Math.max(capacity * 2, currentLive + 8));
          if (newCapacity <= capacity) {
            if (!warnedKeys.has(record.bucketKey)) {
              warnedKeys.add(record.bucketKey);
              deps.diagnostics?.emit({
                severity: "warning",
                code: "AGF_BATCH_OVERFLOW",
                source: "batching",
                message: `Bucket for "${record.bucketKey}" exceeded max capacity ${MAX_BUCKET_CAPACITY}; further instances skipped.`
              });
            }
            continue;
          }
          deps.adapter.resizeBucket(record.handle, newCapacity);
        }
        const allocated = deps.adapter.addBucketInstance(record.handle);
        if (allocated === undefined) continue;
        instance = allocated;
        record.members.set(entityId, instance);
        memberToBucket.set(entityId, record);
        world.setComponent(entityId, BATCHED_MESH_HANDLE, { bucket: record.handle, instance });
      }

      const ltw = world.getComponent<LocalToWorldComponent>(entityId, LOCAL_TO_WORLD);
      if (ltw !== undefined) {
        deps.adapter.setBucketInstanceTransform(record.handle, instance, {
          position: [ltw.position[0] ?? 0, ltw.position[1] ?? 0, ltw.position[2] ?? 0],
          rotation: [ltw.rotation[0] ?? 0, ltw.rotation[1] ?? 0, ltw.rotation[2] ?? 0],
          scale: [ltw.scale[0] ?? 1, ltw.scale[1] ?? 1, ltw.scale[2] ?? 1]
        });
      }
    }
  };

  return {
    name,
    frameUpdate,
    bucketCount(): number {
      return bucketsByKey.size;
    },
    totalInstances(): number {
      let total = 0;
      for (const record of bucketsByKey.values()) total += record.members.size;
      return total;
    }
  };
}

export function batchedEntities(world: World): Set<EntityId> {
  const set = new Set<EntityId>();
  // agf-allow: world.query — helper used by tests + doctor diagnostics, not per-frame.
  for (const id of world.query([BATCHED_MESH_HANDLE])) {
    set.add(id);
  }
  return set;
}
