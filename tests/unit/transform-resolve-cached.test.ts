import { describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import { createHierarchyCache } from "../../engine/core/transform/resolve-cached";

function makeChain(world: World, ids: ReadonlyArray<string>, parent?: string): void {
  ids.forEach((id, index) => {
    world.addEntity(id);
    const transform: Record<string, unknown> = { position: [index, 0, 0] };
    const upstream = index === 0 ? parent : ids[index - 1];
    if (upstream !== undefined) {
      transform["parent"] = upstream;
    }
    world.setComponent(id, "Transform", transform);
  });
}

describe("createHierarchyCache", () => {
  it("returns the same ResolvedTransform reference across resolves when nothing changed", () => {
    const world = new World();
    makeChain(world, ["a", "b", "c"]);
    const cache = createHierarchyCache();

    const first = cache.resolveWorld(world);
    const second = cache.resolveWorld(world);

    expect(first.get("a")).toBeDefined();
    expect(second.get("a")).toBe(first.get("a"));
    expect(second.get("b")).toBe(first.get("b"));
    expect(second.get("c")).toBe(first.get("c"));
    expect(cache.stats()).toEqual({ total: 3, dirty: 0, reused: 3, evicted: 0 });
  });

  it("re-resolves only the entity whose Transform was overwritten", () => {
    const world = new World();
    makeChain(world, ["a", "b", "c"]);
    const cache = createHierarchyCache();
    const initial = cache.resolveWorld(world);

    world.setComponent("a", "Transform", { position: [99, 0, 0] });
    const next = cache.resolveWorld(world);

    // "a" is dirty (its own Transform changed); "b" and "c" are dirty too
    // because their ancestor moved.
    expect(next.get("a")).not.toBe(initial.get("a"));
    expect(next.get("b")).not.toBe(initial.get("b"));
    expect(next.get("c")).not.toBe(initial.get("c"));
    // a is [99,0,0]; b is local [1,0,0] under a → [100,0,0];
    // c is local [2,0,0] under b → [102,0,0] (positions accumulate down the chain).
    expect(next.get("a")?.world.position[0]).toBe(99);
    expect(next.get("b")?.world.position[0]).toBe(100);
    expect(next.get("c")?.world.position[0]).toBe(102);
    expect(cache.stats().dirty).toBe(3);
  });

  it("preserves siblings when one branch changes", () => {
    const world = new World();
    world.addEntity("root");
    world.setComponent("root", "Transform", { position: [0, 0, 0] });
    world.addEntity("left");
    world.setComponent("left", "Transform", { position: [1, 0, 0], parent: "root" });
    world.addEntity("right");
    world.setComponent("right", "Transform", { position: [-1, 0, 0], parent: "root" });

    const cache = createHierarchyCache();
    const first = cache.resolveWorld(world);

    world.setComponent("left", "Transform", { position: [5, 0, 0], parent: "root" });
    const second = cache.resolveWorld(world);

    expect(second.get("left")).not.toBe(first.get("left"));
    expect(second.get("right")).toBe(first.get("right"));
    expect(second.get("root")).toBe(first.get("root"));
    expect(cache.stats()).toMatchObject({ dirty: 1, reused: 2 });
  });

  it("evicts cached entries when an entity loses Transform", () => {
    const world = new World();
    makeChain(world, ["a", "b"]);
    const cache = createHierarchyCache();
    cache.resolveWorld(world);
    expect(cache.size()).toBe(2);

    world.removeComponent("a", "Transform");
    cache.resolveWorld(world);
    expect(cache.size()).toBe(1);
    expect(cache.stats().evicted).toBe(1);
  });

  it("clears all cached state via clear()", () => {
    const world = new World();
    makeChain(world, ["a", "b"]);
    const cache = createHierarchyCache();
    const first = cache.resolveWorld(world);

    cache.clear();
    const second = cache.resolveWorld(world);

    expect(second.get("a")).not.toBe(first.get("a"));
    expect(cache.stats()).toMatchObject({ dirty: 2 });
  });

  it("matches the uncached resolver across N random mutation cycles (M16-cache-parity)", async () => {
    // Codex review of docs/research/ecs-compare-performance.md flagged
    // "derived cache, not a second ECS" as the architectural invariant.
    // This is the parity test that locks it in: feed both the cached
    // resolver and resolveWorldHierarchy the same World, mutate
    // randomly, and require they agree field-for-field every cycle.
    const { resolveWorldHierarchy } = await import("../../engine/core/transform/resolve");
    const world = new World();
    const ids: string[] = [];
    for (let i = 0; i < 24; i += 1) {
      const id = `n${i}`;
      ids.push(id);
      world.addEntity(id);
      const parent = i === 0 ? undefined : ids[Math.floor(Math.random() * i)];
      const transform: Record<string, unknown> = {
        position: [Math.random() * 10, Math.random() * 10, Math.random() * 10],
        rotation: [Math.random(), Math.random(), Math.random()],
        scale: [1 + Math.random(), 1 + Math.random(), 1 + Math.random()]
      };
      if (parent !== undefined) transform["parent"] = parent;
      world.setComponent(id, "Transform", transform);
    }

    const cache = createHierarchyCache();

    for (let cycle = 0; cycle < 25; cycle += 1) {
      // Mutate ~10% of entities each cycle.
      const mutateCount = Math.max(1, Math.floor(ids.length * 0.1));
      for (let m = 0; m < mutateCount; m += 1) {
        const id = ids[Math.floor(Math.random() * ids.length)] ?? ids[0]!;
        const previous = world.getComponent<Record<string, unknown>>(id, "Transform") ?? {};
        world.setComponent(id, "Transform", {
          ...previous,
          position: [Math.random() * 10, Math.random() * 10, Math.random() * 10]
        });
      }
      const cached = cache.resolveWorld(world);
      const direct = resolveWorldHierarchy(world);
      for (const id of ids) {
        const c = cached.get(id);
        const d = direct.get(id);
        expect(c).toBeDefined();
        expect(d).toBeDefined();
        for (let axis = 0; axis < 3; axis += 1) {
          expect(c?.world.position[axis]).toBeCloseTo(d?.world.position[axis] ?? 0, 9);
          expect(c?.world.rotation[axis]).toBeCloseTo(d?.world.rotation[axis] ?? 0, 9);
          expect(c?.world.scale[axis]).toBeCloseTo(d?.world.scale[axis] ?? 0, 9);
        }
      }
    }
  });

  it("matches the uncached resolver on the world transforms", async () => {
    const { resolveWorldHierarchy } = await import("../../engine/core/transform/resolve");
    const world = new World();
    makeChain(world, ["a", "b", "c", "d"]);
    const cache = createHierarchyCache();

    const cached = cache.resolveWorld(world);
    const direct = resolveWorldHierarchy(world);

    for (const id of ["a", "b", "c", "d"]) {
      expect(cached.get(id)?.world.position).toEqual(direct.get(id)?.world.position);
      expect(cached.get(id)?.world.rotation).toEqual(direct.get(id)?.world.rotation);
      expect(cached.get(id)?.world.scale).toEqual(direct.get(id)?.world.scale);
    }
  });
});
