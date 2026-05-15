// S54 RUNTIME-idle-rendering: World exposes a mutation counter that the
// runtime polls to decide whether `renderer.render()` should fire on
// frames in `on-demand` mode.

import { describe, expect, it } from "vitest";
import { World } from "../../engine/core/ecs/world";

describe("World.mutationCounter", () => {
  it("starts at zero on a fresh world", () => {
    const world = new World();
    expect(world.mutationCounter()).toBe(0);
  });

  it("bumps on addEntity / setComponent / removeComponent / removeEntity", () => {
    const world = new World();
    const start = world.mutationCounter();

    world.addEntity("a");
    const afterAdd = world.mutationCounter();
    expect(afterAdd).toBeGreaterThan(start);

    world.setComponent("a", "Transform", { position: [0, 0, 0] });
    const afterSet = world.mutationCounter();
    expect(afterSet).toBeGreaterThan(afterAdd);

    world.setComponent("a", "Transform", { position: [1, 0, 0] });
    expect(world.mutationCounter()).toBeGreaterThan(afterSet);

    world.removeComponent("a", "Transform");
    expect(world.mutationCounter()).toBeGreaterThan(afterSet + 1);

    const beforeRemove = world.mutationCounter();
    world.removeEntity("a");
    expect(world.mutationCounter()).toBeGreaterThan(beforeRemove);
  });

  it("does not bump on read-only operations", () => {
    const world = new World();
    world.addEntity("a");
    world.setComponent("a", "Transform", { position: [0, 0, 0] });
    const baseline = world.mutationCounter();

    world.hasEntity("a");
    world.entityCount();
    world.entityIds();
    world.getComponent("a", "Transform");
    world.hasComponent("a", "Transform");
    world.query(["Transform"]);

    expect(world.mutationCounter()).toBe(baseline);
  });

  it("does not bump on removeComponent of a missing component (no-op)", () => {
    const world = new World();
    world.addEntity("a");
    const baseline = world.mutationCounter();

    world.removeComponent("a", "NoSuchComponent");
    expect(world.mutationCounter()).toBe(baseline);
  });
});
