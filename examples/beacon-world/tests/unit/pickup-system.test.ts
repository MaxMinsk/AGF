import { describe, expect, it } from "vitest";
import { createPickupSystem } from "../../src/systems/pickup-system";
import { World } from "../../../../engine/core/ecs/world";
import type { TimeContext } from "../../../../engine/core/loop/types";

function step(world: World): void {
  const system = createPickupSystem({ pickupRadius: 1, depositRadius: 1 });
  const time: TimeContext = {
    elapsed: 0,
    dt: 1 / 60,
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
});
