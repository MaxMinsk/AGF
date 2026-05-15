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

  it("stays a no-op while every tagged caster is idle (S53 follow-up: don't break the initial bake)", () => {
    // The S53 BEACON follow-up: turning autoUpdate=false before
    // the first real movement left beacon-world without shadows
    // at startup. The fix: only take over once an actual LTW
    // change has been observed. Idle scenes keep three.js's
    // autoUpdate default the whole time.
    const adapter = stubAdapter();
    const world = new World();
    world.addEntity("car");
    world.setComponent("car", "ShadowCaster", { dynamic: true });
    world.setComponent("car", "LocalToWorld", {
      position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1]
    });

    const sys = createDynamicShadowSystem({ adapter });
    for (let i = 0; i < 5; i++) sys.frameUpdate?.(ctx(world));
    expect(adapter.autoUpdateCalls).toEqual([]);
    expect(adapter.invalidate.count).toBe(0);
  });

  it("takes over on the first real LTW change (disables autoUpdate + invalidates)", () => {
    const adapter = stubAdapter();
    const world = new World();
    world.addEntity("car");
    world.setComponent("car", "ShadowCaster", { dynamic: true });
    world.setComponent("car", "LocalToWorld", {
      position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1]
    });

    const sys = createDynamicShadowSystem({ adapter });
    // Idle phase — no DSS-side calls.
    sys.frameUpdate?.(ctx(world));
    sys.frameUpdate?.(ctx(world));
    expect(adapter.autoUpdateCalls).toEqual([]);
    expect(adapter.invalidate.count).toBe(0);

    // Move → DSS takes over: autoUpdate off + invalidate.
    world.setComponent("car", "LocalToWorld", {
      position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1]
    });
    sys.frameUpdate?.(ctx(world));
    expect(adapter.autoUpdateCalls).toEqual([false]);
    expect(adapter.invalidate.count).toBe(1);

    // Stationary post-takeover — no further invalidates.
    sys.frameUpdate?.(ctx(world));
    expect(adapter.invalidate.count).toBe(1);

    // Another move — invalidate fires.
    world.setComponent("car", "LocalToWorld", {
      position: [2, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1]
    });
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
    // Trigger a real movement so DSS engages.
    sys.frameUpdate?.(ctx(world));
    world.setComponent("car", "LocalToWorld", {
      position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1]
    });
    sys.frameUpdate?.(ctx(world));
    expect(adapter.autoUpdateCalls).toEqual([false]);

    // Remove the tag → restore autoUpdate.
    world.removeComponent("car", "ShadowCaster");
    sys.frameUpdate?.(ctx(world));
    expect(adapter.autoUpdateCalls).toEqual([false, true]);
  });
});
