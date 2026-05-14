import { describe, expect, it } from "vitest";

import { World } from "../../engine/core/ecs/world";
import { createBeaconLightSystem } from "../../examples/beacon-world/src/systems/beacon-light-system";

function ctx(world: World) {
  return {
    world,
    time: { elapsed: 0, dt: 1 / 60, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  } as const;
}

function makeScene(): World {
  const world = new World();
  world.addEntity("beacon.west");
  world.setComponent("beacon.west", "Repairable", {
    accepts: "core",
    repaired: false
  });
  world.addEntity("light.beacon.west");
  world.setComponent("light.beacon.west", "Light", {
    kind: "point",
    color: "#4af0a8",
    intensity: 0,
    distance: 10,
    decay: 1.4
  });
  world.setComponent("light.beacon.west", "BeaconLight", {
    beaconId: "beacon.west",
    repairedIntensity: 60,
    brokenIntensity: 0
  });
  return world;
}

describe("BeaconLightSystem", () => {
  it("keeps the light dark while the beacon is broken", () => {
    const world = makeScene();
    const system = createBeaconLightSystem();
    system.frameUpdate?.(ctx(world));
    const light = world.getComponent<{ intensity: number }>("light.beacon.west", "Light");
    expect(light?.intensity).toBe(0);
  });

  it("flips intensity to repairedIntensity the frame after the beacon is repaired", () => {
    const world = makeScene();
    const system = createBeaconLightSystem();
    system.frameUpdate?.(ctx(world));

    // Simulate what pickup-system does on a successful deposit.
    const repair = world.getComponent<Record<string, unknown>>("beacon.west", "Repairable");
    world.setComponent("beacon.west", "Repairable", { ...repair, repaired: true });
    system.frameUpdate?.(ctx(world));

    const light = world.getComponent<{ intensity: number; kind: string }>(
      "light.beacon.west",
      "Light"
    );
    expect(light?.intensity).toBe(60);
    expect(light?.kind).toBe("point");
  });

  it("falls back to broken intensity on de-repair (next round)", () => {
    const world = makeScene();
    const system = createBeaconLightSystem();
    const repair = world.getComponent<Record<string, unknown>>("beacon.west", "Repairable")!;
    world.setComponent("beacon.west", "Repairable", { ...repair, repaired: true });
    system.frameUpdate?.(ctx(world));
    expect(world.getComponent<{ intensity: number }>("light.beacon.west", "Light")?.intensity).toBe(60);

    world.setComponent("beacon.west", "Repairable", { ...repair, repaired: false });
    system.frameUpdate?.(ctx(world));
    expect(world.getComponent<{ intensity: number }>("light.beacon.west", "Light")?.intensity).toBe(0);
  });

  it("uses defaults when BeaconLight omits intensity fields", () => {
    const world = new World();
    world.addEntity("beacon.x");
    world.setComponent("beacon.x", "Repairable", { accepts: "core", repaired: true });
    world.addEntity("light.x");
    world.setComponent("light.x", "Light", { kind: "point", intensity: 0 });
    world.setComponent("light.x", "BeaconLight", { beaconId: "beacon.x" });

    createBeaconLightSystem().frameUpdate?.(ctx(world));
    const light = world.getComponent<{ intensity: number }>("light.x", "Light");
    expect(light?.intensity).toBe(12); // DEFAULT_REPAIRED
  });

  it("preserves color, distance, decay when writing intensity", () => {
    const world = makeScene();
    createBeaconLightSystem().frameUpdate?.(ctx(world));
    // Repair, then check the post-write Light component still has every other field.
    const repair = world.getComponent<Record<string, unknown>>("beacon.west", "Repairable")!;
    world.setComponent("beacon.west", "Repairable", { ...repair, repaired: true });
    createBeaconLightSystem().frameUpdate?.(ctx(world));
    const light = world.getComponent<{
      kind: string;
      color: string;
      intensity: number;
      distance: number;
      decay: number;
    }>("light.beacon.west", "Light");
    expect(light?.kind).toBe("point");
    expect(light?.color).toBe("#4af0a8");
    expect(light?.distance).toBe(10);
    expect(light?.decay).toBe(1.4);
  });
});
