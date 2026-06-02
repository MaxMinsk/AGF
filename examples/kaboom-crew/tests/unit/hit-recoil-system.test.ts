// S109 KABOOM-SHIELD-POWER-UP + KABOOM-HIT-RECOIL — unit tests for the
// new hit-recoil system + its pure helpers.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import {
  RECOIL_OUT_S,
  RECOIL_PEAK_DEG,
  RECOIL_RETURN_S,
  RECOIL_TOTAL_S,
  createKaboomHitRecoilSystem,
  hitRecoilRotationDeg,
  recoilPeakDeg
} from "../../src/systems/hit-recoil-system";

function ctx(world: World, fixedDt = 1 / 60, elapsed = 0) {
  return {
    world,
    time: { elapsed, dt: fixedDt, fixedDt, frameCount: 0, fixedStepCount: 0 }
  };
}

function addBomberWithTorso(world: World, opts: { gx?: number; gz?: number } = {}) {
  const root = "player.1";
  const torso = "player.1.torso";
  world.addEntity(root);
  world.setComponent(root, "GridPosition", { gx: opts.gx ?? 5, gz: opts.gz ?? 5 });
  world.addEntity(torso);
  world.setComponent(torso, "Transform", { position: [0, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
}

describe("hitRecoilRotationDeg (S109 pure helper)", () => {
  it("returns 0 at elapsed=0", () => {
    expect(hitRecoilRotationDeg(0, 8)).toBe(0);
  });
  it("returns peak at end of outbound leg", () => {
    expect(hitRecoilRotationDeg(RECOIL_OUT_S, 8)).toBeCloseTo(8, 5);
  });
  it("returns 0 at end of return leg", () => {
    expect(hitRecoilRotationDeg(RECOIL_TOTAL_S, 8)).toBeCloseTo(0, 5);
  });
  it("returns 0 past total duration", () => {
    expect(hitRecoilRotationDeg(RECOIL_TOTAL_S + 0.5, 8)).toBe(0);
  });
  it("respects sign of peakDeg (negative pitch direction)", () => {
    expect(hitRecoilRotationDeg(RECOIL_OUT_S, -8)).toBeCloseTo(-8, 5);
  });
  it("midpoint of return leg is half of peak", () => {
    expect(hitRecoilRotationDeg(RECOIL_OUT_S + RECOIL_RETURN_S / 2, 8)).toBeCloseTo(4, 5);
  });
});

describe("recoilPeakDeg (S109 pure helper)", () => {
  it("bomber north of blast → positive pitch", () => {
    expect(recoilPeakDeg(5, 7, 5, 5)).toBe(RECOIL_PEAK_DEG);
  });
  it("bomber south of blast → negative pitch", () => {
    expect(recoilPeakDeg(5, 3, 5, 5)).toBe(-RECOIL_PEAK_DEG);
  });
  it("direct hit (same cell) → positive (fallback)", () => {
    expect(recoilPeakDeg(5, 5, 5, 5)).toBe(RECOIL_PEAK_DEG);
  });
});

describe("createKaboomHitRecoilSystem (S109)", () => {
  it("consumes a HitRecoilRequest into a HitRecoilActive", () => {
    const world = new World();
    addBomberWithTorso(world);
    world.setComponent("player.1", "HitRecoilRequest", { blastOriginGx: 5, blastOriginGz: 3 });
    const system = createKaboomHitRecoilSystem();
    system.fixedUpdate!(ctx(world));
    expect(world.hasComponent("player.1", "HitRecoilRequest")).toBe(false);
    const active = world.getComponent<{ elapsed: number; peakDeg: number; torsoId: string }>("player.1", "HitRecoilActive");
    expect(active).toBeDefined();
    expect(active!.peakDeg).toBe(RECOIL_PEAK_DEG); // bomber at (5,5), blast at (5,3) → north of blast → +peak
    expect(active!.torsoId).toBe("player.1.torso");
  });

  it("does nothing when the bomber has no torso entity (defensive)", () => {
    const world = new World();
    world.addEntity("player.1");
    world.setComponent("player.1", "HitRecoilRequest", { blastOriginGx: 5, blastOriginGz: 3 });
    const system = createKaboomHitRecoilSystem();
    system.fixedUpdate!(ctx(world));
    expect(world.hasComponent("player.1", "HitRecoilRequest")).toBe(false);
    expect(world.hasComponent("player.1", "HitRecoilActive")).toBe(false);
  });

  it("ticks torso rotation.X and clears HitRecoilActive past total duration", () => {
    const world = new World();
    addBomberWithTorso(world);
    world.setComponent("player.1", "HitRecoilRequest", { blastOriginGx: 5, blastOriginGz: 3 });
    const system = createKaboomHitRecoilSystem();
    // Frame 1 — consumes request AND ticks one fixedDt → small positive rotation.
    system.fixedUpdate!(ctx(world));
    let torso = world.getComponent<{ rotation: ReadonlyArray<number> }>("player.1.torso", "Transform")!;
    expect(torso.rotation[0]!).toBeGreaterThan(0);
    expect(torso.rotation[0]!).toBeLessThan(RECOIL_PEAK_DEG);
    // Frame ~6 (~0.1 s) — at end of outbound leg → peak.
    for (let i = 0; i < 6; i += 1) system.fixedUpdate!(ctx(world));
    torso = world.getComponent<{ rotation: ReadonlyArray<number> }>("player.1.torso", "Transform")!;
    expect(torso.rotation[0]!).toBeGreaterThan(5); // somewhere near the peak (8°)
    // Push past total duration — should clear + zero rotation.
    for (let i = 0; i < 40; i += 1) system.fixedUpdate!(ctx(world));
    expect(world.hasComponent("player.1", "HitRecoilActive")).toBe(false);
    torso = world.getComponent<{ rotation: ReadonlyArray<number> }>("player.1.torso", "Transform")!;
    expect(torso.rotation[0]!).toBe(0);
  });

  it("S244 KABOOM-SHIELD-SAVE-PUFF: co-spawns a short-lived ParticleEmitter at the bomber's cell", () => {
    const world = new World();
    addBomberWithTorso(world, { gx: 4, gz: 7 });
    world.setComponent("player.1", "HitRecoilRequest", { blastOriginGx: 4, blastOriginGz: 9 });
    const system = createKaboomHitRecoilSystem();
    system.fixedUpdate!(ctx(world));
    // Find the puff via the id prefix — counter is module-scoped so the
    // suffix may be any positive integer depending on test order.
    const puffIds: string[] = [];
    for (const id of world.entityIds()) {
      if (id.startsWith("player.1.shield-save.")) puffIds.push(id);
    }
    expect(puffIds.length).toBe(1);
    const puffId = puffIds[0]!;
    const emitter = world.getComponent<{
      preset?: string;
      lifetime?: number;
      elapsed?: number;
      rate?: number;
      maxParticles?: number;
    }>(puffId, "ParticleEmitter")!;
    expect(emitter.preset).toBe("glow");
    expect(emitter.lifetime).toBeCloseTo(0.4, 6);
    expect(emitter.maxParticles).toBe(16);
    const transform = world.getComponent<{ position: ReadonlyArray<number> }>(puffId, "Transform")!;
    expect(transform.position[0]).toBe(4);
    expect(transform.position[2]).toBe(7);
  });

  it("S244 KABOOM-SHIELD-SAVE-PUFF: bomber with no torso does NOT spawn the puff", () => {
    const world = new World();
    world.addEntity("player.1");
    world.setComponent("player.1", "GridPosition", { gx: 5, gz: 5 });
    world.setComponent("player.1", "HitRecoilRequest", { blastOriginGx: 5, blastOriginGz: 3 });
    const system = createKaboomHitRecoilSystem();
    system.fixedUpdate!(ctx(world));
    for (const id of world.entityIds()) {
      expect(id.startsWith("player.1.shield-save.")).toBe(false);
    }
  });

  it("preserves torso rotation.Y and .Z (only writes X)", () => {
    const world = new World();
    addBomberWithTorso(world);
    world.setComponent("player.1.torso", "Transform", { position: [0, 1, 0], rotation: [0, 45, 22], scale: [1, 1, 1] });
    world.setComponent("player.1", "HitRecoilRequest", { blastOriginGx: 5, blastOriginGz: 3 });
    const system = createKaboomHitRecoilSystem();
    system.fixedUpdate!(ctx(world));
    system.fixedUpdate!(ctx(world));
    const torso = world.getComponent<{ rotation: ReadonlyArray<number> }>("player.1.torso", "Transform")!;
    expect(torso.rotation[1]!).toBe(45);
    expect(torso.rotation[2]!).toBe(22);
  });
});
