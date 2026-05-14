import { describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import { createPhysicsSyncSystem } from "../../engine/physics/rapier/physics-sync-system";
import { createPhysicsBodyRegistry } from "../../engine/physics/rapier/physics-body-registry";
import type {
  BodyAcquireSpec,
  BodyHandle,
  ColliderAcquireSpec,
  ColliderHandle,
  RapierAdapter
} from "../../engine/physics/rapier/rapier-adapter";

function stubAdapter() {
  let nextBody = 1;
  let nextCollider = 1;
  const acquired: BodyAcquireSpec[] = [];
  const released: BodyHandle[] = [];
  const colliders: Array<{ body: BodyHandle; spec: ColliderAcquireSpec }> = [];
  const transforms: Array<{ handle: BodyHandle; position: readonly [number, number, number] }> = [];
  const positions = new Map<BodyHandle, readonly [number, number, number]>();
  let steps = 0;
  const adapter: RapierAdapter = {
    async init(): Promise<void> {},
    acquireBody(spec): BodyHandle {
      const handle = nextBody;
      nextBody += 1;
      acquired.push(spec);
      positions.set(handle, [spec.position[0], spec.position[1], spec.position[2]]);
      return handle;
    },
    releaseBody(handle): void {
      released.push(handle);
      positions.delete(handle);
    },
    acquireCollider(body, spec): ColliderHandle | undefined {
      const handle = nextCollider;
      nextCollider += 1;
      colliders.push({ body, spec });
      return handle;
    },
    releaseCollider(): void {},
    setBodyTransform(handle, position): void {
      transforms.push({ handle, position });
      positions.set(handle, [position[0], position[1], position[2]]);
    },
    getBodyTranslation(handle) {
      return positions.get(handle);
    },
    getBodyRotation() {
      return [0, 0, 0, 0] as const;
    },
    step(): void {
      steps += 1;
      // Simulate "fell 0.1 per step" for dynamic bodies via the test driver.
    },
    drainEvents() {
      return [];
    },
    acquireCharacterController(): number {
      return 0;
    },
    releaseCharacterController(): void {},
    computeCharacterMovement() {
      return undefined;
    },
    setBodyNextKinematicTranslation(): void {},
    setGravity(): void {},
    getDebugLines() {
      return { vertices: new Float32Array(0), colors: new Float32Array(0) };
    },
    castRay() {
      return undefined;
    },
    info() {
      return { bodies: positions.size, colliders: 0, fixedDt: 1 / 60, totalSteps: steps };
    },
    dispose(): void {}
  };
  return {
    adapter,
    spy: { acquired, released, colliders, transforms, positions, steps: () => steps }
  };
}

function ctx(world: World) {
  return {
    world,
    time: { elapsed: 0, dt: 1 / 60, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  } as const;
}

describe("PhysicsSyncSystem (M24-sync)", () => {
  it("acquires a body + collider for each RigidBody3D entity on first tick", () => {
    const { adapter, spy } = stubAdapter();
    const registry = createPhysicsBodyRegistry(adapter);
    const world = new World();
    world.addEntity("cube");
    world.setComponent("cube", "Transform", { position: [0, 2, 0] });
    world.setComponent("cube", "RigidBody3D", { type: "dynamic", mass: 1 });
    world.setComponent("cube", "Collider3D", { kind: "box", size: [1, 1, 1] });

    const system = createPhysicsSyncSystem(registry, adapter);
    system.fixedUpdate?.(ctx(world));

    expect(spy.acquired).toHaveLength(1);
    expect(spy.acquired[0]?.kind).toBe("dynamic");
    expect(spy.acquired[0]?.position).toEqual([0, 2, 0]);
    expect(spy.colliders).toHaveLength(1);
    expect(spy.colliders[0]?.spec.kind).toBe("box");
    expect(registry.size()).toBe(1);
  });

  it("pushes kinematic Transform to Rapier each tick", () => {
    const { adapter, spy } = stubAdapter();
    const registry = createPhysicsBodyRegistry(adapter);
    const world = new World();
    world.addEntity("player");
    world.setComponent("player", "Transform", { position: [0, 0.9, 0] });
    world.setComponent("player", "RigidBody3D", { type: "kinematicPosition" });
    world.setComponent("player", "Collider3D", { kind: "capsule", radius: 0.3, halfHeight: 0.7 });

    const system = createPhysicsSyncSystem(registry, adapter);
    system.fixedUpdate?.(ctx(world));

    // After first tick, Transform was pushed via setBodyTransform.
    const initial = spy.transforms.find((t) => t.position[1] === 0.9);
    expect(initial).toBeDefined();

    world.setComponent("player", "Transform", { position: [1.5, 0.9, 0] });
    system.fixedUpdate?.(ctx(world));
    const later = spy.transforms.at(-1);
    expect(later?.position).toEqual([1.5, 0.9, 0]);
  });

  it("writes dynamic body translations back into ECS Transform after step + frameUpdate", () => {
    const { adapter } = stubAdapter();
    const registry = createPhysicsBodyRegistry(adapter);
    const world = new World();
    world.addEntity("cube");
    world.setComponent("cube", "Transform", { position: [0, 2, 0] });
    world.setComponent("cube", "RigidBody3D", { type: "dynamic", mass: 1 });

    const system = createPhysicsSyncSystem(registry, adapter);
    system.fixedUpdate?.(ctx(world));
    // M24-interpolation: fixedUpdate now stores prev/curr; the Transform
    // writeback happens in frameUpdate. With physicsAlpha defaulted to 0,
    // the result equals prevPos (which seeded from currPos on the first
    // step), so position still matches the stub's body translation.
    system.frameUpdate?.(ctx(world));
    const transform = world.getComponent<{ position: ReadonlyArray<number> }>("cube", "Transform");
    expect(transform?.position).toEqual([0, 2, 0]);
  });

  it("releases the body when RigidBody3D is removed", () => {
    const { adapter, spy } = stubAdapter();
    const registry = createPhysicsBodyRegistry(adapter);
    const world = new World();
    world.addEntity("cube");
    world.setComponent("cube", "Transform", { position: [0, 0, 0] });
    world.setComponent("cube", "RigidBody3D", { type: "dynamic" });

    const system = createPhysicsSyncSystem(registry, adapter);
    system.fixedUpdate?.(ctx(world));
    expect(registry.size()).toBe(1);

    world.removeComponent("cube", "RigidBody3D");
    system.fixedUpdate?.(ctx(world));
    expect(registry.size()).toBe(0);
    expect(spy.released).toHaveLength(1);
  });

  it("re-acquires the body when its kind changes", () => {
    const { adapter, spy } = stubAdapter();
    const registry = createPhysicsBodyRegistry(adapter);
    const world = new World();
    world.addEntity("e");
    world.setComponent("e", "Transform", { position: [0, 0, 0] });
    world.setComponent("e", "RigidBody3D", { type: "kinematicPosition" });

    const system = createPhysicsSyncSystem(registry, adapter);
    system.fixedUpdate?.(ctx(world));

    world.setComponent("e", "RigidBody3D", { type: "dynamic", mass: 1 });
    system.fixedUpdate?.(ctx(world));

    expect(spy.released).toHaveLength(1);
    expect(spy.acquired).toHaveLength(2);
    expect(spy.acquired[1]?.kind).toBe("dynamic");
  });

  it("steps the adapter exactly once per fixedUpdate", () => {
    const { adapter, spy } = stubAdapter();
    const registry = createPhysicsBodyRegistry(adapter);
    const world = new World();
    const system = createPhysicsSyncSystem(registry, adapter);
    system.fixedUpdate?.(ctx(world));
    system.fixedUpdate?.(ctx(world));
    system.fixedUpdate?.(ctx(world));
    expect(spy.steps()).toBe(3);
  });

  it("interpolates dynamic Transform between fixed steps by time.physicsAlpha (M24-interpolation)", () => {
    const { adapter, spy } = stubAdapter();
    const registry = createPhysicsBodyRegistry(adapter);
    const world = new World();
    world.addEntity("cube");
    world.setComponent("cube", "Transform", { position: [0, 0, 0] });
    world.setComponent("cube", "RigidBody3D", { type: "dynamic", mass: 1 });

    const system = createPhysicsSyncSystem(registry, adapter);
    // First fixed step: body position = [0, 0, 0].
    system.fixedUpdate?.(ctx(world));
    // Move the body to simulate a step.
    const handle = registry.handleFor("cube");
    spy.positions.set(handle!, [10, 0, 0]);
    // Second fixed step: body position = [10, 0, 0]; prev = [0, 0, 0], curr = [10, 0, 0].
    system.fixedUpdate?.(ctx(world));

    // alpha = 0 → expect prev = [0, 0, 0]
    system.frameUpdate?.({
      world,
      time: { elapsed: 0, dt: 1 / 120, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0, physicsAlpha: 0 }
    });
    expect(world.getComponent<{ position: ReadonlyArray<number> }>("cube", "Transform")?.position).toEqual([0, 0, 0]);

    // alpha = 0.5 → expect midpoint = [5, 0, 0]
    system.frameUpdate?.({
      world,
      time: { elapsed: 0, dt: 1 / 120, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0, physicsAlpha: 0.5 }
    });
    expect(world.getComponent<{ position: ReadonlyArray<number> }>("cube", "Transform")?.position).toEqual([5, 0, 0]);

    // alpha = 1 → expect curr = [10, 0, 0]
    system.frameUpdate?.({
      world,
      time: { elapsed: 0, dt: 1 / 120, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0, physicsAlpha: 1 }
    });
    expect(world.getComponent<{ position: ReadonlyArray<number> }>("cube", "Transform")?.position).toEqual([10, 0, 0]);
  });
});
