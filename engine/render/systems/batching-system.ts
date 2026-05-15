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
  BatchedBucketHandle,
  BatchedGeometryId,
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
// BatchedMesh caps — BatchedMesh allocates its rings up-front and we
// don't resize today, so pad these generously. Sized for the
// batch-bench "mixed primitives" scenario (≤4 distinct geometries per
// bucket, ≤512 instances per bucket).
const BATCHED_MAX_INSTANCES = 512;
const BATCHED_MAX_VERTICES = 16_384;
const BATCHED_MAX_INDICES = 32_768;

type BatchableComponent = {
  group?: string;
  /**
   * "instanced" = one InstancedMesh per (mesh + material + shadow + group).
   * "batched"   = one BatchedMesh per (material + shadow + group); mesh
   *               varies and is stored per-instance as a BatchedGeometryId.
   * Default "instanced".
   */
  path?: "instanced" | "batched";
};
type MeshRendererComponent = { mesh: string; color?: string; material?: string };
type ShadowFlagsComponent = { cast?: boolean; receive?: boolean };
type LocalToWorldComponent = {
  position: ReadonlyArray<number>;
  rotation: ReadonlyArray<number>;
  scale: ReadonlyArray<number>;
};
type BatchedMeshHandleComponent = { bucket: BucketHandle; instance: InstanceIndex };

type InstancedRecord = {
  path: "instanced";
  handle: BucketHandle;
  bucketKey: string;
  mesh: string;
  color: string | undefined;
  shadowCast: boolean;
  shadowReceive: boolean;
  members: Map<EntityId, InstanceIndex>;
};

type BatchedRecord = {
  path: "batched";
  handle: BatchedBucketHandle;
  bucketKey: string;
  color: string | undefined;
  shadowCast: boolean;
  shadowReceive: boolean;
  /** mesh-ref → adapter geometry id (added at most once per mesh per bucket). */
  geometries: Map<string, BatchedGeometryId>;
  /** entity id → { meshRef, instance index in BatchedMesh } so the system can
   *  reassign the geometry when an entity's mesh changes without dropping the bucket. */
  members: Map<EntityId, { mesh: string; instance: InstanceIndex }>;
};

type BucketRecord = InstancedRecord | BatchedRecord;

export type BatchingDeps = {
  adapter: ThreeRenderAdapter;
  diagnostics?: DiagnosticsBus | undefined;
};

export type BatchingSystemHandle = System & {
  bucketCount(): number;
  totalInstances(): number;
};

export type BatchingOptions = {
  name?: string;
  /**
   * S50 auto-batch: when true, every entity with a built-in primitive
   * mesh (box / sphere / plane) is implicitly treated as Batchable
   * even without a `Batchable` component. The opt-out for individual
   * entities is `Batchable: { enabled: false }`. GLB / external meshes,
   * material-manifest meshes, LOD entities and explicitly-disabled
   * entities are skipped regardless.
   *
   * Default false to preserve historical behaviour. shadows-bench
   * flips it on via `project.json#render.batching.auto: true`.
   */
  autoIncludePrimitives?: boolean;
};

