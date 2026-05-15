// S54 RUNTIME-progressive-loading: the gate helper `criticalAssetsReady`
// lets `rendererReady` block on a specific list of refs. It is exercised
// here against a real `World` populated with synthetic `AppliedRef`
// components — `startRuntime` itself needs a canvas to spin up, so the
// full integration is covered by the Playwright smoke runs.

import { describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import { criticalAssetsReady } from "../../engine/runtime/start";

const MATERIAL_REF = "runtime/materials/hero.material.json";
const MESH_REF = "runtime/models/hero.glb";

describe("criticalAssetsReady gate", () => {
  it("returns true immediately when the list is empty", () => {
    const world = new World();
    expect(criticalAssetsReady(world, [])).toBe(true);
  });

  it("blocks while any critical ref is still pending", () => {
    const world = new World();
    world.addEntity("hero");
    world.setComponent("hero", "AppliedMaterialRef", { ref: MATERIAL_REF, status: "pending" });

    expect(criticalAssetsReady(world, [MATERIAL_REF])).toBe(false);
  });

  it("releases once every critical ref is applied (or failed)", () => {
    const world = new World();
    world.addEntity("hero");
    world.setComponent("hero", "AppliedMaterialRef", { ref: MATERIAL_REF, status: "applied" });
    world.setComponent("hero", "AppliedGeometryRef", { ref: MESH_REF, status: "failed" });

    expect(criticalAssetsReady(world, [MATERIAL_REF, MESH_REF])).toBe(true);
  });

  it("ignores non-critical asset states entirely", () => {
    const world = new World();
    world.addEntity("sidekick");
    world.setComponent("sidekick", "AppliedMaterialRef", {
      ref: "runtime/materials/sidekick.material.json",
      status: "pending"
    });
    world.addEntity("hero");
    world.setComponent("hero", "AppliedMaterialRef", { ref: MATERIAL_REF, status: "applied" });

    expect(criticalAssetsReady(world, [MATERIAL_REF])).toBe(true);
  });
});
