import { describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import {
  createMeshLifecycleSystem,
  RENDER_MESH_HANDLE
} from "../../engine/render/systems/mesh-lifecycle-system";
import type { MeshHandleRegistry } from "../../engine/render/mesh-handle-registry";

// Stub registry — avoids importing Three.js / a real WebGL device in node.
function stubRegistry(): MeshHandleRegistry & { acquired: number[]; released: number[] } {
  let next = 1;
  const map = new Map<string, number>();
  const acquired: number[] = [];
  const released: number[] = [];
  return {
    acquireFor(entityId, _mesh, _color) {
      const existing = map.get(entityId);
      if (existing !== undefined) return existing;
      const handle = next;
      next += 1;
      map.set(entityId, handle);
      acquired.push(handle);
      return handle;
    },
    release(entityId) {
      const handle = map.get(entityId);
      if (handle === undefined) return;
      released.push(handle);
      map.delete(entityId);
    },
    handleFor(entityId) {
      return map.get(entityId);
    },
    entityForHandle(handle) {
      for (const [id, h] of map) {
        if (h === handle) return id;
      }
      return undefined;
    },
    entityIds() {
      return map.keys();
    },
    size() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    acquired,
    released
  };
}

function ctx(world: World) {
  return {
    world,
    time: {
      elapsed: 0,
      dt: 1 / 60,
      fixedDt: 1 / 60,
      frameCount: 0,
      fixedStepCount: 0
    }
  } as const;
}

describe("MeshLifecycleSystem", () => {
  it("acquires a handle for each new MeshRenderer entity and writes RenderMeshHandle", () => {
    const world = new World();
    world.addEntity("a");
    world.setComponent("a", "MeshRenderer", { mesh: "box", color: "#fff" });
    world.addEntity("b");
    world.setComponent("b", "MeshRenderer", { mesh: "sphere" });

    const reg = stubRegistry();
    const system = createMeshLifecycleSystem(reg);
    system.frameUpdate?.(ctx(world));

    expect(reg.size()).toBe(2);
    expect(world.hasComponent("a", RENDER_MESH_HANDLE)).toBe(true);
    expect(world.hasComponent("b", RENDER_MESH_HANDLE)).toBe(true);
    expect(reg.acquired).toEqual([1, 2]);
  });

  it("releases the handle + removes RenderMeshHandle when MeshRenderer is gone", () => {
    const world = new World();
    world.addEntity("a");
    world.setComponent("a", "MeshRenderer", { mesh: "box" });

    const reg = stubRegistry();
    const system = createMeshLifecycleSystem(reg);
    system.frameUpdate?.(ctx(world));
    expect(world.hasComponent("a", RENDER_MESH_HANDLE)).toBe(true);

    world.removeComponent("a", "MeshRenderer");
    system.frameUpdate?.(ctx(world));

    expect(reg.size()).toBe(0);
    expect(reg.released).toEqual([1]);
    expect(world.hasComponent("a", RENDER_MESH_HANDLE)).toBe(false);
  });

  it("does not double-acquire entities seen on a previous frame", () => {
    const world = new World();
    world.addEntity("a");
    world.setComponent("a", "MeshRenderer", { mesh: "box" });

    const reg = stubRegistry();
    const system = createMeshLifecycleSystem(reg);
    system.frameUpdate?.(ctx(world));
    system.frameUpdate?.(ctx(world));
    system.frameUpdate?.(ctx(world));

    expect(reg.acquired).toEqual([1]);
    expect(reg.size()).toBe(1);
  });

  it("handles add-then-remove-then-add cleanly", () => {
    const world = new World();
    world.addEntity("a");
    world.setComponent("a", "MeshRenderer", { mesh: "box" });

    const reg = stubRegistry();
    const system = createMeshLifecycleSystem(reg);
    system.frameUpdate?.(ctx(world));
    world.removeComponent("a", "MeshRenderer");
    system.frameUpdate?.(ctx(world));
    world.setComponent("a", "MeshRenderer", { mesh: "sphere" });
    system.frameUpdate?.(ctx(world));

    expect(reg.acquired).toEqual([1, 2]);
    expect(reg.released).toEqual([1]);
    expect(reg.handleFor("a")).toBe(2);
  });
});
