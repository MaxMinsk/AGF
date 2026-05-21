// S108 KABOOM-INPUT-DEAD-BOMBER-LOCKOUT.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createKaboomPlayerInputSystem } from "../../src/systems/player-input-system";

function ctx(world: World) {
  return {
    world,
    time: { elapsed: 0, dt: 1 / 60, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  };
}

function addDeadPlayer(world: World) {
  world.addEntity("player.1");
  world.setComponent("player.1", "PlayerControlled", { speed: 4 });
  world.setComponent("player.1", "GridMover", { speed: 4, queuedDirection: { dx: 1, dz: 0 } });
  world.setComponent("player.1", "BomberStats", { maxBombs: 1, range: 2, alive: false });
}

describe("S108 KABOOM-INPUT-DEAD-BOMBER-LOCKOUT", () => {
  it("dead bomber's queuedDirection gets zeroed even if a key is pressed", () => {
    const world = new World();
    addDeadPlayer(world);
    const system = createKaboomPlayerInputSystem({ pressedKeys: new Set(["KeyD"]) });
    system.frameUpdate!(ctx(world));
    const mover = world.getComponent<{ queuedDirection: { dx: number; dz: number } }>("player.1", "GridMover")!;
    expect(mover.queuedDirection).toEqual({ dx: 0, dz: 0 });
  });

  it("dead bomber does NOT get PlaceBombRequest on Space press", () => {
    const world = new World();
    addDeadPlayer(world);
    const system = createKaboomPlayerInputSystem({ pressedKeys: new Set(["Space"]) });
    // Two ticks (edge fires on first frame).
    system.frameUpdate!(ctx(world));
    system.frameUpdate!(ctx(world));
    expect(world.hasComponent("player.1", "PlaceBombRequest")).toBe(false);
  });

  it("dead bomber does NOT get RemoteDetonateRequest on F press", () => {
    const world = new World();
    addDeadPlayer(world);
    const system = createKaboomPlayerInputSystem({ pressedKeys: new Set(["KeyF"]) });
    system.frameUpdate!(ctx(world));
    expect(world.hasComponent("player.1", "RemoteDetonateRequest")).toBe(false);
  });

  it("R key restart still fires on a dead bomber (the death-screen UX)", () => {
    const world = new World();
    addDeadPlayer(world);
    const system = createKaboomPlayerInputSystem({ pressedKeys: new Set(["KeyR"]) });
    system.frameUpdate!(ctx(world));
    expect(world.hasComponent("player.1", "RoundRestartRequest")).toBe(true);
  });
});
