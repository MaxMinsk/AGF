import { describe, expect, it } from "vitest";
import { World } from "../../engine/core/ecs/world";

describe("World", () => {
  it("adds, checks and removes entities", () => {
    const world = new World();
    world.addEntity("hero");

    expect(world.hasEntity("hero")).toBe(true);
    expect(world.entityCount()).toBe(1);

    world.removeEntity("hero");

    expect(world.hasEntity("hero")).toBe(false);
    expect(world.entityCount()).toBe(0);
  });

  it("rejects duplicate entity ids", () => {
    const world = new World();
    world.addEntity("hero");

    expect(() => world.addEntity("hero")).toThrow(/already exists/);
  });

  it("rejects components on missing entities", () => {
    const world = new World();

    expect(() => world.setComponent("ghost", "Transform", { position: [0, 0, 0] })).toThrow(
      /missing entity/
    );
  });

  it("sets, reads and removes components", () => {
    const world = new World();
    world.addEntity("hero");
    world.setComponent("hero", "Transform", { position: [1, 2, 3] });

    expect(world.hasComponent("hero", "Transform")).toBe(true);
    expect(world.getComponent("hero", "Transform")).toEqual({ position: [1, 2, 3] });

    world.removeComponent("hero", "Transform");

    expect(world.hasComponent("hero", "Transform")).toBe(false);
    expect(world.getComponent("hero", "Transform")).toBeUndefined();
  });

  it("queries entities by component intersection", () => {
    const world = new World();
    world.addEntity("a");
    world.addEntity("b");
    world.addEntity("c");
    world.setComponent("a", "Transform", {});
    world.setComponent("a", "MeshRenderer", {});
    world.setComponent("b", "Transform", {});
    world.setComponent("c", "MeshRenderer", {});

    expect(world.query(["Transform"]).sort()).toEqual(["a", "b"]);
    expect(world.query(["Transform", "MeshRenderer"])).toEqual(["a"]);
    expect(world.query(["Camera"])).toEqual([]);
  });

  it("picks the smallest component store as the pivot for multi-component queries", () => {
    const world = new World();
    for (let index = 0; index < 100; index += 1) {
      const id = `entity${index}`;
      world.addEntity(id);
      world.setComponent(id, "Transform", {});
      if (index < 3) {
        world.setComponent(id, "Hazard", {});
      }
    }

    const matches = world.query(["Transform", "Hazard"]).sort();
    expect(matches).toEqual(["entity0", "entity1", "entity2"]);
  });

  it("short-circuits when any requested component has no store", () => {
    const world = new World();
    world.addEntity("a");
    world.setComponent("a", "Transform", {});

    expect(world.query(["Transform", "Missing"])).toEqual([]);
  });

  it("returns all entities for an empty query", () => {
    const world = new World();
    world.addEntity("a");
    world.addEntity("b");

    expect(world.query([]).sort()).toEqual(["a", "b"]);
  });

  it("drops all components when an entity is removed", () => {
    const world = new World();
    world.addEntity("hero");
    world.setComponent("hero", "Transform", {});
    world.setComponent("hero", "MeshRenderer", {});

    world.removeEntity("hero");

    expect(world.getComponent("hero", "Transform")).toBeUndefined();
    expect(world.getComponent("hero", "MeshRenderer")).toBeUndefined();
    expect(world.query(["Transform"])).toEqual([]);
  });

  it("builds a world from a normalized scene", () => {
    const world = World.fromScene({
      id: "start",
      entities: [
        {
          id: "camera.main",
          components: {
            Camera: { kind: "perspective" },
            Transform: { position: [0, 0, 0] }
          }
        },
        {
          id: "cube",
          components: {
            MeshRenderer: { mesh: "box" },
            Transform: { position: [1, 0, 0] }
          }
        }
      ]
    });

    expect(world.entityCount()).toBe(2);
    expect(world.query(["Transform"]).sort()).toEqual(["camera.main", "cube"]);
    expect(world.query(["MeshRenderer"])).toEqual(["cube"]);
    expect(world.componentNames().sort()).toEqual(["Camera", "MeshRenderer", "Transform"]);
  });
});
