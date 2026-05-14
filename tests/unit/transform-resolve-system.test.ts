import { describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import {
  createTransformResolveSystem,
  LOCAL_TO_WORLD
} from "../../engine/render/systems/transform-resolve-system";

function ctx(world: World) {
  return {
    world,
    time: {
      elapsed: 0,
      dt: 1 / 60,
      fixedDt: 1 / 60,
      frameCount: 0,
      fixedStepCount: 0
    }
  } as const;
}

describe("TransformResolveSystem", () => {
  it("writes LocalToWorld with radians-converted rotation", () => {
    const world = new World();
    world.addEntity("a");
    world.setComponent("a", "Transform", { position: [1, 2, 3], rotation: [0, 90, 0], scale: [1, 1, 1] });

    const system = createTransformResolveSystem();
    system.frameUpdate?.(ctx(world));

    const ltw = world.getComponent<{
      position: ReadonlyArray<number>;
      rotation: ReadonlyArray<number>;
      scale: ReadonlyArray<number>;
    }>("a", LOCAL_TO_WORLD);
    expect(ltw).toBeDefined();
    expect(ltw?.position).toEqual([1, 2, 3]);
    // 90 degrees → π/2 radians.
    expect(ltw?.rotation[1]).toBeCloseTo(Math.PI / 2, 5);
    expect(ltw?.scale).toEqual([1, 1, 1]);
  });

  it("composes parent + child world transforms", () => {
    const world = new World();
    world.addEntity("parent");
    world.setComponent("parent", "Transform", { position: [10, 0, 0] });
    world.addEntity("child");
    world.setComponent("child", "Transform", { position: [1, 0, 0], parent: "parent" });

    const system = createTransformResolveSystem();
    system.frameUpdate?.(ctx(world));

    const childWorld = world.getComponent<{ position: ReadonlyArray<number> }>("child", LOCAL_TO_WORLD);
    expect(childWorld?.position[0]).toBe(11);
  });

  it("evicts LocalToWorld when an entity loses Transform", () => {
    const world = new World();
    world.addEntity("a");
    world.setComponent("a", "Transform", { position: [1, 0, 0] });

    const system = createTransformResolveSystem();
    system.frameUpdate?.(ctx(world));
    expect(world.hasComponent("a", LOCAL_TO_WORLD)).toBe(true);

    world.removeComponent("a", "Transform");
    system.frameUpdate?.(ctx(world));
    expect(world.hasComponent("a", LOCAL_TO_WORLD)).toBe(false);
  });

  it("reports cache stats after each frame", () => {
    const world = new World();
    world.addEntity("a");
    world.setComponent("a", "Transform", { position: [0, 0, 0] });
    world.addEntity("b");
    world.setComponent("b", "Transform", { position: [1, 0, 0], parent: "a" });

    const system = createTransformResolveSystem();
    system.frameUpdate?.(ctx(world));
    expect(system.stats()).toMatchObject({ total: 2 });

    // Second frame, nothing changes → everything reused.
    system.frameUpdate?.(ctx(world));
    expect(system.stats()).toMatchObject({ total: 2, dirty: 0, reused: 2 });
  });

  it("M16-cache-b: consumes World.consumeDirty('Transform') incrementally", () => {
    const world = new World();
    world.addEntity("a");
    world.setComponent("a", "Transform", { position: [0, 0, 0] });
    world.addEntity("b");
    world.setComponent("b", "Transform", { position: [1, 0, 0] });

    const system = createTransformResolveSystem();
    system.frameUpdate?.(ctx(world));
    expect(world.dirtySize("Transform")).toBe(0);

    world.setComponent("a", "Transform", { position: [9, 9, 9] });
    expect(world.dirtySize("Transform")).toBe(1);
    system.frameUpdate?.(ctx(world));
    expect(world.dirtySize("Transform")).toBe(0);

    const aLtw = world.getComponent<{ position: ReadonlyArray<number> }>("a", LOCAL_TO_WORLD);
    expect(aLtw?.position[0]).toBe(9);
  });

  it("M16-cache-b: re-seeds from scratch when the World changes", () => {
    const worldA = new World();
    worldA.addEntity("a");
    worldA.setComponent("a", "Transform", { position: [1, 0, 0] });
    const system = createTransformResolveSystem();
    system.frameUpdate?.(ctx(worldA));
    expect(worldA.getComponent("a", LOCAL_TO_WORLD)).toBeDefined();

    const worldB = new World();
    worldB.addEntity("b");
    worldB.setComponent("b", "Transform", { position: [5, 0, 0] });
    system.frameUpdate?.(ctx(worldB));
    expect(worldB.getComponent("b", LOCAL_TO_WORLD)).toBeDefined();
    expect(worldB.getComponent("a", LOCAL_TO_WORLD)).toBeUndefined();
  });
});
