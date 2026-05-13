import { describe, expect, it } from "vitest";
import { CommandQueue, applyCommand } from "../../engine/core/commands/command-queue";
import { World } from "../../engine/core/ecs/world";

describe("CommandQueue", () => {
  it("creates entities with initial components", () => {
    const world = new World();
    const queue = new CommandQueue();
    queue.enqueue({
      kind: "entity.create",
      entityId: "hero",
      components: { Transform: { position: [0, 1, 0] } }
    });

    queue.drainInto(world);

    expect(world.hasEntity("hero")).toBe(true);
    expect(world.getComponent("hero", "Transform")).toEqual({ position: [0, 1, 0] });
  });

  it("sets components on existing entities", () => {
    const world = new World();
    world.addEntity("hero");
    const queue = new CommandQueue();
    queue.enqueue({
      kind: "component.set",
      entityId: "hero",
      component: "Health",
      data: { hp: 10 }
    });

    queue.drainInto(world);

    expect(world.getComponent("hero", "Health")).toEqual({ hp: 10 });
  });

  it("deletes entities", () => {
    const world = new World();
    world.addEntity("hero");
    const queue = new CommandQueue();
    queue.enqueue({ kind: "entity.delete", entityId: "hero" });

    queue.drainInto(world);

    expect(world.hasEntity("hero")).toBe(false);
  });

  it("replaces world contents on scene.load", () => {
    const world = new World();
    world.addEntity("stale");
    const queue = new CommandQueue();
    queue.enqueue({
      kind: "scene.load",
      scene: {
        id: "next",
        entities: [
          {
            id: "cube",
            components: { MeshRenderer: { mesh: "box" } }
          }
        ]
      }
    });

    queue.drainInto(world);

    expect(world.hasEntity("stale")).toBe(false);
    expect(world.hasEntity("cube")).toBe(true);
    expect(world.getComponent("cube", "MeshRenderer")).toEqual({ mesh: "box" });
  });

  it("preserves application order in the log", () => {
    const world = new World();
    const queue = new CommandQueue();
    queue.enqueue({ kind: "entity.create", entityId: "a" });
    queue.enqueue({ kind: "entity.create", entityId: "b" });
    queue.enqueue({
      kind: "component.set",
      entityId: "a",
      component: "Tag",
      data: { value: 1 }
    });

    queue.drainInto(world);

    const log = queue.log();
    expect(log.map((entry) => entry.index)).toEqual([0, 1, 2]);
    expect(log.map((entry) => entry.command.kind)).toEqual([
      "entity.create",
      "entity.create",
      "component.set"
    ]);
  });

  it("drains pending commands once", () => {
    const world = new World();
    const queue = new CommandQueue();
    queue.enqueue({ kind: "entity.create", entityId: "a" });

    queue.drainInto(world);

    expect(queue.pendingCount()).toBe(0);

    queue.drainInto(world);

    expect(queue.log().length).toBe(1);
  });

  it("applies a command directly without a queue", () => {
    const world = new World();
    applyCommand(world, { kind: "entity.create", entityId: "hero" });

    expect(world.hasEntity("hero")).toBe(true);
  });

  it("removes a single component without touching the entity", () => {
    const world = new World();
    world.addEntity("hero");
    world.setComponent("hero", "Transform", { position: [0, 0, 0] });
    world.setComponent("hero", "MeshRenderer", { mesh: "box" });
    const queue = new CommandQueue();
    queue.enqueue({ kind: "component.remove", entityId: "hero", component: "MeshRenderer" });

    queue.drainInto(world);

    expect(world.hasEntity("hero")).toBe(true);
    expect(world.getComponent("hero", "MeshRenderer")).toBeUndefined();
    expect(world.getComponent("hero", "Transform")).toEqual({ position: [0, 0, 0] });
  });
});
