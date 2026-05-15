// M3-c-load — integration of `expandScenePrefabs` with `World.fromScene`.
//
// `startRuntime` performs this exact two-step (expand → fromScene) before
// any system runs. The renderer path needs a canvas to spin up, so the
// glue is unit-tested here without booting Three.js.

import { describe, expect, it } from "vitest";

import type { SceneInput } from "../../engine/core/ecs/types";
import { World } from "../../engine/core/ecs/world";
import {
  expandScenePrefabs,
  type PrefabDefinition
} from "../../engine/core/scene/expand-prefabs";

const corePrefab: PrefabDefinition = {
  id: "pickup-core",
  components: {
    Transform: { position: [0, 0.5, 0] },
    MeshRenderer: { mesh: "sphere", color: "#88ccff" }
  }
};

const registry = new Map<string, PrefabDefinition>([[corePrefab.id, corePrefab]]);

describe("scene load with prefab instances", () => {
  it("materialises instances as world entities with the merged components", () => {
    const scene: SceneInput = {
      id: "start",
      entities: [
        {
          id: "camera.main",
          components: {
            Transform: { position: [0, 2, 5] },
            Camera: { kind: "perspective", active: true }
          }
        }
      ],
      instances: [
        { id: "core.a", prefab: "pickup-core" },
        {
          id: "core.b",
          prefab: "pickup-core",
          overrides: { Transform: { position: [3, 0.5, 0] } }
        }
      ]
    };

    const expansion = expandScenePrefabs(scene, registry);
    expect(expansion.diagnostics).toEqual([]);

    const world = World.fromScene(expansion.scene);
    expect(world.hasEntity("camera.main")).toBe(true);
    expect(world.hasEntity("core.a")).toBe(true);
    expect(world.hasEntity("core.b")).toBe(true);

    const coreA = world.getComponent<{ position: ReadonlyArray<number> }>(
      "core.a",
      "Transform"
    );
    expect(coreA?.position).toEqual([0, 0.5, 0]);

    const coreB = world.getComponent<{ position: ReadonlyArray<number> }>(
      "core.b",
      "Transform"
    );
    // Shallow merge replaces `position` with the override value.
    expect(coreB?.position).toEqual([3, 0.5, 0]);

    const coreBMesh = world.getComponent<{ mesh: string; color: string }>(
      "core.b",
      "MeshRenderer"
    );
    expect(coreBMesh).toEqual({ mesh: "sphere", color: "#88ccff" });
  });

  it("skips instances that reference unknown prefabs and surfaces them as diagnostics", () => {
    const scene: SceneInput = {
      id: "start",
      entities: [],
      instances: [
        { id: "ok", prefab: "pickup-core" },
        { id: "missing", prefab: "ghost" }
      ]
    };

    const expansion = expandScenePrefabs(scene, registry);
    const codes = expansion.diagnostics.map((d) => d.code);
    expect(codes).toContain("AGF_SCENE_INSTANCE_PREFAB_MISSING");

    const world = World.fromScene(expansion.scene);
    expect(world.hasEntity("ok")).toBe(true);
    expect(world.hasEntity("missing")).toBe(false);
  });
});
