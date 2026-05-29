// S207 — blast-scorch-system spawns a rounded '+' shape per blast +
// ticks the Y-scale fade. Spawn-side is exercised by
// `spawnBlastScorchCross`; tick-side by the system.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import {
  createKaboomBlastScorchSystem,
  spawnBlastScorchCross
} from "../../src/systems/blast-scorch-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0 }
  };
}

function countScorches(world: World): number {
  let n = 0;
  for (const id of world.entityIds()) {
    if (id.startsWith("kaboom.blast-scorch.") && world.hasComponent(id, "BlastScorch")) n += 1;
  }
  return n;
}

function caps(world: World): number {
  let n = 0;
  for (const id of world.entityIds()) {
    if (id.startsWith("kaboom.blast-scorch.cap.")) n += 1;
  }
  return n;
}

function segs(world: World): number {
  let n = 0;
  for (const id of world.entityIds()) {
    if (id.startsWith("kaboom.blast-scorch.seg.")) n += 1;
  }
  return n;
}

describe("kaboom blast scorch (S207)", () => {
  it("spawnBlastScorchCross with all-zero reach: only the centre cap", () => {
    const world = new World();
    spawnBlastScorchCross(world, 5, 5, { east: 0, west: 0, north: 0, south: 0 });
    expect(caps(world)).toBe(1);
    expect(segs(world)).toBe(0);
  });

  it("spawnBlastScorchCross with reach 2 in each direction: 1 centre + 4 caps + 4 segments", () => {
    const world = new World();
    spawnBlastScorchCross(world, 5, 5, { east: 2, west: 2, north: 2, south: 2 });
    expect(caps(world)).toBe(5);
    expect(segs(world)).toBe(4);
  });

  it("spawnBlastScorchCross with single-direction reach: 1 centre + 1 cap + 1 segment", () => {
    const world = new World();
    spawnBlastScorchCross(world, 5, 5, { east: 3, west: 0, north: 0, south: 0 });
    expect(caps(world)).toBe(2);
    expect(segs(world)).toBe(1);
  });

  it("system ticks Y-scale down across lifetime and removes expired entities", () => {
    const world = new World();
    spawnBlastScorchCross(world, 5, 5, { east: 0, west: 0, north: 0, south: 0 });
    const sys = createKaboomBlastScorchSystem();
    // First tick — Y-scale should still be close to baseline.
    sys.fixedUpdate!(ctx(world));
    let yEarly: number | undefined;
    for (const id of world.entityIds()) {
      if (!id.startsWith("kaboom.blast-scorch.cap.")) continue;
      const t = world.getComponent<{ scale?: ReadonlyArray<number> }>(id, "Transform");
      yEarly = t?.scale?.[1];
    }
    expect(yEarly).toBeGreaterThan(0.03);
    // Run for >2.2s so the entity expires.
    for (let i = 0; i < 200; i += 1) sys.fixedUpdate!(ctx(world));
    expect(countScorches(world)).toBe(0);
  });

  it("system shrinks Y-scale progressively (mid-life < spawn)", () => {
    const world = new World();
    spawnBlastScorchCross(world, 5, 5, { east: 0, west: 0, north: 0, south: 0 });
    const sys = createKaboomBlastScorchSystem();
    sys.fixedUpdate!(ctx(world));
    let capId: string | undefined;
    for (const id of world.entityIds()) {
      if (id.startsWith("kaboom.blast-scorch.cap.")) capId = id;
    }
    expect(capId).toBeDefined();
    const earlyY = (world.getComponent<{ scale?: ReadonlyArray<number> }>(capId!, "Transform")?.scale?.[1]) ?? 0;
    expect(earlyY).toBeGreaterThan(0);
    for (let i = 0; i < 66; i += 1) sys.fixedUpdate!(ctx(world));
    const midY = (world.getComponent<{ scale?: ReadonlyArray<number> }>(capId!, "Transform")?.scale?.[1]) ?? 0;
    expect(midY).toBeLessThan(earlyY);
  });
});
