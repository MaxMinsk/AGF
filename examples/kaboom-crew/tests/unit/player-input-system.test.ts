// S82 KABOOM-PLAYER-INPUT unit tests. Uses an externally-supplied
// pressed set (`pressedKeys`) so we don't need a DOM environment —
// the input layer's job is to translate the pressed set into a
// GridMover.queuedDirection write.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createKaboomPlayerInputSystem } from "../../src/systems/player-input-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  };
}

function addPlayer(world: World): void {
  world.addEntity("player");
  world.setComponent("player", "PlayerControlled", { speed: 4 });
  world.setComponent("player", "GridMover", { speed: 4, currentLerp: 0 });
  world.setComponent("player", "GridPosition", { gx: 1, gz: 1 });
}

function snapshotDirection(world: World): { dx: number; dz: number } | undefined {
  const mover = world.getComponent("player", "GridMover") as { queuedDirection?: { dx: number; dz: number } };
  return mover.queuedDirection;
}

describe("createKaboomPlayerInputSystem (S82 KABOOM-PLAYER-INPUT)", () => {
  it("writes queuedDirection {0,0} when no keys are pressed", () => {
    const world = new World();
    addPlayer(world);
    const pressed = new Set<string>();
    const system = createKaboomPlayerInputSystem({ pressedKeys: pressed });
    system.frameUpdate!(ctx(world));
    expect(snapshotDirection(world)).toEqual({ dx: 0, dz: 0 });
  });

  it("KeyD writes +X direction", () => {
    const world = new World();
    addPlayer(world);
    const pressed = new Set(["KeyD"]);
    const system = createKaboomPlayerInputSystem({ pressedKeys: pressed });
    system.frameUpdate!(ctx(world));
    expect(snapshotDirection(world)).toEqual({ dx: 1, dz: 0 });
  });

  it("ArrowLeft writes -X direction", () => {
    const world = new World();
    addPlayer(world);
    const pressed = new Set(["ArrowLeft"]);
    const system = createKaboomPlayerInputSystem({ pressedKeys: pressed });
    system.frameUpdate!(ctx(world));
    expect(snapshotDirection(world)).toEqual({ dx: -1, dz: 0 });
  });

  it("KeyW writes -Z direction (up = world-space -Z)", () => {
    const world = new World();
    addPlayer(world);
    const pressed = new Set(["KeyW"]);
    const system = createKaboomPlayerInputSystem({ pressedKeys: pressed });
    system.frameUpdate!(ctx(world));
    expect(snapshotDirection(world)).toEqual({ dx: 0, dz: -1 });
  });

  it("KeyS writes +Z direction (down = world-space +Z)", () => {
    const world = new World();
    addPlayer(world);
    const pressed = new Set(["KeyS"]);
    const system = createKaboomPlayerInputSystem({ pressedKeys: pressed });
    system.frameUpdate!(ctx(world));
    expect(snapshotDirection(world)).toEqual({ dx: 0, dz: 1 });
  });

  it("right > up > left > down precedence when multiple keys held", () => {
    const world = new World();
    addPlayer(world);
    const pressed = new Set(["KeyA", "KeyW", "KeyD"]); // left + up + right
    const system = createKaboomPlayerInputSystem({ pressedKeys: pressed });
    system.frameUpdate!(ctx(world));
    expect(snapshotDirection(world)).toEqual({ dx: 1, dz: 0 }); // right wins
  });

  it("ignores entities without PlayerControlled", () => {
    const world = new World();
    world.addEntity("npc");
    world.setComponent("npc", "GridMover", { speed: 3, currentLerp: 0 });
    const pressed = new Set(["KeyD"]);
    const system = createKaboomPlayerInputSystem({ pressedKeys: pressed });
    system.frameUpdate!(ctx(world));
    const mover = world.getComponent("npc", "GridMover") as { queuedDirection?: unknown };
    expect(mover.queuedDirection).toBeUndefined();
  });

  it("does not bump component revision when direction is unchanged", () => {
    const world = new World();
    addPlayer(world);
    const pressed = new Set(["KeyD"]);
    const system = createKaboomPlayerInputSystem({ pressedKeys: pressed });
    system.frameUpdate!(ctx(world));
    const after1 = world.getComponent("player", "GridMover");
    system.frameUpdate!(ctx(world));
    const after2 = world.getComponent("player", "GridMover");
    // Same reference means the system short-circuited the rewrite.
    expect(after1).toBe(after2);
  });

  it("dispose() detaches DOM listeners without throwing in a non-DOM env", () => {
    const system = createKaboomPlayerInputSystem({ pressedKeys: new Set() });
    expect(() => system.dispose()).not.toThrow();
  });
});
