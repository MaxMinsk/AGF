// S51-BatchedMesh-primary: BatchingSystem with `defaultPath: "batched"` and
// per-Batchable `path: "batched"` overrides routes entities through the
// adapter's BatchedMesh API instead of InstancedMesh. The big win is
// per-instance frustum culling on the CPU — the test verifies the routing
// + per-instance colour stamping; perf is measured live on the user's
// machine, not in CI.

import { describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import {
  BATCHED_MESH_HANDLE,
  createBatchingSystem
} from "../../engine/render/systems/batching-system";
import type {
  BatchedBucketAcquireSpec,
  BatchedBucketHandle,
  BatchedGeometryId,
  InstanceIndex,
  ResolvedWorld,
  ThreeRenderAdapter
} from "../../engine/render/three-render-adapter";

type BatchedAdapterStub = {
  acquired: Array<{ handle: BatchedBucketHandle; spec: BatchedBucketAcquireSpec }>;
  geometriesByBucket: Map<BatchedBucketHandle, number>;
  addedInstances: Array<{ handle: BatchedBucketHandle; geometryId: BatchedGeometryId; instance: InstanceIndex }>;
  transforms: Array<{ handle: BatchedBucketHandle; instance: InstanceIndex; world: ResolvedWorld }>;
  colors: Array<{ handle: BatchedBucketHandle; instance: InstanceIndex; color: string }>;
  liveByBucket: Map<BatchedBucketHandle, Set<InstanceIndex>>;
  /** S53: handles on which `ensureBucketBvh` has been called. */
  bvhBuilt: Set<BatchedBucketHandle>;
};

function stubBatchedAdapter(): BatchedAdapterStub & ThreeRenderAdapter {
  let nextHandle = 1;
  let nextGeomId = 0;
  let nextInstance = 0;
  const stub: BatchedAdapterStub = {
    acquired: [],
    geometriesByBucket: new Map(),
    addedInstances: [],
    transforms: [],
    colors: [],
    liveByBucket: new Map(),
    bvhBuilt: new Set()
  };
  return Object.assign(
    {} as unknown as ThreeRenderAdapter,
    stub,
    {
      acquireBatchedBucket(spec: BatchedBucketAcquireSpec): BatchedBucketHandle {
        const handle = nextHandle++;
        stub.acquired.push({ handle, spec });
        stub.geometriesByBucket.set(handle, 0);
        stub.liveByBucket.set(handle, new Set());
        return handle;
      },
      releaseBatchedBucket(handle: BatchedBucketHandle): void {
        stub.geometriesByBucket.delete(handle);
        stub.liveByBucket.delete(handle);
      },
      addBatchedGeometry(handle: BatchedBucketHandle): BatchedGeometryId | undefined {
        if (!stub.geometriesByBucket.has(handle)) return undefined;
        const id = nextGeomId++;
        stub.geometriesByBucket.set(handle, (stub.geometriesByBucket.get(handle) ?? 0) + 1);
        return id;
      },
      addBatchedInstance(
        handle: BatchedBucketHandle,
        geometryId: BatchedGeometryId
      ): InstanceIndex | undefined {
        const live = stub.liveByBucket.get(handle);
        if (live === undefined) return undefined;
        const slot = nextInstance++;
        live.add(slot);
        stub.addedInstances.push({ handle, geometryId, instance: slot });
        return slot;
      },
      removeBatchedInstance(handle: BatchedBucketHandle, instance: InstanceIndex): void {
        stub.liveByBucket.get(handle)?.delete(instance);
      },
      setBatchedInstanceTransform(
        handle: BatchedBucketHandle,
        instance: InstanceIndex,
        world: ResolvedWorld
      ): void {
        stub.transforms.push({ handle, instance, world });
      },
      setBatchedInstanceGeometry(): void {
        // not exercised here
      },
      setBatchedInstanceColor(
        handle: BatchedBucketHandle,
        instance: InstanceIndex,
        color: string
      ): void {
        stub.colors.push({ handle, instance, color });
      },
      ensureBucketBvh(handle: BatchedBucketHandle): void {
        // S53 stub: record per-bucket BVH activation; the real adapter
        // delegates to `mesh.computeBVH()` from
        // `@three.ez/batched-mesh-extensions`.
        stub.bvhBuilt.add(handle);
      },
      batchedBucketLiveCount(handle: BatchedBucketHandle): number {
        return stub.liveByBucket.get(handle)?.size ?? 0;
      }
    } as unknown as ThreeRenderAdapter
  );
}

function ctx(world: World) {
  return {
    world,
    time: { elapsed: 0, dt: 1 / 60, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  } as const;
}

describe("BatchingSystem batched path (S51)", () => {
  it("routes auto-batched primitives through BatchedMesh when defaultPath is 'batched'", () => {
    const adapter = stubBatchedAdapter();
    const world = new World();
    for (const id of ["a", "b", "c"]) {
      world.addEntity(id);
      world.setComponent(id, "MeshRenderer", { mesh: "box", color: "#ff0000" });
      world.setComponent(id, "LocalToWorld", {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
      });
    }
    const system = createBatchingSystem(
      { adapter },
      { autoIncludePrimitives: true, defaultPath: "batched" }
    );
    system.frameUpdate?.(ctx(world));

    expect(adapter.acquired).toHaveLength(1);
    expect(adapter.geometriesByBucket.get(adapter.acquired[0]!.handle)).toBe(1);
    expect(adapter.addedInstances).toHaveLength(3);
    expect(world.hasComponent("a", BATCHED_MESH_HANDLE)).toBe(true);
    expect(world.hasComponent("b", BATCHED_MESH_HANDLE)).toBe(true);
    expect(world.hasComponent("c", BATCHED_MESH_HANDLE)).toBe(true);
  });

  it("stamps per-instance colour on BatchedMesh slots", () => {
    const adapter = stubBatchedAdapter();
    const world = new World();
    world.addEntity("red");
    world.setComponent("red", "MeshRenderer", { mesh: "box", color: "#ff0000" });
    world.setComponent("red", "Batchable", { path: "batched" });
    world.addEntity("blue");
    world.setComponent("blue", "MeshRenderer", { mesh: "box", color: "#0000ff" });
    world.setComponent("blue", "Batchable", { path: "batched" });

    const system = createBatchingSystem({ adapter });
    system.frameUpdate?.(ctx(world));

    const colours = adapter.colors.map((c) => c.color);
    expect(colours).toContain("#ff0000");
    expect(colours).toContain("#0000ff");
  });

  it("collapses different-colour entities into ONE BatchedMesh bucket without baking colour into the spec", () => {
    // S51 regression: the BatchedMesh bucketKey used to include
    // renderer.color (red + blue → two separate buckets) AND the
    // adapter material colour was set from the first entity's
    // renderer.color. The per-instance colour then multiplied with
    // the material colour, squaring the value and darkening the
    // scene visibly on shadows-bench. The fix is to (a) omit colour
    // from the key, (b) leave spec.color undefined so the adapter
    // anchors the material at white.
    const adapter = stubBatchedAdapter();
    const world = new World();
    world.addEntity("red");
    world.setComponent("red", "MeshRenderer", { mesh: "box", color: "#ff0000" });
    world.setComponent("red", "Batchable", { path: "batched" });
    world.addEntity("blue");
    world.setComponent("blue", "MeshRenderer", { mesh: "box", color: "#0000ff" });
    world.setComponent("blue", "Batchable", { path: "batched" });

    const system = createBatchingSystem({ adapter });
    system.frameUpdate?.(ctx(world));

    expect(adapter.acquired).toHaveLength(1);
    expect(adapter.acquired[0]?.spec.color).toBeUndefined();
  });

  it("respects per-Batchable path override even when defaultPath is 'instanced'", () => {
    const adapter = stubBatchedAdapter();
    const world = new World();
    world.addEntity("a");
    world.setComponent("a", "MeshRenderer", { mesh: "box" });
    world.setComponent("a", "Batchable", { path: "batched" });

    const system = createBatchingSystem({ adapter }, { defaultPath: "instanced" });
    system.frameUpdate?.(ctx(world));

    expect(adapter.acquired).toHaveLength(1);
    expect(adapter.addedInstances).toHaveLength(1);
  });

  it("routes path: 'batched-bvh' through useBvh + calls ensureBucketBvh after instances added (S53)", () => {
    const adapter = stubBatchedAdapter();
    const world = new World();
    for (const id of ["a", "b", "c"]) {
      world.addEntity(id);
      world.setComponent(id, "MeshRenderer", { mesh: "box", color: "#ff0000" });
      world.setComponent(id, "Batchable", { path: "batched-bvh" });
      world.setComponent(id, "LocalToWorld", {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
      });
    }

    const system = createBatchingSystem({ adapter });
    system.frameUpdate?.(ctx(world));

    expect(adapter.acquired).toHaveLength(1);
    expect(adapter.acquired[0]?.spec.useBvh).toBe(true);
    // After instances land, BatchingSystem lights up the BVH.
    expect(adapter.bvhBuilt.size).toBe(1);
    expect(adapter.bvhBuilt.has(adapter.acquired[0]!.handle)).toBe(true);
  });

  it("vanilla batched path does NOT call ensureBucketBvh", () => {
    const adapter = stubBatchedAdapter();
    const world = new World();
    world.addEntity("a");
    world.setComponent("a", "MeshRenderer", { mesh: "box" });
    world.setComponent("a", "Batchable", { path: "batched" });

    const system = createBatchingSystem({ adapter });
    system.frameUpdate?.(ctx(world));

    expect(adapter.acquired).toHaveLength(1);
    expect(adapter.acquired[0]?.spec.useBvh).toBeFalsy();
    expect(adapter.bvhBuilt.size).toBe(0);
  });
});
