import { describe, expect, it } from "vitest";
import { createPickupSystem } from "../../src/systems/pickup-system";
import { World } from "../../../../engine/core/ecs/world";
import type { TimeContext } from "../../../../engine/core/loop/types";

function step(world: World, dt: number = 1 / 60): void {
  const system = createPickupSystem({ pickupRadius: 1, depositRadius: 1 });
  const time: TimeContext = {
    elapsed: 0,
    dt,
    fixedDt: 1 / 60,
    frameCount: 0,
    fixedStepCount: 0
  };
  system.frameUpdate?.({ time, world });
}

function buildWorld(): World {
  const world = new World();
  world.addEntity("drone");
  world.setComponent("drone", "Transform", { position: [0, 0, 0] });
  world.setComponent("drone", "Carrier", {});

  world.addEntity("core");
  world.setComponent("core", "Transform", { position: [0.5, 0, 0] });
  world.setComponent("core", "Pickup", { kind: "energy-core" });
  world.setComponent("core", "MeshRenderer", { mesh: "sphere", color: "#4af0a8" });

  world.addEntity("beacon");
  world.setComponent("beacon", "Transform", { position: [3, 0, 0] });
  world.setComponent("beacon", "Repairable", {
    accepts: "energy-core",
    repaired: false,
    repairedColor: "#4af0a8"
  });
  world.setComponent("beacon", "MeshRenderer", {
    mesh: "box",
    material: "runtime/materials/beacon.material.json"
  });
  return world;
}

