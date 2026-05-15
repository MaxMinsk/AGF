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
import { bucketSpecHash, type BucketSpec } from "../bucket-spec";
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
  /**
   * S50 perf: cached `[px,py,pz,rx,ry,rz,sx,sy,sz]` of the last
   * LocalToWorld we wrote per instance. Skips the
   * `setBucketInstanceTransform` (and therefore `instanceMatrix.needsUpdate`)
   * when the LTW is bit-identical — static entities don't force GPU
   * matrix re-uploads every frame.
   */
  lastWorld: Map<EntityId, [number, number, number, number, number, number, number, number, number]>;
  /** Cache of last-written colours so we skip re-stamping unchanged. */
  lastColor: Map<EntityId, string>;
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
  /**
   * S50 GLB + manifest batching: when provided, BatchingSystem
   * eagerly fetches loaded glb geometries + texture-less standard
   * material manifests so multiple entities sharing the same mesh-ref
   * / manifest collapse into one InstancedMesh bucket. Loading is
   * async; entities stay on the single-Mesh fallback until the cache
   * resolves.
   */
  assetRegistry?: import("../../runtime/asset-registry").AssetRegistry;
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
  /**
   * S51 project-wide bucket path default. Entities can still override
   * per-Batchable via `Batchable: { path: "batched" }`. Setting this
   * to "batched" routes every auto-batched primitive through
   * `BatchedMesh` (per-instance frustum culling on, vertex shader
   * skipped for off-screen instances). Default "instanced".
   */
  defaultPath?: "instanced" | "batched";
};

