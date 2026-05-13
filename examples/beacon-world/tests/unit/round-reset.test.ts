import { describe, expect, it } from "vitest";
import { resetBeaconRound } from "../../src/round-reset";
import { World } from "../../../../engine/core/ecs/world";

type Repairable = {
  accepts: string;
  repaired?: boolean;
  originalMaterial?: string;
  originalColor?: string;
  decayIn?: number;
  repairedMaterial?: string;
};
type Pickup = {
  kind: string;
  originalPosition?: ReadonlyArray<number>;
  respawnAfter?: number;
  consumed?: boolean;
  respawnIn?: number;
};
type Transform = { position?: ReadonlyArray<number> };

function buildScene(): World {
  const world = new World();

  world.addEntity("world.signal");
  world.setComponent("world.signal", "WorldSignal", { health: 1, target: 1, tau: 2 });
  world.setComponent("world.signal", "RoundState", {
    phase: "complete",
    thresholdHealth: 0.85,
    holdSeconds: 3,
    holdProgress: 3,
    completedAt: 12.5
  });

  world.addEntity("beacon.west");
  world.setComponent("beacon.west", "Repairable", {
    accepts: "energy-core",
    repaired: true,
    originalMaterial: "runtime/materials/beacon.material.json",
    decayIn: 4
  });
  world.setComponent("beacon.west", "MeshRenderer", {
    mesh: "runtime/models/beacon.glb",
    material: "runtime/materials/beacon-repaired.material.json"
  });

  world.addEntity("core.north");
  world.setComponent("core.north", "Pickup", {
    kind: "energy-core",
    originalPosition: [-1.5, 0.4, -2.5],
    respawnAfter: 4,
    consumed: true,
    respawnIn: 2
  });
  world.setComponent("core.north", "Transform", { position: [-1.5, -100, -2.5] });

  world.addEntity("beacon.east");
  world.setComponent("beacon.east", "Repairable", { accepts: "energy-core", repaired: false });
  world.setComponent("beacon.east", "MeshRenderer", { mesh: "runtime/models/beacon.glb" });

  return world;
}

describe("resetBeaconRound", () => {
  it("re-arms repaired beacons and restores their original material", () => {
    const world = buildScene();
    resetBeaconRound(world);

    const repair = world.getComponent<Repairable>("beacon.west", "Repairable");
    expect(repair?.repaired).toBe(false);
    expect(repair?.decayIn).toBeUndefined();
    expect(repair?.originalMaterial).toBeUndefined();
    const renderer = world.getComponent<{ material?: string; color?: string }>(
      "beacon.west",
      "MeshRenderer"
    );
    expect(renderer?.material).toBe("runtime/materials/beacon.material.json");
    expect(renderer?.color).toBeUndefined();
  });

  it("respawns consumed pickups at their originalPosition and clears runtime fields", () => {
    const world = buildScene();
    resetBeaconRound(world);

    const pickup = world.getComponent<Pickup>("core.north", "Pickup");
    expect(pickup?.consumed).toBeUndefined();
    expect(pickup?.respawnIn).toBeUndefined();
    expect(pickup?.kind).toBe("energy-core");
    expect(pickup?.originalPosition).toEqual([-1.5, 0.4, -2.5]);
    expect(pickup?.respawnAfter).toBe(4);

    const transform = world.getComponent<Transform>("core.north", "Transform");
    expect(transform?.position).toEqual([-1.5, 0.4, -2.5]);
  });

  it("flips RoundState back to active with holdProgress 0 and clears completedAt", () => {
    const world = buildScene();
    resetBeaconRound(world);

    const round = world.getComponent<{
      phase: string;
      holdProgress?: number;
      completedAt?: number;
    }>("world.signal", "RoundState");
    expect(round?.phase).toBe("active");
    expect(round?.holdProgress).toBe(0);
    expect(round?.completedAt).toBeUndefined();
  });

  it("returns the number of mutations applied and is a no-op when nothing needs reset", () => {
    const world = new World();
    expect(resetBeaconRound(world)).toBe(0);

    world.addEntity("beacon.west");
    world.setComponent("beacon.west", "Repairable", { accepts: "energy-core", repaired: false });
    expect(resetBeaconRound(world)).toBe(0);
  });
});
