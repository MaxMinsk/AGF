import { describe, expect, it } from "vitest";
import { diffScenes } from "../../engine/core/commands/scene-diff";
import { applyCommand } from "../../engine/core/commands/command-queue";
import { World } from "../../engine/core/ecs/world";
import type { SceneInput } from "../../engine/core/ecs/types";

const baseScene: SceneInput = {
  id: "start",
  entities: [
    {
      id: "camera.main",
      components: {
        Camera: { kind: "perspective", active: true },
        Transform: { position: [0, 2, 5] }
      }
    },
    {
      id: "cube",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0] },
        MeshRenderer: { mesh: "box", color: "#f7c948" }
      }
    }
  ]
};

describe("diffScenes", () => {
  it("returns no commands when scenes are equal", () => {
    expect(diffScenes(baseScene, baseScene)).toEqual([]);
  });

  it("emits entity.delete for entities removed in next", () => {
    const next: SceneInput = {
      id: "start",
      entities: [baseScene.entities[0]!]
    };

    const commands = diffScenes(baseScene, next);

    expect(commands).toEqual([{ kind: "entity.delete", entityId: "cube" }]);
  });

  it("emits entity.create with initial components for new entities", () => {
    const next: SceneInput = {
      id: "start",
      entities: [
        ...baseScene.entities,
        {
          id: "sphere",
          components: { MeshRenderer: { mesh: "sphere" } }
        }
      ]
    };

    const commands = diffScenes(baseScene, next);

    expect(commands).toEqual([
      {
        kind: "entity.create",
        entityId: "sphere",
        components: { MeshRenderer: { mesh: "sphere" } }
      }
    ]);
  });

  it("emits component.set when a component value changes", () => {
    const next: SceneInput = {
      id: "start",
      entities: [
        baseScene.entities[0]!,
        {
          id: "cube",
          components: {
            Transform: { position: [0, 0, 0], rotation: [0, 0, 0] },
            MeshRenderer: { mesh: "box", color: "#ff0000" }
          }
        }
      ]
    };

    const commands = diffScenes(baseScene, next);

    expect(commands).toEqual([
      {
        kind: "component.set",
        entityId: "cube",
        component: "MeshRenderer",
        data: { mesh: "box", color: "#ff0000" }
      }
    ]);
  });

  it("emits component.remove when a component disappears from an existing entity", () => {
    const next: SceneInput = {
      id: "start",
      entities: [
        baseScene.entities[0]!,
        {
          id: "cube",
          components: {
            Transform: { position: [0, 0, 0], rotation: [0, 0, 0] }
          }
        }
      ]
    };

    const commands = diffScenes(baseScene, next);

    expect(commands).toEqual([
      { kind: "component.remove", entityId: "cube", component: "MeshRenderer" }
    ]);
  });

  it("emits component.set when a brand new component is added to an existing entity", () => {
    const next: SceneInput = {
      id: "start",
      entities: [
        baseScene.entities[0]!,
        {
          id: "cube",
          components: {
            Transform: { position: [0, 0, 0], rotation: [0, 0, 0] },
            MeshRenderer: { mesh: "box", color: "#f7c948" },
            Spin: { axis: "y", speed: 45 }
          }
        }
      ]
    };

    const commands = diffScenes(baseScene, next);

    expect(commands).toEqual([
      {
        kind: "component.set",
        entityId: "cube",
        component: "Spin",
        data: { axis: "y", speed: 45 }
      }
    ]);
  });

  it("treats object key order as irrelevant", () => {
    const next: SceneInput = {
      id: "start",
      entities: [
        {
          id: "camera.main",
          components: {
            Transform: { position: [0, 2, 5] },
            Camera: { active: true, kind: "perspective" }
          }
        },
        baseScene.entities[1]!
      ]
    };

    expect(diffScenes(baseScene, next)).toEqual([]);
  });

  it("applies cleanly to a world built from the previous scene", () => {
    const next: SceneInput = {
      id: "start",
      entities: [
        baseScene.entities[0]!,
        {
          id: "cube",
          components: {
            Transform: { position: [1, 0, 0] },
            MeshRenderer: { mesh: "box", color: "#00ff00" }
          }
        },
        {
          id: "sphere",
          components: { MeshRenderer: { mesh: "sphere" } }
        }
      ]
    };

    const world = World.fromScene(baseScene);
    const commands = diffScenes(baseScene, next);
    for (const command of commands) {
      applyCommand(world, command);
    }

    expect(world.entityCount()).toBe(3);
    expect(world.getComponent("cube", "Transform")).toEqual({ position: [1, 0, 0] });
    expect(world.getComponent("cube", "MeshRenderer")).toEqual({ mesh: "box", color: "#00ff00" });
    expect(world.hasEntity("sphere")).toBe(true);
  });
});
