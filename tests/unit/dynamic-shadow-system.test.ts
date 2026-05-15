// S52 M21-shadow-static-caster-tag — DynamicShadowSystem contract.
//
// The system is dormant when no entity carries `ShadowCaster { dynamic: true }`,
// flips `setShadowMapAutoUpdate(false)` once it sees the first dynamic
// caster, then `invalidateShadowMap()` whenever a tagged entity's LTW
// changes. Restores autoUpdate when the tag set empties.

import { describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import { createDynamicShadowSystem } from "../../engine/render/systems/dynamic-shadow-system";
import type { ThreeRenderAdapter } from "../../engine/render/three-render-adapter";

// Wrap the counter in an object so Object.assign keeps a single
// reference shared between the closure and the test reader. A bare
// primitive would be copied by Object.assign.
type Spy = {
  autoUpdateCalls: boolean[];
  invalidate: { count: number };
};

function stubAdapter(): Spy & ThreeRenderAdapter {
  const spy: Spy = { autoUpdateCalls: [], invalidate: { count: 0 } };
  return Object.assign({} as unknown as ThreeRenderAdapter, spy, {
    setShadowMapAutoUpdate(enabled: boolean): void {
      spy.autoUpdateCalls.push(enabled);
    },
    invalidateShadowMap(): void {
      spy.invalidate.count += 1;
    }
  } as unknown as ThreeRenderAdapter);
}

function ctx(world: World) {
  return {
    world,
    time: { elapsed: 0, dt: 1 / 60, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  } as const;
}

describe("DynamicShadowSystem (S52)", () => {
  it("is a no-op when no entity carries ShadowCaster { dynamic: true }", () => {
    const adapter = stubAdapter();
    const world = new World();
    world.addEntity("box");
    world.setComponent("box", "ShadowCaster", { dynamic: false });
    world.setComponent("box", "LocalToWorld", {
      position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1]
    });

    const sys = createDynamicShadowSystem({ adapter });
    sys.frameUpdate?.(ctx(world));
    sys.frameUpdate?.(ctx(world));

    expect(adapter.autoUpdateCalls).toEqual([]);
    expect(adapter.invalidate.count).toBe(0);
  });

  it("disables autoUpdate the first frame it sees a dynamic-tagged caster", () => {
    const adapter = stubAdapter();
    const world = new World();
    world.addEntity("car");
    world.setComponent("car", "ShadowCaster", { dynamic: true });
    world.setComponent("car", "LocalToWorld", {
      position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1]
    });

    const sys = createDynamicShadowSystem({ adapter });
    sys.frameUpdate?.(ctx(world));

    expect(adapter.autoUpdateCalls).toEqual([false]);
    // First-sighting counts as dirty so the initial bake happens.
    expect(adapter.invalidate.count).toBe(1);
  });

  it("calls invalidateShadowMap only on frames where a dynamic caster moved", () => {
    const adapter = stubAdapter();
    const world = new World();
    world.addEntity("car");
    world.setComponent("car", "ShadowCaster", { dynamic: true });
    world.setComponent("car", "LocalToWorld", {
      position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1]
    });

    const sys = createDynamicShadowSystem({ adapter });
    sys.frameUpdate?.(ctx(world));
    expect(adapter.invalidate.count).toBe(1); // initial bake

    // Stationary frame — no movement → no further invalidate.
    sys.frameUpdate?.(ctx(world));
    expect(adapter.invalidate.count).toBe(1);

    // Move the car → invalidate fires.
    world.setComponent("car", "LocalToWorld", {
      position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1]
    });
    sys.frameUpdate?.(ctx(world));
    expect(adapter.invalidate.count).toBe(2);

    // Stationary again.
    sys.frameUpdate?.(ctx(world));
    expect(adapter.invalidate.count).toBe(2);
  });

  it("does NOT invalidate when a static (untagged or dynamic:false) entity moves", () => {
    const adapter = stubAdapter();
    const world = new World();
    world.addEntity("car");
    world.setComponent("car", "ShadowCaster", { dynamic: true });
    world.setComponent("car", "LocalToWorld", {
      position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1]
    });
    world.addEntity("building");
    world.setComponent("building", "ShadowCaster", { dynamic: false });
    world.setComponent("building", "LocalToWorld", {
      position: [10, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1]
    });

    const sys = createDynamicShadowSystem({ adapter });
    sys.frameUpdate?.(ctx(world));
    const baseline = adapter.invalidate.count;

    // Move the static building. Should NOT invalidate.
    world.setComponent("building", "LocalToWorld", {
      position: [11, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1]
    });
    sys.frameUpdate?.(ctx(world));
    expect(adapter.invalidate.count).toBe(baseline);
  });

  it("restores autoUpdate=true when the last dynamic caster loses its tag", () => {
    const adapter = stubAdapter();
    const world = new World();
    world.addEntity("car");
    world.setComponent("car", "ShadowCaster", { dynamic: true });
    world.setComponent("car", "LocalToWorld", {
      position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1]
    });

    const sys = createDynamicShadowSystem({ adapter });
    sys.frameUpdate?.(ctx(world));
    expect(adapter.autoUpdateCalls).toEqual([false]);

    // Remove the tag.
    world.removeComponent("car", "ShadowCaster");
    sys.frameUpdate?.(ctx(world));
    expect(adapter.autoUpdateCalls).toEqual([false, true]);
  });
});
