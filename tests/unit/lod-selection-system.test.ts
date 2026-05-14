import { describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import { createLodSelectionSystem } from "../../engine/render/systems/lod-selection-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  };
}

function setupScene(): World {
  const world = new World();
  world.addEntity("camera");
  world.setComponent("camera", "Transform", { position: [0, 0, 0] });
  world.setComponent("camera", "ActiveCamera", {});
  world.addEntity("tree");
  world.setComponent("tree", "Transform", { position: [10, 0, 0] });
  world.setComponent("tree", "MeshRenderer", { mesh: "placeholder" });
  return world;
}

describe("LodSelectionSystem (M17-lod)", () => {
  it("picks the highest-detail level when the entity is closer than maxDistance", () => {
    const world = setupScene();
    world.setComponent("tree", "LOD", {
      levels: [
        { maxDistance: 15, mesh: "tree-hi" },
        { maxDistance: 50, mesh: "tree-lo" }
      ]
    });
    const system = createLodSelectionSystem();
    system.frameUpdate?.(ctx(world));
    expect(world.getComponent<{ mesh: string }>("tree", "MeshRenderer")?.mesh).toBe("tree-hi");
  });

  it("falls back to the cheapest level by default when past every threshold", () => {
    const world = setupScene();
    world.setComponent("tree", "Transform", { position: [100, 0, 0] });
    world.setComponent("tree", "LOD", {
      levels: [
        { maxDistance: 15, mesh: "tree-hi" },
        { maxDistance: 50, mesh: "tree-lo" }
      ]
    });
    const system = createLodSelectionSystem();
    system.frameUpdate?.(ctx(world));
    expect(world.getComponent<{ mesh: string }>("tree", "MeshRenderer")?.mesh).toBe("tree-lo");
  });

  it("hides the entity when fallback is `hide` and the camera is out of range", () => {
    const world = setupScene();
    world.setComponent("tree", "Transform", { position: [100, 0, 0] });
    world.setComponent("tree", "LOD", {
      levels: [{ maxDistance: 15, mesh: "tree-hi" }],
      fallback: "hide"
    });
    const system = createLodSelectionSystem();
    system.frameUpdate?.(ctx(world));
    expect(world.hasComponent("tree", "MeshRenderer")).toBe(false);
    expect(world.hasComponent("tree", "LodHidden")).toBe(true);
  });

  it("restores MeshRenderer when a previously hidden entity comes back into range", () => {
    const world = setupScene();
    world.setComponent("tree", "Transform", { position: [100, 0, 0] });
    world.setComponent("tree", "LOD", {
      levels: [{ maxDistance: 15, mesh: "tree-hi" }],
      fallback: "hide"
    });
    const system = createLodSelectionSystem();
    system.frameUpdate?.(ctx(world));
    expect(world.hasComponent("tree", "MeshRenderer")).toBe(false);

    // Move tree back near the camera.
    world.setComponent("tree", "Transform", { position: [5, 0, 0] });
    system.frameUpdate?.(ctx(world));
    expect(world.getComponent<{ mesh: string }>("tree", "MeshRenderer")?.mesh).toBe("tree-hi");
    expect(world.hasComponent("tree", "LodHidden")).toBe(false);
  });

  it("skips re-writing MeshRenderer when the chosen level didn't change", () => {
    const world = setupScene();
    world.setComponent("tree", "LOD", {
      levels: [{ maxDistance: 50, mesh: "tree-hi" }]
    });
    const system = createLodSelectionSystem();
    system.frameUpdate?.(ctx(world));
    const first = world.getComponent("tree", "MeshRenderer");
    system.frameUpdate?.(ctx(world));
    const second = world.getComponent("tree", "MeshRenderer");
    expect(second).toBe(first);
  });
});