describe("PickupSystem", () => {
  it("picks up the nearest pickup within pickupRadius", () => {
    const world = buildWorld();

    step(world);

    const carrier = world.getComponent<{ carrying?: string }>("drone", "Carrier");
    expect(carrier?.carrying).toBe("core");
  });

  it("does not pick up if no pickup is within pickupRadius", () => {
    const world = buildWorld();
    world.setComponent("core", "Transform", { position: [10, 0, 0] });

    step(world);

    const carrier = world.getComponent<{ carrying?: string }>("drone", "Carrier");
    expect(carrier?.carrying).toBeUndefined();
  });

  it("moves the carried pickup to a position just above the carrier", () => {
    const world = buildWorld();

    step(world); // pick up
    world.setComponent("drone", "Transform", { position: [1, 0, 1] });
    step(world); // carry frame

    const carried = world.getComponent<{ position: [number, number, number] }>("core", "Transform");
    expect(carried?.position).toEqual([1, 0.6, 1]);
  });

  it("deposits the carried pickup on a matching beacon and swaps the beacon color", () => {
    const world = buildWorld();
    step(world); // pick up

    // Teleport drone next to the beacon so the deposit radius triggers.
    world.setComponent("drone", "Transform", { position: [3, 0, 0] });
    step(world);

    expect(world.hasEntity("core")).toBe(false);
    const carrier = world.getComponent<{ carrying?: string }>("drone", "Carrier");
    expect(carrier?.carrying).toBeUndefined();
    const repair = world.getComponent<{ repaired?: boolean }>("beacon", "Repairable");
    expect(repair?.repaired).toBe(true);
    const renderer = world.getComponent<{ mesh: string; material?: string; color?: string }>(
      "beacon",
      "MeshRenderer"
    );
    expect(renderer?.color).toBe("#4af0a8");
    expect(renderer?.material).toBeUndefined();
  });

  it("does not deposit on a beacon whose accepts does not match the pickup kind", () => {
    const world = buildWorld();
    world.setComponent("beacon", "Repairable", {
      accepts: "circuit-board",
      repaired: false,
      repairedColor: "#4af0a8"
    });

    step(world); // pick up
    world.setComponent("drone", "Transform", { position: [3, 0, 0] });
    step(world);

    expect(world.hasEntity("core")).toBe(true);
    const repair = world.getComponent<{ repaired?: boolean }>("beacon", "Repairable");
    expect(repair?.repaired).toBe(false);
  });

  it("does not deposit twice on an already-repaired beacon", () => {
    const world = buildWorld();
    world.setComponent("beacon", "Repairable", {
      accepts: "energy-core",
      repaired: true,
      repairedColor: "#4af0a8"
    });

    step(world); // pick up
    world.setComponent("drone", "Transform", { position: [3, 0, 0] });
    step(world);

    expect(world.hasEntity("core")).toBe(true);
    const carrier = world.getComponent<{ carrying?: string }>("drone", "Carrier");
    expect(carrier?.carrying).toBe("core");
  });

  it("respawns a deposited pickup at its originalPosition after respawnAfter seconds", () => {
    const world = buildWorld();
    world.setComponent("core", "Pickup", {
      kind: "energy-core",
      originalPosition: [0.5, 0, 0],
      respawnAfter: 1
    });

    step(world); // pick up
    world.setComponent("drone", "Transform", { position: [3, 0, 0] });
    step(world); // deposit

    // The pickup entity survives but is parked underground while consumed.
    expect(world.hasEntity("core")).toBe(true);
    const parkedPickup = world.getComponent<{
      consumed?: boolean;
      respawnIn?: number;
    }>("core", "Pickup");
    expect(parkedPickup?.consumed).toBe(true);
    expect(parkedPickup?.respawnIn).toBe(1);
    const parkedTransform = world.getComponent<{ position: [number, number, number] }>(
      "core",
      "Transform"
    );
    expect(parkedTransform?.position[1]).toBeLessThan(-10);

    // Tick the timer down. Carrier has moved away so it doesn't grab the pickup again.
    world.setComponent("drone", "Transform", { position: [10, 0, 10] });
    step(world, 0.7);

    const ticking = world.getComponent<{ respawnIn?: number; consumed?: boolean }>("core", "Pickup");
    expect(ticking?.consumed).toBe(true);
    expect(ticking?.respawnIn).toBeCloseTo(0.3, 5);

    step(world, 0.5); // crosses the threshold

    const respawned = world.getComponent<{ consumed?: boolean; respawnIn?: number }>(
      "core",
      "Pickup"
    );
    expect(respawned?.consumed).toBeUndefined();
    expect(respawned?.respawnIn).toBeUndefined();
    const restored = world.getComponent<{ position: [number, number, number] }>("core", "Transform");
    expect(restored?.position).toEqual([0.5, 0, 0]);
  });

  it("ignores consumed pickups when looking for something to carry", () => {
    const world = buildWorld();
    world.setComponent("core", "Pickup", {
      kind: "energy-core",
      consumed: true,
      respawnIn: 5,
      originalPosition: [0.5, 0, 0],
      respawnAfter: 5
    });
    // park it underground so it would still be in XZ range if not for the consumed flag
    world.setComponent("core", "Transform", { position: [0.5, -100, 0] });

    step(world);

    const carrier = world.getComponent<{ carrying?: string }>("drone", "Carrier");
    expect(carrier?.carrying).toBeUndefined();
  });

  it("decays a repaired beacon back after decayAfter seconds and restores the original material", () => {
    const world = buildWorld();
    world.setComponent("beacon", "Repairable", {
      accepts: "energy-core",
      repaired: false,
      repairedColor: "#4af0a8",
      decayAfter: 0.5
    });

    step(world); // pick up
    world.setComponent("drone", "Transform", { position: [3, 0, 0] });
    step(world); // deposit

    const justRepaired = world.getComponent<{
      repaired?: boolean;
      decayIn?: number;
      originalMaterial?: string;
    }>("beacon", "Repairable");
    expect(justRepaired?.repaired).toBe(true);
    expect(justRepaired?.decayIn).toBe(0.5);
    expect(justRepaired?.originalMaterial).toBe("runtime/materials/beacon.material.json");

    // Step the carrier away so it does not re-deposit anything, then advance time.
    world.setComponent("drone", "Transform", { position: [20, 0, 20] });
    step(world, 0.6);

    const decayed = world.getComponent<{
      repaired?: boolean;
      decayIn?: number;
      originalMaterial?: string;
    }>("beacon", "Repairable");
    expect(decayed?.repaired).toBe(false);
    expect(decayed?.decayIn).toBeUndefined();
    expect(decayed?.originalMaterial).toBeUndefined();

    const renderer = world.getComponent<{
      mesh: string;
      material?: string;
      color?: string;
    }>("beacon", "MeshRenderer");
    expect(renderer?.material).toBe("runtime/materials/beacon.material.json");
  });
});
