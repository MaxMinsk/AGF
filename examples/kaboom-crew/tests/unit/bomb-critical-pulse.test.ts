// S270 KABOOM-BOMB-FUSE-CRITICAL-PULSE — a one-shot red puff fires
// the tick a bomb's fuse first crosses below 0.4s, so the player
// has a final "GET OUT" cue beyond the mesh wiggle + colour pulse.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createKaboomBombFuseSystem } from "../../src/systems/bomb-fuse-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0 }
  };
}

function addBomb(world: World, id: string, gx: number, gz: number, fuse: number): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "GridOccupant", { layer: "bomb", blocksMovement: false, blocksBlast: false });
  world.setComponent(id, "Bomb", { fuseRemaining: fuse, range: 2, ownerId: "player.1" });
  world.setComponent(id, "MeshRenderer", { mesh: "sphere", color: "#1a1a1a" });
  world.setComponent(id, "Transform", { position: [gx, 0.35, gz], rotation: [0, 0, 0], scale: [0.35, 0.35, 0.35] });
}

function addBomberOwner(world: World): void {
  world.addEntity("player.1");
  world.setComponent("player.1", "BomberStats", { maxBombs: 1, range: 2, activeBombs: 1, alive: true });
}

describe("S270 KABOOM-BOMB-FUSE-CRITICAL-PULSE", () => {
  it("fires a red puff the first tick fuse drops below 0.4s", () => {
    const world = new World();
    addBomberOwner(world);
    addBomb(world, "bomb.x", 5, 5, 0.42); // just above the threshold
    const fuse = createKaboomBombFuseSystem();
    // Tick 1: fuse 0.42 - 1/60 ≈ 0.4033 → still above 0.4 (threshold check is `<=`).
    fuse.fixedUpdate!(ctx(world));
    expect(world.hasEntity("bomb.x.critical-pulse")).toBe(false);
    let bomb = world.getComponent<{ criticalPulseFired?: boolean; fuseRemaining: number }>("bomb.x", "Bomb")!;
    expect(bomb.criticalPulseFired).toBeFalsy();
    // Tick 2: fuse drops below 0.4 → puff fires.
    fuse.fixedUpdate!(ctx(world));
    expect(world.hasEntity("bomb.x.critical-pulse")).toBe(true);
    bomb = world.getComponent<{ criticalPulseFired?: boolean; fuseRemaining: number }>("bomb.x", "Bomb")!;
    expect(bomb.criticalPulseFired).toBe(true);
    const emitter = world.getComponent<{ color?: string; preset?: string; lifetime?: number }>("bomb.x.critical-pulse", "ParticleEmitter")!;
    expect(emitter.color).toBe("#ff3030");
    expect(emitter.preset).toBe("spark");
    expect(emitter.lifetime).toBeCloseTo(0.15, 6);
  });

  it("does NOT re-fire on subsequent ticks (sticky flag)", () => {
    const world = new World();
    addBomberOwner(world);
    addBomb(world, "bomb.x", 3, 4, 0.3); // already under threshold
    const fuse = createKaboomBombFuseSystem();
    fuse.fixedUpdate!(ctx(world));
    // First tick fires the puff.
    expect(world.hasEntity("bomb.x.critical-pulse")).toBe(true);
    // Subsequent ticks: spawnPuff is idempotent on the same id, so even
    // if the system retries it's a no-op. But verify criticalPulseFired
    // stays true so we don't even attempt the re-spawn.
    for (let i = 0; i < 5; i += 1) fuse.fixedUpdate!(ctx(world));
    const bomb = world.getComponent<{ criticalPulseFired?: boolean }>("bomb.x", "Bomb");
    if (bomb !== undefined) expect(bomb.criticalPulseFired).toBe(true);
  });

  it("high-fuse bomb (well above 0.4) does NOT fire the pulse", () => {
    const world = new World();
    addBomberOwner(world);
    addBomb(world, "bomb.x", 5, 5, 2.5);
    const fuse = createKaboomBombFuseSystem();
    for (let i = 0; i < 10; i += 1) fuse.fixedUpdate!(ctx(world));
    expect(world.hasEntity("bomb.x.critical-pulse")).toBe(false);
    const bomb = world.getComponent<{ criticalPulseFired?: boolean }>("bomb.x", "Bomb")!;
    expect(bomb.criticalPulseFired).toBeFalsy();
  });
});
