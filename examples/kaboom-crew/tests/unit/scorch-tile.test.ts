// S213 KABOOM-SCORCH-V2 (GDP-2026-05-30-004 Approach 2). Covers the
// spawn helper (cylinder/box mesh + ScorchTile + Tween are written),
// the lifetime system that ticks elapsedMs + GCs expired entities,
// and the integration with blast-propagation (one ScorchTile per
// blast cell).

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";

import {
  SCORCH_LIFETIME_MS_DEFAULT,
  createKaboomScorchTileLifetimeSystem,
  spawnScorchTile
} from "../../src/systems/scorch-tile-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0 }
  };
}

function findOne(world: World, prefix: string): string | undefined {
  for (const id of world.entityIds()) {
    if (id.startsWith(prefix)) return id;
  }
  return undefined;
}

function countScorches(world: World): number {
  let n = 0;
  for (const id of world.entityIds()) {
    if (id.startsWith("kaboom.scorch.") && world.hasComponent(id, "ScorchTile")) n += 1;
  }
  return n;
}

describe("kaboom scorch tile (S213)", () => {
  it("spawnScorchTile writes a box MeshRenderer + ScorchTile + scale-tween", () => {
    const world = new World();
    spawnScorchTile(world, 5, 5);
    const id = findOne(world, "kaboom.scorch.");
    expect(id).toBeDefined();
    const mr = world.getComponent<{ mesh?: string; color?: string }>(id!, "MeshRenderer");
    expect(mr?.mesh).toBe("box");
    expect(mr?.color).toBeDefined();
    expect(world.hasComponent(id!, "ScorchTile")).toBe(true);
    const tweens = world.getComponent<Array<{ property?: string }>>(id!, "Tweens") ?? [];
    expect(tweens.some((t) => t.property === "scale")).toBe(true);
  });

  it("Transform.scale at spawn has both X and Z > 0 (the slab is visible)", () => {
    const world = new World();
    spawnScorchTile(world, 5, 5);
    const id = findOne(world, "kaboom.scorch.")!;
    const t = world.getComponent<{ scale?: ReadonlyArray<number> }>(id, "Transform");
    expect((t?.scale?.[0] ?? 0)).toBeGreaterThan(0);
    expect((t?.scale?.[2] ?? 0)).toBeGreaterThan(0);
  });

  it("lifetime system ticks elapsedMs each fixedUpdate", () => {
    const world = new World();
    spawnScorchTile(world, 5, 5);
    const id = findOne(world, "kaboom.scorch.")!;
    const sys = createKaboomScorchTileLifetimeSystem();
    sys.fixedUpdate!(ctx(world, 0.1));
    const sc = world.getComponent<{ elapsedMs?: number }>(id, "ScorchTile");
    expect(sc?.elapsedMs).toBeCloseTo(100, 1);
  });

  it("expired scorch (elapsed >= lifetime) is removed", () => {
    const world = new World();
    spawnScorchTile(world, 5, 5, 500);
    const sys = createKaboomScorchTileLifetimeSystem();
    // 1 s of ticks at 1/60 → 60 ticks > 500 ms lifetime.
    for (let i = 0; i < 60; i += 1) sys.fixedUpdate!(ctx(world));
    expect(countScorches(world)).toBe(0);
  });

  it("two blasts on the same cell stack into two independent ScorchTile entities", () => {
    const world = new World();
    spawnScorchTile(world, 5, 5);
    spawnScorchTile(world, 5, 5);
    expect(countScorches(world)).toBe(2);
  });

  it("default lifetime constant is at least 2 seconds (the soot lingers)", () => {
    expect(SCORCH_LIFETIME_MS_DEFAULT).toBeGreaterThanOrEqual(2000);
  });
});
