import { describe, expect, it } from "vitest";
import { createHazardSystem } from "../../src/systems/hazard-system";
import { World } from "../../../../engine/core/ecs/world";
import type { TimeContext } from "../../../../engine/core/loop/types";

function step(world: World, elapsed = 0, dt = 1 / 60): void {
  const system = createHazardSystem();
  const time: TimeContext = {
    elapsed,
    dt,
    fixedDt: 1 / 60,
    frameCount: 0,
    fixedStepCount: 0
  };
  system.frameUpdate?.({ time, world });
}

function buildWorld(): World {
  const world = new World();
  world.addEntity("hazard");
  world.setComponent("hazard", "Transform", {
    position: [0, 0.6, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  });
  world.setComponent("hazard", "Hazard", {
    minRadius: 0.5,
    maxRadius: 1.5,
    period: 2
  });
  world.setComponent("hazard", "MeshRenderer", { mesh: "sphere", color: "#ff5544" });

  world.addEntity("drone");
  world.setComponent("drone", "Transform", {
    position: [3, 0.4, 3],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  });
  world.setComponent("drone", "Carrier", { carrying: "core" });

  world.addEntity("core");
  world.setComponent("core", "Transform", { position: [3, 1, 3] });
  world.setComponent("core", "Pickup", {
    kind: "energy-core",
    originalPosition: [3, 0.4, 3],
    respawnAfter: 4
  });
  world.setComponent("core", "MeshRenderer", { mesh: "sphere", color: "#4af0a8" });

  return world;
}

describe("HazardSystem", () => {
  it("animates Transform.scale through the pulse cycle", () => {
    const world = buildWorld();

    step(world, 0); // sin(0) = 0 -> norm 0.5 -> radius 1.0
    const midTransform = world.getComponent<{ scale: [number, number, number] }>("hazard", "Transform");
    expect(midTransform?.scale[0]).toBeCloseTo(1.0, 5);

    // Period = 2 seconds. Elapsed = 0.5 -> phase = pi/2 -> sin = 1 -> norm = 1 -> radius = max.
    step(world, 0.5);
    const peakTransform = world.getComponent<{ scale: [number, number, number] }>("hazard", "Transform");
    expect(peakTransform?.scale[0]).toBeCloseTo(1.5, 5);

    // Elapsed = 1.5 -> phase = 3pi/2 -> sin = -1 -> norm = 0 -> radius = min.
    step(world, 1.5);
    const troughTransform = world.getComponent<{ scale: [number, number, number] }>("hazard", "Transform");
    expect(troughTransform?.scale[0]).toBeCloseTo(0.5, 5);
  });

  it("drops the carried pickup when the carrier enters the pulse", () => {
    const world = buildWorld();
    // Teleport drone into the hazard centre, well inside even the minRadius.
    world.setComponent("drone", "Transform", { position: [0, 0.4, 0] });

    step(world, 0);

    const carrier = world.getComponent<{ carrying?: string }>("drone", "Carrier");
    expect(carrier?.carrying).toBeUndefined();

    const pickup = world.getComponent<{ consumed?: boolean; respawnIn?: number }>("core", "Pickup");
    expect(pickup?.consumed).toBe(true);
    expect(pickup?.respawnIn).toBe(4);

    const coreTransform = world.getComponent<{ position: [number, number, number] }>("core", "Transform");
    expect(coreTransform?.position[1]).toBeLessThan(-10);
  });

  it("leaves a carrier alone when it is outside the current radius", () => {
    const world = buildWorld();

    step(world, 0); // drone sits at (3, 0.4, 3) — far outside the 1.0 radius

    const carrier = world.getComponent<{ carrying?: string }>("drone", "Carrier");
    expect(carrier?.carrying).toBe("core");

    const pickup = world.getComponent<{ consumed?: boolean }>("core", "Pickup");
    expect(pickup?.consumed).toBeUndefined();
  });

  it("ignores carriers that are not currently carrying", () => {
    const world = buildWorld();
    world.setComponent("drone", "Carrier", {});
    world.setComponent("drone", "Transform", { position: [0, 0.4, 0] });

    expect(() => step(world, 0)).not.toThrow();
    const carrier = world.getComponent<{ carrying?: string }>("drone", "Carrier");
    expect(carrier?.carrying).toBeUndefined();
  });

  it("decrements Health and grants invulnerability when the hazard hits an entity with Health", () => {
    const world = buildWorld();
    world.setComponent("drone", "Transform", { position: [0, 0.4, 0] });
    world.setComponent("drone", "Health", { current: 3, max: 3 });
    world.setComponent("drone", "Respawnable", { position: [10, 0.4, 10] });
    world.setComponent("hazard", "Hazard", {
      minRadius: 0.5,
      maxRadius: 1.5,
      period: 2,
      damage: 1,
      invulnerabilitySeconds: 1
    });

    step(world, 0);

    const health = world.getComponent<{ current: number; max: number }>("drone", "Health");
    expect(health?.current).toBe(2);
    const invulnerable = world.getComponent<{ until: number }>("drone", "Invulnerable");
    expect(invulnerable?.until).toBeCloseTo(1, 5);
  });

  it("does not damage the entity again while still invulnerable", () => {
    const world = buildWorld();
    world.setComponent("drone", "Transform", { position: [0, 0.4, 0] });
    world.setComponent("drone", "Health", { current: 3, max: 3 });
    world.setComponent("drone", "Respawnable", { position: [10, 0.4, 10] });
    world.setComponent("hazard", "Hazard", {
      minRadius: 0.5,
      maxRadius: 1.5,
      period: 2,
      damage: 1,
      invulnerabilitySeconds: 1
    });

    step(world, 0); // health 3 -> 2, invulnerable until 1.0
    step(world, 0.5); // still invulnerable, no change

    const health = world.getComponent<{ current: number; max: number }>("drone", "Health");
    expect(health?.current).toBe(2);
  });

  it("damages again once invulnerability expires", () => {
    const world = buildWorld();
    world.setComponent("drone", "Transform", { position: [0, 0.4, 0] });
    world.setComponent("drone", "Health", { current: 3, max: 3 });
    world.setComponent("drone", "Respawnable", { position: [10, 0.4, 10] });
    world.setComponent("hazard", "Hazard", {
      minRadius: 0.5,
      maxRadius: 1.5,
      period: 2,
      damage: 1,
      invulnerabilitySeconds: 1
    });

    step(world, 0); // hit, invulnerable until 1.0
    step(world, 1.1); // past 1.0 -> new hit

    const health = world.getComponent<{ current: number; max: number }>("drone", "Health");
    expect(health?.current).toBe(1);
  });

  it("respawns the entity at Respawnable.position and restores Health when current hits 0", () => {
    const world = buildWorld();
    world.setComponent("drone", "Transform", { position: [0, 0.4, 0] });
    world.setComponent("drone", "Health", { current: 1, max: 3 });
    world.setComponent("drone", "Respawnable", { position: [10, 0.4, 10] });
    world.setComponent("hazard", "Hazard", {
      minRadius: 0.5,
      maxRadius: 1.5,
      period: 2,
      damage: 1,
      invulnerabilitySeconds: 1
    });

    step(world, 0);

    const health = world.getComponent<{ current: number; max: number }>("drone", "Health");
    expect(health).toEqual({ current: 3, max: 3 });
    const transform = world.getComponent<{ position: [number, number, number] }>("drone", "Transform");
    expect(transform?.position).toEqual([10, 0.4, 10]);
  });
});
