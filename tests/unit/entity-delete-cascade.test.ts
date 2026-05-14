import { describe, expect, it } from "vitest";
import { World } from "../../engine/core/ecs/world";
import { applyCommand } from "../../engine/core/commands/command-queue";

const baseScene = {
  id: "test",
  entities: [
    { id: "root", components: { Transform: { position: [0, 0, 0] } } },
    { id: "child.a", components: { Transform: { parent: "root", position: [1, 0, 0] } } },
    { id: "child.b", components: { Transform: { parent: "root", position: [0, 1, 0] } } },
    {
      id: "grandchild.a1",
      components: { Transform: { parent: "child.a", position: [0, 0, 1] } }
    },
    { id: "unrelated", components: { Transform: { position: [9, 9, 9] } } }
  ]
};

describe("M16-cascade — entity.delete cascades to Transform children", () => {
  it("removes a single leaf without touching siblings", () => {
    const world = World.fromScene(baseScene);
    applyCommand(world, { kind: "entity.delete", entityId: "grandchild.a1" });
    const ids = world.entityIds().sort();
    expect(ids).toEqual(["child.a", "child.b", "root", "unrelated"]);
  });

  it("removes a parent + every transitive descendant", () => {
    const world = World.fromScene(baseScene);
    applyCommand(world, { kind: "entity.delete", entityId: "root" });
    expect(world.entityIds()).toEqual(["unrelated"]);
  });

  it("removes a middle node + its children but leaves siblings & ancestors alone", () => {
    const world = World.fromScene(baseScene);
    applyCommand(world, { kind: "entity.delete", entityId: "child.a" });
    const ids = world.entityIds().sort();
    expect(ids).toEqual(["child.b", "root", "unrelated"]);
  });

  it("no-op when the target entity does not exist", () => {
    const world = World.fromScene(baseScene);
    applyCommand(world, { kind: "entity.delete", entityId: "ghost" });
    expect(world.entityIds().sort()).toEqual([
      "child.a",
      "child.b",
      "grandchild.a1",
      "root",
      "unrelated"
    ]);
  });

  it("ignores parent fields that don't point at the deleted entity", () => {
    const world = World.fromScene({
      id: "test",
      entities: [
        { id: "a", components: { Transform: {} } },
        { id: "b", components: { Transform: { parent: "missing-ancestor" } } }
      ]
    });
    applyCommand(world, { kind: "entity.delete", entityId: "a" });
    expect(world.entityIds()).toEqual(["b"]);
  });
});