export function createBatchingSystem(
  deps: BatchingDeps,
  options: BatchingOptions = {}
): BatchingSystemHandle {
  const name = options.name ?? "render.batching";
  const autoIncludePrimitives = options.autoIncludePrimitives === true;
  // Built-in primitive set must mirror `createPrimitiveGeometry` in
  // mesh-handle-registry.ts. The auto-batch path falls back to single-
  // Mesh rendering for any mesh that isn't a primitive.
  const PRIMITIVE_MESHES = new Set(["box", "sphere", "plane"]);
  let cachedWorld: World | undefined;
  let batchableQuery: QueryHandle | undefined;
  const bucketsByKey = new Map<string, BucketRecord>();
  const memberToBucket = new Map<EntityId, BucketRecord>();
  const warnedKeys = new Set<string>();

  const releaseBucket = (record: BucketRecord): void => {
    if (record.path === "instanced") {
      deps.adapter.releaseBucket(record.handle);
    } else {
      deps.adapter.releaseBatchedBucket(record.handle);
    }
  };

  const releaseEntity = (world: World, entityId: EntityId): void => {
    const record = memberToBucket.get(entityId);
    if (record === undefined) return;
    if (record.path === "instanced") {
      const instance = record.members.get(entityId);
      if (instance !== undefined) {
        deps.adapter.removeBucketInstance(record.handle, instance);
      }
      record.members.delete(entityId);
    } else {
      const entry = record.members.get(entityId);
      if (entry !== undefined) {
        deps.adapter.removeBatchedInstance(record.handle, entry.instance);
      }
      record.members.delete(entityId);
    }
    memberToBucket.delete(entityId);
    if (world.hasComponent(entityId, BATCHED_MESH_HANDLE)) {
      world.removeComponent(entityId, BATCHED_MESH_HANDLE);
    }
    if (record.members.size === 0) {
      releaseBucket(record);
      bucketsByKey.delete(record.bucketKey);
    }
  };

  const updateInstanced = (
    world: World,
    entityId: EntityId,
    renderer: MeshRendererComponent,
    batchable: BatchableComponent | undefined,
    cast: boolean,
    receive: boolean
  ): void => {
    // M17-batchable-color-variants (S50): bucket key intentionally omits
    // `renderer.color` so entities with different colours share a
    // bucket. Per-instance colour is stamped via
    // `adapter.setBucketInstanceColor` below; the bucket is allocated
    // with `useInstanceColor: true` so the InstancedMesh carries the
    // instanceColor attribute from compile time.
    const bucketKey = `instanced|${renderer.mesh}|${cast ? "1" : "0"}:${receive ? "1" : "0"}|${batchable?.group ?? ""}`;
    let record = bucketsByKey.get(bucketKey) as InstancedRecord | undefined;
    if (record === undefined) {
      const geometry = createPrimitiveGeometry(renderer.mesh) ?? createPlaceholderGeometry();
      const handle = deps.adapter.acquireBucket({
        geometry,
        capacity: DEFAULT_BUCKET_CAPACITY,
        useInstanceColor: true,
        castShadow: cast,
        receiveShadow: receive
      });
      record = {
        path: "instanced",
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
          return;
        }
        deps.adapter.resizeBucket(record.handle, newCapacity);
      }
      const allocated = deps.adapter.addBucketInstance(record.handle);
      if (allocated === undefined) return;
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
    // Stamp per-instance colour. Falls back to white when the renderer
    // didn't declare one (matches the pre-S50 default-color behaviour).
    deps.adapter.setBucketInstanceColor(record.handle, instance, renderer.color ?? "#ffffff");
  };

  const updateBatched = (
    world: World,
    entityId: EntityId,
    renderer: MeshRendererComponent,
    batchable: BatchableComponent | undefined,
    cast: boolean,
    receive: boolean
  ): void => {
    // BatchedMesh bucket key omits mesh — varied-geometry, shared-material.
    const bucketKey = `batched|${renderer.color ?? ""}|${cast ? "1" : "0"}:${receive ? "1" : "0"}|${batchable?.group ?? ""}`;
    let record = bucketsByKey.get(bucketKey) as BatchedRecord | undefined;
    if (record === undefined) {
      const handle = deps.adapter.acquireBatchedBucket({
        maxInstances: BATCHED_MAX_INSTANCES,
        maxVertices: BATCHED_MAX_VERTICES,
        maxIndices: BATCHED_MAX_INDICES,
        ...(renderer.color !== undefined ? { color: renderer.color } : {}),
        castShadow: cast,
        receiveShadow: receive
      });
      record = {
        path: "batched",
        handle,
        bucketKey,
        color: renderer.color,
        shadowCast: cast,
        shadowReceive: receive,
        geometries: new Map(),
        members: new Map()
      };
      bucketsByKey.set(bucketKey, record);
    }
    // If the entity hopped to a different bucket (path / colour / shadow
    // flags changed), drop the old slot first.
    const previousRecord = memberToBucket.get(entityId);
    if (previousRecord !== undefined && previousRecord !== record) {
      releaseEntity(world, entityId);
    }
    // Ensure the geometry for this mesh-ref has been registered.
    let geometryId = record.geometries.get(renderer.mesh);
    if (geometryId === undefined) {
      const geometry = createPrimitiveGeometry(renderer.mesh) ?? createPlaceholderGeometry();
      const allocated = deps.adapter.addBatchedGeometry(record.handle, geometry);
      if (allocated === undefined) {
        if (!warnedKeys.has(record.bucketKey)) {
          warnedKeys.add(record.bucketKey);
          deps.diagnostics?.emit({
            severity: "warning",
            code: "AGF_BATCH_OVERFLOW",
            source: "batching",
            message: `BatchedMesh bucket "${record.bucketKey}" rejected geometry "${renderer.mesh}" — vertex/index ring exhausted.`
          });
        }
        return;
      }
      geometryId = allocated;
      record.geometries.set(renderer.mesh, geometryId);
    }
    let entry = record.members.get(entityId);
    if (entry === undefined) {
      if (deps.adapter.batchedBucketLiveCount(record.handle) >= BATCHED_MAX_INSTANCES) {
        if (!warnedKeys.has(record.bucketKey)) {
          warnedKeys.add(record.bucketKey);
          deps.diagnostics?.emit({
            severity: "warning",
            code: "AGF_BATCH_OVERFLOW",
            source: "batching",
            message: `BatchedMesh bucket "${record.bucketKey}" reached the ${BATCHED_MAX_INSTANCES} instance cap; further instances skipped.`
          });
        }
        return;
      }
      const allocated = deps.adapter.addBatchedInstance(record.handle, geometryId);
      if (allocated === undefined) return;
      entry = { mesh: renderer.mesh, instance: allocated };
      record.members.set(entityId, entry);
      memberToBucket.set(entityId, record);
      world.setComponent(entityId, BATCHED_MESH_HANDLE, { bucket: record.handle, instance: allocated });
    } else if (entry.mesh !== renderer.mesh) {
      // Same bucket, but the entity's mesh-ref changed. Reassign the
      // instance to the new geometry id without dropping the slot.
      deps.adapter.setBatchedInstanceGeometry(record.handle, entry.instance, geometryId);
      entry.mesh = renderer.mesh;
    }
    const ltw = world.getComponent<LocalToWorldComponent>(entityId, LOCAL_TO_WORLD);
    if (ltw !== undefined) {
      deps.adapter.setBatchedInstanceTransform(record.handle, entry.instance, {
        position: [ltw.position[0] ?? 0, ltw.position[1] ?? 0, ltw.position[2] ?? 0],
        rotation: [ltw.rotation[0] ?? 0, ltw.rotation[1] ?? 0, ltw.rotation[2] ?? 0],
        scale: [ltw.scale[0] ?? 1, ltw.scale[1] ?? 1, ltw.scale[2] ?? 1]
      });
    }
  };

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      // S50: when auto-include is on, the candidate set is every entity
      // with a MeshRenderer; the per-entity filter below decides which
      // ones actually get batched. Otherwise we keep the historical
      // explicit-Batchable contract.
      batchableQuery = autoIncludePrimitives
        ? world.createQuery([MESH_RENDERER])
        : world.createQuery([BATCHABLE, MESH_RENDERER]);
      cachedWorld = world;
      // World swap (HMR / scene change). Drop in-flight state; the adapter
      // dispose path or the new frame will rebuild.
      for (const record of bucketsByKey.values()) {
        releaseBucket(record);
      }
      bucketsByKey.clear();
      memberToBucket.clear();
      warnedKeys.clear();
    }

    const currentBatchable = new Set<EntityId>(batchableQuery!.run());

    for (const entityId of [...memberToBucket.keys()]) {
      if (!currentBatchable.has(entityId)) {
        releaseEntity(world, entityId);
      }
    }

    for (const entityId of currentBatchable) {
      const renderer = world.getComponent<MeshRendererComponent>(entityId, MESH_RENDERER);
      if (renderer === undefined) continue;
      const batchable = world.getComponent<BatchableComponent>(entityId, BATCHABLE);
      // Explicit opt-out: `Batchable: { enabled: false }` keeps the
      // entity on the single-Mesh path even when auto-batch is on.
      if (batchable !== undefined && (batchable as { enabled?: boolean }).enabled === false) {
        releaseEntity(world, entityId);
        continue;
      }
      // Auto-batch mode only batches primitive meshes — anything that
      // resolves to a glb / manifest / LOD chain falls back to the
      // single-Mesh path.
      if (autoIncludePrimitives && batchable === undefined) {
        if (!PRIMITIVE_MESHES.has(renderer.mesh)) {
          releaseEntity(world, entityId);
          continue;
        }
        if (world.hasComponent(entityId, "LOD")) {
          releaseEntity(world, entityId);
          continue;
        }
      }
      if (isExternalMeshRef(renderer.mesh)) {
        // GLB mesh batching is deferred — async geometry loading still
        // belongs to MeshLifecycle until M25 ASSET-compression lands.
        releaseEntity(world, entityId);
        continue;
      }
      if (renderer.material !== undefined) {
        // Manifest path is M17-mat; for now exclude manifest-coloured meshes.
        releaseEntity(world, entityId);
        continue;
      }
      const flags = world.getComponent<ShadowFlagsComponent>(entityId, SHADOW_FLAGS);
      const cast = flags?.cast !== false;
      const receive = flags?.receive !== false;
      const path: "instanced" | "batched" = batchable?.path ?? "instanced";
      if (path === "batched") {
        updateBatched(world, entityId, renderer, batchable, cast, receive);
      } else {
        updateInstanced(world, entityId, renderer, batchable, cast, receive);
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
