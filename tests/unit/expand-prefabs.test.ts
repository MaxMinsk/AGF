import { describe, expect, it } from "vitest";
import {
  expandScenePrefabs,
  type PrefabDefinition,
  type SceneWithInstances
} from "../../engine/core/scene/expand-prefabs";

const corePrefab: PrefabDefinition = {
  id: "pickup-core",
  components: {
    Transform: { position: [0, 0.5, 0] },
    MeshRenderer: { mesh: "sphere", color: "#88ccff" }
  }
};

const registry = new Map<string, PrefabDefinition>([[corePrefab.id, corePrefab]]);

describe("expandScenePrefabs", () => {
  it("returns the original scene unchanged when there are no instances", () => {
    const scene: SceneWithInstances = {
      id: "start",
      entities: [{ id: "camera.main", components: { Transform: { position: [0, 2, 5] } } }]
    };
    const result = expandScenePrefabs(scene, registry);
    expect(result.diagnostics).toEqual([]);
    expect(result.scene.entities).toHaveLength(1);
    expect(result.scene.entities[0]?.id).toBe("camera.main");
  });

  it("expands an instance into a regular entity carrying the prefab's components", () => {
    const scene: SceneWithInstances = {
      id: "start",
      entities: [],
      instances: [{ id: "core.a", prefab: "pickup-core" }]
    };
    const result = expandScenePrefabs(scene, registry);
    expect(result.diagnostics).toEqual([]);
    expect(result.scene.entities).toHaveLength(1);
    expect(result.scene.entities[0]).toMatchObject({
      id: "core.a",
      components: {
        Transform: { position: [0, 0.5, 0] },
        MeshRenderer: { mesh: "sphere", color: "#88ccff" }
      }
    });
  });

  it("merges per-instance overrides on top of the prefab (shallow)", () => {
    const scene: SceneWithInstances = {
      id: "start",
      entities: [],
      instances: [
        {
          id: "core.b",
          prefab: "pickup-core",
          overrides: { Transform: { position: [3, 0.5, 0] }, Pickable: { radius: 1.2 } }
        }
      ]
    };
    const result = expandScenePrefabs(scene, registry);
    expect(result.diagnostics).toEqual([]);
    const entity = result.scene.entities[0];
    expect(entity?.components["Transform"]).toEqual({ position: [3, 0.5, 0] });
    expect(entity?.components["MeshRenderer"]).toEqual({ mesh: "sphere", color: "#88ccff" });
    expect(entity?.components["Pickable"]).toEqual({ radius: 1.2 });
  });

  it("emits AGF_SCENE_INSTANCE_PREFAB_MISSING for unknown prefab refs", () => {
    const scene: SceneWithInstances = {
      id: "start",
      entities: [],
      instances: [{ id: "ghost", prefab: "does-not-exist" }]
    };
    const result = expandScenePrefabs(scene, registry);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      severity: "error",
      code: "AGF_SCENE_INSTANCE_PREFAB_MISSING",
      instanceIndex: 0
    });
    expect(result.scene.entities).toEqual([]);
  });

  it("emits AGF_SCENE_INSTANCE_DUPLICATE_ID when an instance id collides with an entity", () => {
    const scene: SceneWithInstances = {
      id: "start",
      entities: [{ id: "core.a", components: { Transform: {} } }],
      instances: [{ id: "core.a", prefab: "pickup-core" }]
    };
    const result = expandScenePrefabs(scene, registry);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: "AGF_SCENE_INSTANCE_DUPLICATE_ID",
      instanceIndex: 0
    });
    expect(result.scene.entities).toHaveLength(1);
  });

  it("does not mutate the input scene", () => {
    const scene: SceneWithInstances = {
      id: "start",
      entities: [],
      instances: [{ id: "core.a", prefab: "pickup-core" }]
    };
    const result = expandScenePrefabs(scene, registry);
    expect(result.scene).not.toBe(scene);
    expect(scene.entities).toHaveLength(0);
  });

  it("preserves top-level scene fields like `environment` and drops only `instances`", () => {
    const scene: SceneWithInstances = {
      id: "start",
      entities: [],
      environment: { kind: "hdr", url: "runtime/hdr/foo.hdr", intensity: 0.9 },
      instances: [{ id: "core.a", prefab: "pickup-core" }]
    };
    const result = expandScenePrefabs(scene, registry);
    expect(result.scene.environment).toEqual({
      kind: "hdr",
      url: "runtime/hdr/foo.hdr",
      intensity: 0.9
    });
    expect((result.scene as { instances?: unknown }).instances).toBeUndefined();
  });
});
