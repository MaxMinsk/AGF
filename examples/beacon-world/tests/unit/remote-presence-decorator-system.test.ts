import { describe, expect, it } from "vitest";
import { createRemotePresenceDecoratorSystem } from "../../src/systems/remote-presence-decorator-system";
import { World } from "../../../../engine/core/ecs/world";
import type { TimeContext } from "../../../../engine/core/loop/types";

function step(world: World, localPlayerId: string): void {
  const system = createRemotePresenceDecoratorSystem({
    localPlayerId,
    mesh: "runtime/models/drone.glb",
    material: "runtime/materials/drone.material.json"
  });
  const time: TimeContext = {
    elapsed: 0,
    dt: 1 / 60,
    fixedDt: 1 / 60,
    frameCount: 0,
    fixedStepCount: 0
  };
  system.frameUpdate?.({ time, world });
}

function addServerPlayer(world: World, playerId: string): void {
  const id = `player.${playerId}`;
  world.addEntity(id);
  world.setComponent(id, "Transform", { position: [0, 0.4, 0] });
  world.setComponent(id, "Presence", { playerId });
  world.setComponent(id, "Networked", { authority: "server" });
}

describe("RemotePresenceDecoratorSystem", () => {
  it("attaches a MeshRenderer (palette-picked material) and a default scale to a remote server-authority player", () => {
    const world = new World();
    addServerPlayer(world, "bravo");
    step(world, "alpha");

    const renderer = world.getComponent<{ mesh: string; material?: string; color?: string }>(
      "player.bravo",
      "MeshRenderer"
    );
    expect(renderer?.mesh).toBe("runtime/models/drone.glb");
    expect(renderer?.material).toMatch(/runtime\/materials\/drone-(orange|cyan|violet|amber)\.material\.json/);
    expect(renderer?.color).toBeUndefined();

    const transform = world.getComponent<{ scale?: ReadonlyArray<number> }>(
      "player.bravo",
      "Transform"
    );
    expect(transform?.scale).toEqual([0.7, 0.7, 0.7]);
  });

  it("skips the local player's server-authority entity", () => {
    const world = new World();
    addServerPlayer(world, "alpha");
    step(world, "alpha");

    expect(world.getComponent("player.alpha", "MeshRenderer")).toBeUndefined();
  });

  it("does not overwrite an existing MeshRenderer", () => {
    const world = new World();
    addServerPlayer(world, "bravo");
    world.setComponent("player.bravo", "MeshRenderer", { mesh: "sphere", color: "#abcdef" });
    step(world, "alpha");

    const renderer = world.getComponent<{ mesh: string; color?: string }>(
      "player.bravo",
      "MeshRenderer"
    );
    expect(renderer?.mesh).toBe("sphere");
    expect(renderer?.color).toBe("#abcdef");
  });

  it("ignores client-authority entities", () => {
    const world = new World();
    world.addEntity("player.local");
    world.setComponent("player.local", "Transform", { position: [0, 0, 0] });
    world.setComponent("player.local", "Presence", { playerId: "local" });
    world.setComponent("player.local", "Networked", { authority: "client" });
    step(world, "alpha");

    expect(world.getComponent("player.local", "MeshRenderer")).toBeUndefined();
  });

  it("assigns stable, palette-bound materials for the same player id", () => {
    const worldA = new World();
    addServerPlayer(worldA, "bravo");
    step(worldA, "alpha");
    const materialA = (
      worldA.getComponent<{ material?: string }>("player.bravo", "MeshRenderer") ?? {}
    ).material;

    const worldB = new World();
    addServerPlayer(worldB, "bravo");
    step(worldB, "alpha");
    const materialB = (
      worldB.getComponent<{ material?: string }>("player.bravo", "MeshRenderer") ?? {}
    ).material;

    expect(materialA).toBeDefined();
    expect(materialA).toBe(materialB);
  });
});