export function createBatchingSystem(
  deps: BatchingDeps,
  options: BatchingOptions = {}
): BatchingSystemHandle {
  const name = options.name ?? "render.batching";
  const autoIncludePrimitives = options.autoIncludePrimitives === true;
  const defaultPath: "instanced" | "batched" = options.defaultPath ?? "instanced";
  // Built-in primitive set must mirror `createPrimitiveGeometry` in
  // mesh-handle-registry.ts. The auto-batch path falls back to single-
  // Mesh rendering for any mesh that isn't a primitive.
  const PRIMITIVE_MESHES = new Set(["box", "sphere", "plane"]);
  let cachedWorld: World | undefined;
  let batchableQuery: QueryHandle | undefined;
  const bucketsByKey = new Map<string, BucketRecord>();
  const memberToBucket = new Map<EntityId, BucketRecord>();
  const warnedKeys = new Set<string>();

  // S50 GLB batching: shared per-meshRef geometry cache. Each value is
  // a clone of the GLB's first mesh geometry — buckets keep this clone
  // for the lifetime of the bucket. "pending" prevents redundant
  // re-fetches; "failed" stays as a permanent skip so the entity falls
  // back to single-Mesh rendering forever.
  type GeometrySlot = { kind: "ready"; geometry: import("three").BufferGeometry } | { kind: "pending" | "failed" };
  const geometryCache = new Map<string, GeometrySlot>();

  // S50 manifest batching: texture-less standard manifests collapse
  // into a single bucket per (roughness, metalness, emissive) profile.
  // Color goes per-instance via instanceColor. Anything with texture
  // refs or non-standard shader stays on the single-Mesh path.
  type ManifestSlot =
    | { kind: "ready"; profileKey: string; color: string }
    | { kind: "pending" | "skip" };
  const manifestCache = new Map<string, ManifestSlot>();

  function loadGeometry(meshRef: string): GeometrySlot {
    const cached = geometryCache.get(meshRef);
    if (cached !== undefined) return cached;
    if (deps.assetRegistry === undefined) {
      geometryCache.set(meshRef, { kind: "failed" });
      return { kind: "failed" };
    }
    const pending: GeometrySlot = { kind: "pending" };
    geometryCache.set(meshRef, pending);
    void deps.assetRegistry
      .get<import("../glb-loader").GlbAsset>(meshRef)
      .then((asset) => {
        // Walk the GLB scene; pick the first Mesh's geometry. Mirrors
        // `findFirstMesh` in three-renderer.ts.
        let sourceGeometry: import("three").BufferGeometry | undefined;
        asset.scene.traverse((obj) => {
          if (sourceGeometry !== undefined) return;
          const maybeMesh = obj as { isMesh?: boolean; geometry?: import("three").BufferGeometry };
          if (maybeMesh.isMesh === true && maybeMesh.geometry !== undefined) {
            sourceGeometry = maybeMesh.geometry;
          }
        });
        if (sourceGeometry === undefined) {
          geometryCache.set(meshRef, { kind: "failed" });
          return;
        }
        geometryCache.set(meshRef, { kind: "ready", geometry: sourceGeometry.clone() });
      })
      .catch(() => {
        geometryCache.set(meshRef, { kind: "failed" });
      });
    return pending;
  }

  function loadManifest(materialRef: string): ManifestSlot {
    const cached = manifestCache.get(materialRef);
    if (cached !== undefined) return cached;
    if (deps.assetRegistry === undefined) {
      manifestCache.set(materialRef, { kind: "skip" });
      return { kind: "skip" };
    }
    const pending: ManifestSlot = { kind: "pending" };
    manifestCache.set(materialRef, pending);
    void deps.assetRegistry
      .get<import("../../runtime/asset-loaders/material-loader").MaterialManifest>(materialRef)
      .then((manifest) => {
        const shader = (manifest as { shader?: string }).shader ?? "standard";
        // Bucket only standard PBR with no texture refs. Anything with
        // map/normalMap/etc. stays on the single-Mesh path because the
        // texture uniform can't vary per-instance without atlasing.
        const m = manifest as Record<string, unknown>;
        const hasTexture = Object.keys(m).some(
          (k) => k.endsWith("Map") || k.endsWith("Texture")
        );
        if (shader !== "standard" || hasTexture) {
          manifestCache.set(materialRef, { kind: "skip" });
          return;
        }
        const roughness = typeof m["roughness"] === "number" ? m["roughness"] : 0.5;
        const metalness = typeof m["metalness"] === "number" ? m["metalness"] : 0;
        const emissive = typeof m["emissive"] === "string" ? m["emissive"] : "#000000";
        const profileKey = `std|R${roughness}|M${metalness}|E${emissive}`;
        const color = typeof m["color"] === "string" ? m["color"] : "#cccccc";
        manifestCache.set(materialRef, { kind: "ready", profileKey, color });
      })
      .catch(() => {
        manifestCache.set(materialRef, { kind: "skip" });
      });
    return pending;
  }

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
        dirtyInstancedBuckets.add(record.handle);
      }
      record.members.delete(entityId);
      record.lastWorld.delete(entityId);
      record.lastColor.delete(entityId);
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

  // Per-frame dirty set populated by updateInstanced when the LTW cache
  // misses or an instance is added/removed. Flushed at the end of
  // frameUpdate so each bucket's bounding sphere is recomputed at most
  // once per frame instead of N times per instance change.
  const dirtyInstancedBuckets = new Set<BucketHandle>();

  const updateInstanced = (
    world: World,
    entityId: EntityId,
    renderer: MeshRendererComponent,
    batchable: BatchableComponent | undefined,
    cast: boolean,
    receive: boolean,
    glbGeometry?: import("three").BufferGeometry | undefined,
    manifestProfileKey?: string | undefined,
    manifestColor?: string | undefined
  ): void => {
    // S53 RENDER-bucket-spec-typed: bucket key is now derived from a
    // typed BucketSpec via `bucketSpecHash()`. The hash format is
    // identical to the pre-S53 hand-rolled string so existing tests
    // + adapter call sites keep working; new dispatcher code (story 3+)
    // routes through the spec itself instead of re-parsing strings.
    const spec: BucketSpec = {
      kind: "instanced",
      mesh: renderer.mesh,
      shadowCast: cast,
      shadowReceive: receive,
      ...(manifestProfileKey !== undefined ? { materialProfile: manifestProfileKey } : {}),
      ...(batchable?.group !== undefined ? { group: batchable.group } : {})
    };
    const bucketKey = bucketSpecHash(spec);
    let record = bucketsByKey.get(bucketKey) as InstancedRecord | undefined;
    if (record === undefined) {
      const geometry =
        glbGeometry ?? createPrimitiveGeometry(renderer.mesh) ?? createPlaceholderGeometry();
      const acquireSpec: Parameters<typeof deps.adapter.acquireBucket>[0] = {
        geometry,
        capacity: DEFAULT_BUCKET_CAPACITY,
        useInstanceColor: true,
        castShadow: cast,
        receiveShadow: receive
      };
      if (manifestProfileKey !== undefined) {
        acquireSpec.materialProfile = manifestProfileKey;
        // profileKey format: `std|R<roughness>|M<metalness>|E<emissive>`.
        const match = manifestProfileKey.match(/^std\|R([^|]+)\|M([^|]+)\|E(.+)$/);
        if (match !== null) {
          acquireSpec.materialParams = {
            roughness: Number.parseFloat(match[1]!),
            metalness: Number.parseFloat(match[2]!),
            emissive: match[3]!
          };
        }
      }
      const handle = deps.adapter.acquireBucket(acquireSpec);
      record = {
        path: "instanced",
        handle,
        bucketKey,
        mesh: renderer.mesh,
        color: renderer.color,
        shadowCast: cast,
        shadowReceive: receive,
        members: new Map(),
        lastWorld: new Map(),
        lastColor: new Map()
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
      dirtyInstancedBuckets.add(record.handle);
    }
    const ltw = world.getComponent<LocalToWorldComponent>(entityId, LOCAL_TO_WORLD);
    if (ltw !== undefined) {
      const px = ltw.position[0] ?? 0;
      const py = ltw.position[1] ?? 0;
      const pz = ltw.position[2] ?? 0;
      const rx = ltw.rotation[0] ?? 0;
      const ry = ltw.rotation[1] ?? 0;
      const rz = ltw.rotation[2] ?? 0;
      const sx = ltw.scale[0] ?? 1;
      const sy = ltw.scale[1] ?? 1;
      const sz = ltw.scale[2] ?? 1;
      // S50 perf: skip the per-frame setMatrixAt + needsUpdate when the
      // LocalToWorld hasn't changed since the last write. For shadows-
      // bench's static buildings / rocks / roads this cuts the GPU
      // matrix upload from "every frame for every instance" to "only on
      // actual movement". TransformResolveSystem still writes LTW every
      // frame (cache returns the same ref for unchanged entities) so we
      // do the cheap 9-number compare here.
      const cached = record.lastWorld.get(entityId);
      if (
        cached === undefined ||
        cached[0] !== px || cached[1] !== py || cached[2] !== pz ||
        cached[3] !== rx || cached[4] !== ry || cached[5] !== rz ||
        cached[6] !== sx || cached[7] !== sy || cached[8] !== sz
      ) {
        deps.adapter.setBucketInstanceTransform(record.handle, instance, {
          position: [px, py, pz],
          rotation: [rx, ry, rz],
          scale: [sx, sy, sz]
        });
        record.lastWorld.set(entityId, [px, py, pz, rx, ry, rz, sx, sy, sz]);
        dirtyInstancedBuckets.add(record.handle);
      }
    }
    // Stamp per-instance colour. Priority: renderer.color (authored
    // override) > manifest.color (from the loaded material) > white.
    // Cached so unchanged colours don't dirty the instanceColor buffer.
    const desiredColor = renderer.color ?? manifestColor ?? "#ffffff";
    if (record.lastColor.get(entityId) !== desiredColor) {
      deps.adapter.setBucketInstanceColor(record.handle, instance, desiredColor);
      record.lastColor.set(entityId, desiredColor);
    }
  };

  const updateBatched = (
    world: World,
    entityId: EntityId,
    renderer: MeshRendererComponent,
    batchable: BatchableComponent | undefined,
    cast: boolean,
    receive: boolean
  ): void => {
    // S51 bugfix: bucket key MUST omit renderer.color — same as the
    // InstancedMesh path since S50. Per-instance colour is uploaded via
    // setBatchedInstanceColor below; the bucket material stays white so
    // BatchedMesh's `_batchColor * material.color` multiply doesn't
    // square the colour (which made the scene visibly darker on
    // shadows-bench when path: "batched" was first enabled).
    const batchedSpec: BucketSpec = {
      kind: "batched",
      shadowCast: cast,
      shadowReceive: receive,
      ...(batchable?.group !== undefined ? { group: batchable.group } : {})
    };
    const bucketKey = bucketSpecHash(batchedSpec);
    let record = bucketsByKey.get(bucketKey) as BatchedRecord | undefined;
    if (record === undefined) {
      const handle = deps.adapter.acquireBatchedBucket({
        maxInstances: BATCHED_MAX_INSTANCES,
        maxVertices: BATCHED_MAX_VERTICES,
        maxIndices: BATCHED_MAX_INDICES,
        castShadow: cast,
        receiveShadow: receive
      });
      record = {
        path: "batched",
        handle,
        bucketKey,
        color: undefined,
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
    // S51-BatchedMesh-color: per-instance colour via BatchedMesh.setColorAt
    // so multi-coloured primitive entities can share one BatchedMesh.
    if (renderer.color !== undefined) {
      deps.adapter.setBatchedInstanceColor(record.handle, entry.instance, renderer.color);
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
      // Auto-batch mode skips entities that BatchingSystem can't yet
      // handle (LOD swap, async-loading geometry that hasn't resolved).
      if (autoIncludePrimitives && batchable === undefined) {
        if (world.hasComponent(entityId, "LOD")) {
          releaseEntity(world, entityId);
          continue;
        }
      }
      // S50 GLB batching: a non-primitive mesh ref means we need the
      // loaded BufferGeometry from AssetRegistry. While it loads, the
      // entity falls back to single-Mesh rendering.
      let glbGeometry: import("three").BufferGeometry | undefined;
      if (!PRIMITIVE_MESHES.has(renderer.mesh)) {
        if (!isExternalMeshRef(renderer.mesh)) {
          // Unknown non-primitive non-external — leave to single-Mesh.
          releaseEntity(world, entityId);
          continue;
        }
        const slot = loadGeometry(renderer.mesh);
        if (slot.kind !== "ready") {
          releaseEntity(world, entityId);
          continue;
        }
        glbGeometry = slot.geometry;
      }
      // S50 manifest batching: texture-less standard manifests share a
      // bucket per (roughness, metalness, emissive). Color goes per-
      // instance below.
      let manifestProfileKey: string | undefined;
      let manifestColor: string | undefined;
      if (renderer.material !== undefined) {
        const slot = loadManifest(renderer.material);
        if (slot.kind !== "ready") {
          releaseEntity(world, entityId);
          continue;
        }
        manifestProfileKey = slot.profileKey;
        manifestColor = slot.color;
      }
      const flags = world.getComponent<ShadowFlagsComponent>(entityId, SHADOW_FLAGS);
      const cast = flags?.cast !== false;
      const receive = flags?.receive !== false;
      const path: "instanced" | "batched" = batchable?.path ?? defaultPath;
      if (path === "batched") {
        updateBatched(world, entityId, renderer, batchable, cast, receive);
      } else {
        updateInstanced(
          world,
          entityId,
          renderer,
          batchable,
          cast,
          receive,
          glbGeometry,
          manifestProfileKey,
          manifestColor
        );
      }
    }
    // S50 perf: recompute the bounding sphere only on buckets that
    // actually changed this frame. With per-bucket frustum culling
    // enabled in `acquireBucket`, three.js skips the whole InstancedMesh
    // (every cascade pass) when its sphere is outside the camera
    // frustum. Recomputing once per frame per dirty bucket is
    // O(instances) — cheap vs the savings from culling.
    for (const handle of dirtyInstancedBuckets) {
      deps.adapter.recomputeBucketBoundingSphere(handle);
    }
    dirtyInstancedBuckets.clear();
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
