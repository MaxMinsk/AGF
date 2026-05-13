import { describe, expect, it } from "vitest";
import { createWorldSignalSystem } from "../../src/systems/world-signal-system";
import { World } from "../../../../engine/core/ecs/world";
import type { TimeContext } from "../../../../engine/core/loop/types";

function step(world: World, dt: number): void {
  const system = createWorldSignalSystem();
  const time: TimeContext = {
    elapsed: 0,
    dt,
    fixedDt: 1 / 60,
    frameCount: 0,
    fixedStepCount: 0
  };
  system.frameUpdate?.({ time, world });
}

function buildWorld(repaired: number, total: number, tau = 2): World {
  const world = new World();
  world.addEntity("world.signal");
  world.setComponent("world.signal", "WorldSignal", { health: 0, target: 0, tau });
  for (let i = 0; i < total; i += 1) {
    const id = `beacon.${i}`;
    world.addEntity(id);
    world.setComponent(id, "Repairable", {
      accepts: "energy-core",
      repaired: i < repaired
    });
  }
  return world;
}

describe("WorldSignalSystem", () => {
  it("writes the current target ratio to the world.signal singleton", () => {
    const world = buildWorld(1, 2);
    step(world, 1 / 60);
    const signal = world.getComponent<{ target?: number; health?: number }>(
      "world.signal",
      "WorldSignal"
    );
    expect(signal?.target).toBe(0.5);
    expect(signal!.health!).toBeGreaterThan(0);
    expect(signal!.health!).toBeLessThan(0.5);
  });

  it("monotonically approaches target=1 when all beacons are repaired", () => {
    const world = buildWorld(2, 2, 4);
    let previous = 0;
    for (let i = 0; i < 60; i += 1) {
      step(world, 1 / 60);
      const health = (
        world.getComponent<{ health?: number }>("world.signal", "WorldSignal") ?? {}
      ).health;
      expect(health).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = health ?? 0;
    }
    expect(previous).toBeGreaterThan(0.95);
  });

  it("decays back toward zero when beacons un-repair", () => {
    const world = buildWorld(2, 2, 4);
    for (let i = 0; i < 120; i += 1) {
      step(world, 1 / 60);
    }
    const fullyCharged = (
      world.getComponent<{ health?: number }>("world.signal", "WorldSignal") ?? {}
    ).health;
    expect(fullyCharged).toBeGreaterThan(0.95);

    world.setComponent("beacon.0", "Repairable", { accepts: "energy-core", repaired: false });
    world.setComponent("beacon.1", "Repairable", { accepts: "energy-core", repaired: false });
    for (let i = 0; i < 120; i += 1) {
      step(world, 1 / 60);
    }
    const afterDecay = (
      world.getComponent<{ health?: number; target?: number }>("world.signal", "WorldSignal") ?? {}
    );
    expect(afterDecay.target).toBe(0);
    expect(afterDecay.health).toBeLessThan(0.05);
  });

  it("is a no-op when the world.signal entity is absent", () => {
    const world = new World();
    world.addEntity("beacon.0");
    world.setComponent("beacon.0", "Repairable", { accepts: "energy-core", repaired: true });

    expect(() => step(world, 1 / 60)).not.toThrow();
  });
});
