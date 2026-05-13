import { describe, expect, it } from "vitest";
import { createNetworkDroneSyncSystem } from "../../src/systems/network-drone-sync-system";
import { World } from "../../../../engine/core/ecs/world";
import type { TimeContext } from "../../../../engine/core/loop/types";

function step(world: World, playerId: string): void {
  const system = createNetworkDroneSyncSystem({ playerId });
  const time: TimeContext = {
    elapsed: 0,
    dt: 1 / 60,
    fixedDt: 1 / 60,
    frameCount: 0,
    fixedStepCount: 0
  };
  system.frameUpdate?.({ time, world });
}

function buildWorld(playerId: string): World {
  const world = new World();
  world.addEntity("player.drone");
  world.setComponent("player.drone", "Transform", {
    position: [0, 0.4, 0],
    rotation: [0, 0, 0],
    scale: [0.7, 0.7, 0.7]
  });
  world.setComponent("player.drone", "PlayerControlled", { speed: 3.5 });

  world.addEntity(`player.${playerId}`);
  world.setComponent(`player.${playerId}`, "Transform", { position: [2.5, 0.4, -1.5] });
  world.setComponent(`player.${playerId}`, "Presence", { playerId });
  world.setComponent(`player.${playerId}`, "Networked", { authority: "server" });
  return world;
}

describe("NetworkDroneSyncSystem", () => {
  it("mirrors the server-owned player's Transform.position onto the local drone", () => {
    const world = buildWorld("alpha");
    step(world, "alpha");

    const transform = world.getComponent<{
      position: ReadonlyArray<number>;
      rotation: ReadonlyArray<number>;
      scale: ReadonlyArray<number>;
    }>("player.drone", "Transform");
    expect(transform?.position).toEqual([2.5, 0.4, -1.5]);
    expect(transform?.scale).toEqual([0.7, 0.7, 0.7]);
    expect(transform?.rotation).toEqual([0, 0, 0]);
  });

  it("ignores entities owned by a different player id", () => {
    const world = buildWorld("alpha");
    step(world, "bravo");
    const transform = world.getComponent<{ position: ReadonlyArray<number> }>(
      "player.drone",
      "Transform"
    );
    expect(transform?.position).toEqual([0, 0.4, 0]);
  });

  it("ignores client-authoritative entities", () => {
    const world = buildWorld("alpha");
    world.setComponent("player.alpha", "Networked", { authority: "client" });
    step(world, "alpha");
    const transform = world.getComponent<{ position: ReadonlyArray<number> }>(
      "player.drone",
      "Transform"
    );
    expect(transform?.position).toEqual([0, 0.4, 0]);
  });

  it("is a no-op when the local drone is absent", () => {
    const world = new World();
    world.addEntity("player.alpha");
    world.setComponent("player.alpha", "Transform", { position: [1, 0, 0] });
    world.setComponent("player.alpha", "Presence", { playerId: "alpha" });
    world.setComponent("player.alpha", "Networked", { authority: "server" });

    expect(() => step(world, "alpha")).not.toThrow();
  });
});
