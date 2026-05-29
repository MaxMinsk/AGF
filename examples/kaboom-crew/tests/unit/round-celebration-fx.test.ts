// S199 — round-celebration-fx-system spawns a particle burst on the
// tick the round phase transitions to 'won' / 'draw'. 'lost' is
// intentionally quiet (so the player's defeat doesn't get a confetti
// rub-in). Idempotent — does NOT re-burst if the phase stays the same.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createKaboomRoundCelebrationFxSystem } from "../../src/systems/round-celebration-fx-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0 }
  };
}

function seedRound(world: World, phase: "playing" | "won" | "lost" | "draw", winnerId?: string): void {
  if (!world.hasEntity("kaboom.round-state")) world.addEntity("kaboom.round-state");
  const data: { phase: string; winnerId?: string } = { phase };
  if (winnerId !== undefined) data.winnerId = winnerId;
  world.setComponent("kaboom.round-state", "RoundState", data);
}

function seedBomber(world: World, id: string, x: number, z: number): void {
  world.addEntity(id);
  world.setComponent(id, "Transform", {
    position: [x, 0.4, z],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  });
}

function seedArena(world: World, sizeX = 15, sizeZ = 11): void {
  world.addEntity("grid.config");
  world.setComponent("grid.config", "Grid", {
    cellSize: 1,
    sizeX,
    sizeZ,
    originX: 0,
    originZ: 0
  });
}

function countCelebrationEmitters(world: World, kind: "victory" | "draw"): number {
  let n = 0;
  const prefix = `kaboom.round-celebration.${kind}.`;
  for (const id of world.entityIds()) {
    if (id.startsWith(prefix) && world.hasComponent(id, "ParticleEmitter")) n += 1;
  }
  return n;
}

describe("kaboom round celebration fx (S199)", () => {
  it("playing phase: no celebration emitters", () => {
    const world = new World();
    seedRound(world, "playing");
    const sys = createKaboomRoundCelebrationFxSystem();
    for (let i = 0; i < 30; i += 1) sys.fixedUpdate!(ctx(world));
    expect(countCelebrationEmitters(world, "victory")).toBe(0);
    expect(countCelebrationEmitters(world, "draw")).toBe(0);
  });

  it("phase transition playing → won: spawns one victory burst at the winner's Transform", () => {
    const world = new World();
    seedBomber(world, "player.1", 4, 7);
    seedRound(world, "playing");
    const sys = createKaboomRoundCelebrationFxSystem();
    sys.fixedUpdate!(ctx(world));
    seedRound(world, "won", "player.1");
    sys.fixedUpdate!(ctx(world));
    expect(countCelebrationEmitters(world, "victory")).toBe(1);
    // Burst position should be near the winner's pos (slight Y lift).
    let burstZ: number | undefined;
    for (const id of world.entityIds()) {
      if (!id.startsWith("kaboom.round-celebration.victory.")) continue;
      const t = world.getComponent<{ position?: ReadonlyArray<number> }>(id, "Transform");
      burstZ = t?.position?.[2];
    }
    expect(burstZ).toBe(7);
  });

  it("idempotent: staying on 'won' across multiple ticks only bursts once", () => {
    const world = new World();
    seedBomber(world, "player.1", 4, 7);
    seedRound(world, "playing");
    const sys = createKaboomRoundCelebrationFxSystem();
    sys.fixedUpdate!(ctx(world));
    seedRound(world, "won", "player.1");
    for (let i = 0; i < 30; i += 1) sys.fixedUpdate!(ctx(world));
    expect(countCelebrationEmitters(world, "victory")).toBe(1);
  });

  it("phase transition playing → lost: NO emitter (defeat is quiet)", () => {
    const world = new World();
    seedRound(world, "playing");
    const sys = createKaboomRoundCelebrationFxSystem();
    sys.fixedUpdate!(ctx(world));
    seedRound(world, "lost");
    sys.fixedUpdate!(ctx(world));
    expect(countCelebrationEmitters(world, "victory")).toBe(0);
    expect(countCelebrationEmitters(world, "draw")).toBe(0);
  });

  it("phase transition playing → draw: spawns a smaller spark burst at the arena centre", () => {
    const world = new World();
    seedArena(world, 15, 11);
    seedRound(world, "playing");
    const sys = createKaboomRoundCelebrationFxSystem();
    sys.fixedUpdate!(ctx(world));
    seedRound(world, "draw");
    sys.fixedUpdate!(ctx(world));
    expect(countCelebrationEmitters(world, "draw")).toBe(1);
    // Arena centre: gx=(15-1)/2=7, gz=(11-1)/2=5.
    let burstX: number | undefined;
    let burstZ: number | undefined;
    for (const id of world.entityIds()) {
      if (!id.startsWith("kaboom.round-celebration.draw.")) continue;
      const t = world.getComponent<{ position?: ReadonlyArray<number> }>(id, "Transform");
      burstX = t?.position?.[0];
      burstZ = t?.position?.[2];
    }
    expect(burstX).toBe(7);
    expect(burstZ).toBe(5);
  });

  it("won → playing → won → playing → won: 3 distinct bursts (one per upward transition)", () => {
    const world = new World();
    seedBomber(world, "player.1", 4, 7);
    seedRound(world, "playing");
    const sys = createKaboomRoundCelebrationFxSystem();
    sys.fixedUpdate!(ctx(world));
    seedRound(world, "won", "player.1");
    sys.fixedUpdate!(ctx(world));
    seedRound(world, "playing");
    sys.fixedUpdate!(ctx(world));
    seedRound(world, "won", "player.1");
    sys.fixedUpdate!(ctx(world));
    seedRound(world, "playing");
    sys.fixedUpdate!(ctx(world));
    seedRound(world, "won", "player.1");
    sys.fixedUpdate!(ctx(world));
    expect(countCelebrationEmitters(world, "victory")).toBe(3);
  });

  it("won phase but missing winnerId / non-existent winner entity: no burst", () => {
    const world = new World();
    seedRound(world, "playing");
    const sys = createKaboomRoundCelebrationFxSystem();
    sys.fixedUpdate!(ctx(world));
    seedRound(world, "won", "ghost.entity");
    sys.fixedUpdate!(ctx(world));
    expect(countCelebrationEmitters(world, "victory")).toBe(0);
  });
});
