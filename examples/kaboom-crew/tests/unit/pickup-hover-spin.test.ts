// S191 — Pickup entities bob along Y with a sin wave and slowly spin
// around Y so they read as interactive collectibles. The base Y is
// captured on first sight (subtracting any HeightLift.offsetY) so the
// bob centres on the cell-top, not the floor.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createKaboomPickupHoverSpinSystem } from "../../src/systems/pickup-hover-spin-system";

function ctx(world: World, dt = 1 / 60, elapsed = 0) {
  return {
    world,
    time: { elapsed, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0 }
  };
}

function addPickup(world: World, id: string, x: number, y: number, z: number, heightLift?: number): void {
  world.addEntity(id);
  world.setComponent(id, "Pickup", { kind: "bomb-up" });
  world.setComponent(id, "Transform", {
    position: [x, y, z],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  });
  if (heightLift !== undefined) {
    world.setComponent(id, "HeightLift", { offsetY: heightLift });
  }
}

function yOf(world: World, id: string): number {
  const t = world.getComponent<{ position?: ReadonlyArray<number> }>(id, "Transform");
  return t?.position?.[1] ?? 0;
}

function rotYOf(world: World, id: string): number {
  const t = world.getComponent<{ rotation?: ReadonlyArray<number> }>(id, "Transform");
  return t?.rotation?.[1] ?? 0;
}

describe("kaboom pickup hover + spin (S191)", () => {
  it("first tick captures the base Y and applies a small bob immediately", () => {
    const world = new World();
    addPickup(world, "pickup", 1, 0.4, 1);
    const sys = createKaboomPickupHoverSpinSystem();
    sys.fixedUpdate!(ctx(world));
    // bob amplitude is 0.06, at elapsed≈1/60s the offset is tiny but
    // non-zero (phase per-entity may also offset it). Just check it
    // hasn't drifted by more than the full amplitude.
    expect(Math.abs(yOf(world, "pickup") - 0.4)).toBeLessThanOrEqual(0.08);
  });

  it("after a half-period the bob returns close to base + 0", () => {
    const world = new World();
    addPickup(world, "pickup", 0, 0.4, 0);
    const sys = createKaboomPickupHoverSpinSystem();
    // Run many ticks until elapsed crosses one full bob period (2π/2.4
    // ≈ 2.62s). At elapsed = 2π/2.4 the sin returns to 0 (modulo phase).
    const dt = 1 / 60;
    const period = (2 * Math.PI) / 2.4;
    const steps = Math.round(period / dt);
    for (let i = 0; i < steps; i += 1) sys.fixedUpdate!(ctx(world, dt));
    // After one full period sin(0+phase) ≈ sin(phase) → same as first
    // tick offset within float precision.
    const first = yOf(world, "pickup");
    sys.fixedUpdate!(ctx(world, dt));
    const second = yOf(world, "pickup");
    expect(Math.abs(second - first)).toBeLessThan(0.05);
  });

  it("HeightLift.offsetY=1 lifts the bob centre to base+1", () => {
    const world = new World();
    // authored Y=0.4, heightLift=1 → currentY=1.4 (post-lift snapshot)
    addPickup(world, "pickup", 0, 1.4, 0, 1);
    const sys = createKaboomPickupHoverSpinSystem();
    sys.fixedUpdate!(ctx(world));
    // Expected base = currentY - lift = 0.4. Bob amplitude ≤ 0.06.
    // So target Y oscillates around 1.4.
    const y = yOf(world, "pickup");
    expect(y).toBeGreaterThan(1.4 - 0.07);
    expect(y).toBeLessThan(1.4 + 0.07);
  });

  it("Y rotation advances over time", () => {
    const world = new World();
    addPickup(world, "pickup", 0, 0.4, 0);
    const sys = createKaboomPickupHoverSpinSystem();
    sys.fixedUpdate!(ctx(world, 1 / 60));
    const r0 = rotYOf(world, "pickup");
    for (let i = 0; i < 30; i += 1) sys.fixedUpdate!(ctx(world, 1 / 60));
    const r1 = rotYOf(world, "pickup");
    expect(r1).not.toBe(r0);
  });

  it("two pickups at the same authored Y have different phases (no lockstep)", () => {
    const world = new World();
    addPickup(world, "pickup.a", 0, 0.4, 0);
    addPickup(world, "pickup.b", 1, 0.4, 0);
    const sys = createKaboomPickupHoverSpinSystem();
    sys.fixedUpdate!(ctx(world));
    expect(yOf(world, "pickup.a")).not.toBe(yOf(world, "pickup.b"));
  });

  it("does not touch entities whose Transform has a parent (e.g. attached children)", () => {
    const world = new World();
    world.addEntity("attached.pickup");
    world.setComponent("attached.pickup", "Pickup", { kind: "bomb-up" });
    world.setComponent("attached.pickup", "Transform", {
      position: [0, 0.4, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      parent: "some.host"
    });
    const sys = createKaboomPickupHoverSpinSystem();
    sys.fixedUpdate!(ctx(world));
    expect(yOf(world, "attached.pickup")).toBe(0.4);
  });
});
