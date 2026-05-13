import { describe, expect, it } from "vitest";
import { World } from "../../engine/core/ecs/world";
import {
  createMemoryStore,
  saveKey
} from "../../engine/runtime/persistence/local-store";
import {
  clearWorldSave,
  loadWorld,
  saveWorld,
  SAVE_FORMAT_VERSION,
  type SaveBlob
} from "../../engine/runtime/persistence/save-load";

const scene = {
  id: "start",
  entities: [
    {
      id: "drone",
      components: {
        Transform: { position: [0, 0, 0] },
        Wallet: { coins: 5 },
        Secret: { token: "do-not-persist" }
      }
    },
    {
      id: "core",
      components: { Transform: { position: [3, 0, 0] }, Persisted: { picked: false } }
    }
  ]
};

const context = {
  projectId: "test-project",
  profile: "local",
  allowlist: ["Wallet", "Persisted"] as ReadonlyArray<string>
};

describe("persistence v0", () => {
  it("save → load round-trips allowlisted components only", async () => {
    const world = World.fromScene(scene);
    const store = createMemoryStore();
    const key = saveKey(context.projectId, context.profile);

    // Mutate live state before saving.
    world.setComponent("drone", "Wallet", { coins: 17 });
    world.setComponent("drone", "Secret", { token: "still-do-not-persist" });
    world.setComponent("core", "Persisted", { picked: true });

    const blob = await saveWorld(world, store, key, context);
    expect(blob.agfFormatVersion).toBe(SAVE_FORMAT_VERSION);
    expect(blob.projectId).toBe(context.projectId);
    expect(blob.entities).toHaveLength(2);
    const drone = blob.entities.find((e) => e.id === "drone");
    expect(drone?.components).toEqual({ Wallet: { coins: 17 } });
    expect(drone?.components).not.toHaveProperty("Secret");
    expect(drone?.components).not.toHaveProperty("Transform");

    // Reset world to scene defaults, then load.
    const fresh = World.fromScene(scene);
    const { restoredEntities } = await loadWorld(fresh, store, key, context);
    expect(restoredEntities.sort()).toEqual(["core", "drone"]);
    expect(fresh.getComponent<{ coins: number }>("drone", "Wallet")?.coins).toBe(17);
    expect(fresh.getComponent<{ picked: boolean }>("core", "Persisted")?.picked).toBe(true);
    // Non-allowlisted components keep their scene-default value.
    expect(fresh.getComponent<{ token: string }>("drone", "Secret")?.token).toBe("do-not-persist");
  });

  it("load returns blob=undefined when the key is absent", async () => {
    const store = createMemoryStore();
    const fresh = World.fromScene(scene);
    const result = await loadWorld(fresh, store, "missing-key", context);
    expect(result.blob).toBeUndefined();
    expect(result.restoredEntities).toEqual([]);
  });

  it("load skips entities that no longer exist in the world", async () => {
    const store = createMemoryStore();
    const key = saveKey(context.projectId, context.profile);
    const blob: SaveBlob = {
      agfFormatVersion: SAVE_FORMAT_VERSION,
      projectId: context.projectId,
      savedAt: new Date().toISOString(),
      entities: [{ id: "ghost", components: { Wallet: { coins: 100 } } }]
    };
    await store.set(key, blob);

    const fresh = World.fromScene(scene);
    const result = await loadWorld(fresh, store, key, context);
    expect(result.restoredEntities).toEqual([]);
  });

  it("load rejects a save from a different project", async () => {
    const store = createMemoryStore();
    const key = saveKey(context.projectId, context.profile);
    await store.set(key, {
      agfFormatVersion: SAVE_FORMAT_VERSION,
      projectId: "other-project",
      savedAt: new Date().toISOString(),
      entities: []
    });
    const fresh = World.fromScene(scene);
    await expect(loadWorld(fresh, store, key, context)).rejects.toThrow(/projectId mismatch/);
  });

  it("clearSave removes the key", async () => {
    const store = createMemoryStore();
    const key = saveKey(context.projectId, context.profile);
    const world = World.fromScene(scene);
    await saveWorld(world, store, key, context);
    expect(await store.get(key)).toBeDefined();
    await clearWorldSave(store, key);
    expect(await store.get(key)).toBeUndefined();
  });

  it("saveKey uses default slot when not supplied", () => {
    expect(saveKey("beacon-world", "static")).toBe("agf/beacon-world/static/default");
    expect(saveKey("beacon-world", "static", "slot-2")).toBe("agf/beacon-world/static/slot-2");
  });
});
