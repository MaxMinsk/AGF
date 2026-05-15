import { describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import {
  BATCHED_MESH_HANDLE,
  createBatchingSystem
} from "../../engine/render/systems/batching-system";
import type {
  BucketAcquireSpec,
  BucketHandle,
  InstanceIndex,
  ResolvedWorld,
  ThreeRenderAdapter
} from "../../engine/render/three-render-adapter";

type AdapterStub = {
  acquired: Array<{ handle: BucketHandle; spec: BucketAcquireSpec }>;
  released: BucketHandle[];
  resized: Array<{ handle: BucketHandle; capacity: number }>;
  addedInstances: Array<{ handle: BucketHandle; instance: InstanceIndex }>;
  removedInstances: Array<{ handle: BucketHandle; instance: InstanceIndex }>;
  transforms: Array<{ handle: BucketHandle; instance: InstanceIndex; world: ResolvedWorld }>;
  colors: Array<{ handle: BucketHandle; instance: InstanceIndex; color: string }>;
  live: Map<BucketHandle, Set<InstanceIndex>>;
  capacities: Map<BucketHandle, number>;
};

function stubAdapter(): AdapterStub & ThreeRenderAdapter {
  let nextHandle = 1;
  let nextSlot = 0;
  const stub: AdapterStub = {
    acquired: [],
    released: [],
    resized: [],
    addedInstances: [],
    removedInstances: [],
    transforms: [],
    colors: [],
    live: new Map(),
    capacities: new Map()
  };
  return Object.assign(
    {} as unknown as ThreeRenderAdapter,
    stub,
    {
      acquireBucket(spec: BucketAcquireSpec): BucketHandle {
        const handle = nextHandle++;
        stub.acquired.push({ handle, spec });
        stub.live.set(handle, new Set());
        stub.capacities.set(handle, spec.capacity);
        return handle;
      },
      releaseBucket(handle: BucketHandle): void {
        stub.released.push(handle);
        stub.live.delete(handle);
        stub.capacities.delete(handle);
      },
      resizeBucket(handle: BucketHandle, capacity: number): void {
        stub.resized.push({ handle, capacity });
        stub.capacities.set(handle, capacity);
      },
      addBucketInstance(handle: BucketHandle): InstanceIndex | undefined {
        const live = stub.live.get(handle);
        if (live === undefined) return undefined;
        const slot = nextSlot++;
        live.add(slot);
        stub.addedInstances.push({ handle, instance: slot });
        return slot;
      },
      removeBucketInstance(handle: BucketHandle, instance: InstanceIndex): void {
        stub.live.get(handle)?.delete(instance);
        stub.removedInstances.push({ handle, instance });
      },
      setBucketInstanceTransform(
        handle: BucketHandle,
        instance: InstanceIndex,
        world: ResolvedWorld
      ): void {
        stub.transforms.push({ handle, instance, world });
      },
      setBucketInstanceColor(handle: BucketHandle, instance: InstanceIndex, color: string): void {
        stub.colors.push({ handle, instance, color });
      },
      recomputeBucketBoundingSphere(_handle: BucketHandle): void {
        // no-op in stub
      },
      bucketLiveCount(handle: BucketHandle): number {
        return stub.live.get(handle)?.size ?? 0;
      },
      bucketCapacity(handle: BucketHandle): number {
        return stub.capacities.get(handle) ?? 0;
      },
      hasBucket(handle: BucketHandle): boolean {
        return stub.live.has(handle);
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

describe("BatchingSystem (M17-bucketer)", () => {
  it("collapses two entities sharing mesh+color+flags into one bucket", () => {
    const adapter = stubAdapter();
    const world = new World();
    for (const id of ["a", "b"]) {
      world.addEntity(id);
      world.setComponent(id, "MeshRenderer", { mesh: "box", color: "#ff0000" });
      world.setComponent(id, "Batchable", { group: "rocks" });
      world.setComponent(id, "LocalToWorld", {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
      });
    }
    const system = createBatchingSystem({ adapter });
    system.frameUpdate?.(ctx(world));

    expect(adapter.acquired).toHaveLength(1);
    expect(adapter.addedInstances).toHaveLength(2);
    expect(system.bucketCount()).toBe(1);
    expect(system.totalInstances()).toBe(2);
    expect(world.hasComponent("a", BATCHED_MESH_HANDLE)).toBe(true);
    expect(world.hasComponent("b", BATCHED_MESH_HANDLE)).toBe(true);
  });

  it("shares a bucket across colour variants and stamps per-instance colour", () => {
    // S50: bucket key no longer includes renderer.color; the per-instance
    // colour is uploaded via setBucketInstanceColor instead so different
    // colours collapse into one InstancedMesh.
    const adapter = stubAdapter();
    const world = new World();
    world.addEntity("red");
    world.setComponent("red", "MeshRenderer", { mesh: "box", color: "#ff0000" });
    world.setComponent("red", "Batchable", {});
    world.addEntity("blue");
    world.setComponent("blue", "MeshRenderer", { mesh: "box", color: "#0000ff" });
    world.setComponent("blue", "Batchable", {});

    const system = createBatchingSystem({ adapter });
    system.frameUpdate?.(ctx(world));
    expect(system.bucketCount()).toBe(1);
    expect(adapter.acquired[0]?.spec.useInstanceColor).toBe(true);
    const colors = adapter.colors.map((c) => c.color);
    expect(colors).toContain("#ff0000");
    expect(colors).toContain("#0000ff");
  });

  it("splits buckets by group hint even if mesh + color match", () => {
    const adapter = stubAdapter();
    const world = new World();
    world.addEntity("a");
    world.setComponent("a", "MeshRenderer", { mesh: "box" });
    world.setComponent("a", "Batchable", { group: "alpha" });
    world.addEntity("b");
    world.setComponent("b", "MeshRenderer", { mesh: "box" });
    world.setComponent("b", "Batchable", { group: "bravo" });

    const system = createBatchingSystem({ adapter });
    system.frameUpdate?.(ctx(world));
    expect(system.bucketCount()).toBe(2);
  });

  it("releases the instance when Batchable is removed; bucket disposed when empty", () => {
    const adapter = stubAdapter();
    const world = new World();
    world.addEntity("a");
    world.setComponent("a", "MeshRenderer", { mesh: "box" });
    world.setComponent("a", "Batchable", {});

    const system = createBatchingSystem({ adapter });
    system.frameUpdate?.(ctx(world));
    expect(system.bucketCount()).toBe(1);

    world.removeComponent("a", "Batchable");
    system.frameUpdate?.(ctx(world));
    expect(world.hasComponent("a", BATCHED_MESH_HANDLE)).toBe(false);
    expect(system.bucketCount()).toBe(0);
    expect(adapter.released).toHaveLength(1);
  });

  it("ignores Batchable entities with manifest material (deferred to M17-mat)", () => {
    const adapter = stubAdapter();
    const world = new World();
    world.addEntity("a");
    world.setComponent("a", "MeshRenderer", { mesh: "box", material: "runtime/materials/x.json" });
    world.setComponent("a", "Batchable", {});

    const system = createBatchingSystem({ adapter });
    system.frameUpdate?.(ctx(world));
    expect(adapter.acquired).toHaveLength(0);
    expect(system.bucketCount()).toBe(0);
  });

  it("ignores Batchable entities with .glb mesh refs (deferred to M17-batched-mesh)", () => {
    const adapter = stubAdapter();
    const world = new World();
    world.addEntity("a");
    world.setComponent("a", "MeshRenderer", { mesh: "runtime/models/x.glb" });
    world.setComponent("a", "Batchable", {});

    const system = createBatchingSystem({ adapter });
    system.frameUpdate?.(ctx(world));
    expect(adapter.acquired).toHaveLength(0);
  });

  it("pushes LocalToWorld onto the bucket each frame", () => {
    const adapter = stubAdapter();
    const world = new World();
    world.addEntity("a");
    world.setComponent("a", "MeshRenderer", { mesh: "box" });
    world.setComponent("a", "Batchable", {});
    world.setComponent("a", "LocalToWorld", {
      position: [3, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    });

    const system = createBatchingSystem({ adapter });
    system.frameUpdate?.(ctx(world));
    const last = adapter.transforms.at(-1);
    expect(last?.world.position).toEqual([3, 0, 0]);
  });
});
