// S268 KABOOM-STEP-JUMP-LANDING-POP — bomber Y-scale takes a brief
// extra dip on the step-jump TRUE→FALSE edge so the touchdown reads
// as a real thud (not a mirror of the takeoff). Decays as (1-t)^2
// over 120ms.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import {
  createKaboomBomberHeightLiftSystem,
  landingPopScaleY
} from "../../src/systems/bomber-height-lift-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0 }
  };
}

function makeWorld(heightmap?: number[][]): World {
  const world = new World();
  world.addEntity("grid.config");
  world.setComponent("grid.config", "Grid", { cellSize: 1, sizeX: 8, sizeZ: 8, originX: 0, originZ: 0 });
  if (heightmap !== undefined) {
    world.setComponent("grid.config", "Heightmap", { values: heightmap });
  }
  return world;
}

function addBomber(world: World, id: string, gx: number, gz: number): void {
  world.addEntity(id);
  world.setComponent(id, "BomberStats", { maxBombs: 1, range: 2 });
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "Transform", { position: [gx, 0.4, gz], rotation: [0, 0, 0], scale: [1, 1, 1] });
  world.setComponent(id, "BenchAnimationState", { kind: "walk" });
}

function setMover(world: World, id: string, targetGx: number, targetGz: number, t: number): void {
  world.setComponent(id, "GridMover", { speed: 4, currentLerp: t, targetGx, targetGz });
}

function scaleOf(world: World, id: string): [number, number, number] {
  const t = world.getComponent<{ scale?: ReadonlyArray<number> }>(id, "Transform");
  const s = t?.scale ?? [1, 1, 1];
  return [s[0] ?? 1, s[1] ?? 1, s[2] ?? 1];
}

describe("landingPopScaleY (S268 pure helper)", () => {
  it("returns 1 - amount at t=0 (full pop)", () => {
    expect(landingPopScaleY(0, 0.18, 0.12)).toBeCloseTo(0.82, 5);
  });

  it("returns 1 at t >= duration (pop done)", () => {
    expect(landingPopScaleY(0.12, 0.18, 0.12)).toBe(1);
    expect(landingPopScaleY(0.5, 0.18, 0.12)).toBe(1);
  });

  it("decays as (1-t)^2 — midpoint t=0.5 gives amount * 0.25", () => {
    const v = landingPopScaleY(0.06, 0.18, 0.12);
    expect(v).toBeCloseTo(1 - 0.18 * 0.25, 5);
  });

  it("monotone non-decreasing across the window", () => {
    let prev = landingPopScaleY(0, 0.18, 0.12);
    for (let i = 1; i <= 12; i += 1) {
      const v = landingPopScaleY(i / 100, 0.18, 0.12);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
  });
});

describe("createKaboomBomberHeightLiftSystem (S268 landing pop integration)", () => {
  it("kicks off an extra Y-squash on the step-jump TRUE→FALSE edge", () => {
    const world = makeWorld([[0, 1, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]]);
    addBomber(world, "bot.j", 0, 0);
    const system = createKaboomBomberHeightLiftSystem();
    // Tick 1: stationary. Captures the authored baseline scale.
    system.fixedUpdate!(ctx(world));
    const baseScale = scaleOf(world, "bot.j");
    // Tick 2: mid-jump (currentLerp 0.5 from (0,0) → (1,0), height delta 1).
    setMover(world, "bot.j", 1, 0, 0.5);
    system.fixedUpdate!(ctx(world));
    const midScale = scaleOf(world, "bot.j");
    // Tick 3: tween done — bomber snaps to (1,0), no targetGx/Gz.
    world.setComponent("bot.j", "GridPosition", { gx: 1, gz: 0 });
    world.setComponent("bot.j", "GridMover", { speed: 4, currentLerp: 0 });
    system.fixedUpdate!(ctx(world));
    const landScale = scaleOf(world, "bot.j");
    // Landing scale Y should be LESS than baseline (popped down) on
    // the landing tick — base * (1 - 0.18) ≈ base * 0.82.
    expect(landScale[1]).toBeLessThan(baseScale[1] * 0.95);
    void midScale;
  });

  it("pop wears off after LAND_POP_DURATION_S", () => {
    const world = makeWorld([[0, 1, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]]);
    addBomber(world, "bot.j", 0, 0);
    const system = createKaboomBomberHeightLiftSystem();
    system.fixedUpdate!(ctx(world));
    setMover(world, "bot.j", 1, 0, 0.5);
    system.fixedUpdate!(ctx(world));
    world.setComponent("bot.j", "GridPosition", { gx: 1, gz: 0 });
    world.setComponent("bot.j", "GridMover", { speed: 4, currentLerp: 0 });
    // Run enough ticks (each = 1/60s) to exceed 0.12s = 7.2 frames.
    for (let i = 0; i < 12; i += 1) system.fixedUpdate!(ctx(world));
    const finalScale = scaleOf(world, "bot.j");
    // After the pop window, Y-scale should be back at the authored baseline (1).
    expect(finalScale[1]).toBeCloseTo(1, 4);
  });

  it("flat-cell tween does NOT trigger a pop", () => {
    const world = makeWorld([[0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]]);
    addBomber(world, "bot.j", 0, 0);
    const system = createKaboomBomberHeightLiftSystem();
    system.fixedUpdate!(ctx(world));
    setMover(world, "bot.j", 1, 0, 0.5);
    system.fixedUpdate!(ctx(world));
    world.setComponent("bot.j", "GridPosition", { gx: 1, gz: 0 });
    world.setComponent("bot.j", "GridMover", { speed: 4, currentLerp: 0 });
    system.fixedUpdate!(ctx(world));
    const landScale = scaleOf(world, "bot.j");
    expect(landScale[1]).toBeCloseTo(1, 4);
  });
});
