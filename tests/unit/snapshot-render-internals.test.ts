import { describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import { snapshotWorld } from "../../engine/runtime/inspect";

const TIME = {
  elapsed: 0,
  dt: 1 / 60,
  fixedDt: 1 / 60,
  frameCount: 0,
  fixedStepCount: 0
};

describe("snapshotWorld (M21-g render internals flag)", () => {
  it("hides renderer-internal components by default", () => {
    const world = new World();
    world.addEntity("a");
    world.setComponent("a", "Transform", { position: [1, 2, 3] });
    world.setComponent("a", "MeshRenderer", { mesh: "box" });
    // Renderer-internal — must be hidden in default snapshot.
    world.setComponent("a", "LocalToWorld", {
      position: [1, 2, 3],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    });
    world.setComponent("a", "RenderMeshHandle", { id: 1 });
    world.setComponent("a", "AppliedGeometryRef", { ref: "x.glb", status: "applied" });

    const snap = snapshotWorld(world, TIME);
    const entity = snap.entities[0];
    expect(entity).toBeDefined();
    expect(entity?.components).toHaveProperty("Transform");
    expect(entity?.components).toHaveProperty("MeshRenderer");
    expect(entity?.components).not.toHaveProperty("LocalToWorld");
    expect(entity?.components).not.toHaveProperty("RenderMeshHandle");
    expect(entity?.components).not.toHaveProperty("AppliedGeometryRef");
  });

  it("includes renderer-internal components when includeRenderInternals is true", () => {
    const world = new World();
    world.addEntity("a");
    world.setComponent("a", "Transform", { position: [0, 0, 0] });
    world.setComponent("a", "LocalToWorld", {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    });
    world.setComponent("a", "ActiveCamera", {});

    const snap = snapshotWorld(world, TIME, { includeRenderInternals: true });
    const entity = snap.entities[0];
    expect(entity?.components).toHaveProperty("LocalToWorld");
    expect(entity?.components).toHaveProperty("ActiveCamera");
  });
});
