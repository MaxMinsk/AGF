import { describe, expect, it } from "vitest";
import { World } from "../../engine/core/ecs/world";
import { createMemoryStore, saveKey } from "../../engine/runtime/persistence/local-store";
import { loadWorld, saveWorld } from "../../engine/runtime/persistence/save-load";

// Mirror examples/beacon-world/project.json#persistence.components.
const BEACON_ALLOWLIST: ReadonlyArray<string> = ["Repairable", "WorldSignal", "Scoreboard"];

describe("Beacon World persistence v0 — allowlist round trip", () => {
  it("repaired beacon state survives save → load", async () => {
    const scene = {
      id: "start",
      entities: [
        {
          id: "beacon.alpha",
          components: {
            Transform: { position: [0, 0, 0] },
            Repairable: { accepts: "core", repaired: false },
            // Non-allowlisted component on the same entity must not be persisted.
            Hazard: { phase: 0 }
          }
        },
        {
          id: "world-signal.root",
          components: { WorldSignal: { health: 0.8, target: 1 } }
        }
      ]
    };
    const context = {
      projectId: "beacon-world",
      profile: "static",
      allowlist: BEACON_ALLOWLIST
    };
    const store = createMemoryStore();
    const key = saveKey(context.projectId, context.profile);

    const live = World.fromScene(scene);
    // Repair the beacon, then degrade the world signal.
    live.setComponent("beacon.alpha", "Repairable", {
      accepts: "core",
      repaired: true,
      lastRepairedBy: "alpha-player"
    });
    live.setComponent("world-signal.root", "WorldSignal", { health: 0.42, target: 1 });

    await saveWorld(live, store, key, context);

    // Fresh world from the scene defaults.
    const fresh = World.fromScene(scene);
    const result = await loadWorld(fresh, store, key, context);

    expect(result.restoredEntities.sort()).toEqual(["beacon.alpha", "world-signal.root"]);
    expect(
      fresh.getComponent<{ repaired: boolean; lastRepairedBy: string }>(
        "beacon.alpha",
        "Repairable"
      )
    ).toMatchObject({ repaired: true, lastRepairedBy: "alpha-player" });
    expect(fresh.getComponent<{ health: number }>("world-signal.root", "WorldSignal")?.health).toBeCloseTo(0.42);

    // Hazard was not allowlisted, so it stays at the scene default.
    expect(fresh.getComponent<{ phase: number }>("beacon.alpha", "Hazard")?.phase).toBe(0);
  });

  it("does not persist components outside the project's allowlist", async () => {
    const scene = {
      id: "start",
      entities: [
        {
          id: "drone",
          components: {
            Transform: { position: [0, 0, 0] },
            // Drone state we explicitly do NOT want a save to drag along.
            Health: { current: 100, max: 100 },
            Invulnerable: { until: 999 }
          }
        }
      ]
    };
    const context = {
      projectId: "beacon-world",
      profile: "static",
      allowlist: BEACON_ALLOWLIST
    };
    const store = createMemoryStore();
    const key = saveKey(context.projectId, context.profile);

    const live = World.fromScene(scene);
    live.setComponent("drone", "Health", { current: 25, max: 100 });
    const blob = await saveWorld(live, store, key, context);

    const drone = blob.entities.find((e) => e.id === "drone");
    expect(drone?.components).toEqual({}); // nothing on drone is in the allowlist
  });
});
