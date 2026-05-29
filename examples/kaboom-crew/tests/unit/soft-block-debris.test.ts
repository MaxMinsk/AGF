// S192 — soft-block-debris-system spawns N small box-debris chunks at
// a destroyed soft block cell. The chunks carry AccessoryDebris so the
// engine integration loop in accessory-detach-system tweens them.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createKaboomSoftBlockDebrisSystem } from "../../src/systems/soft-block-debris-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0 }
  };
}

function emitSoftBlockEvent(world: World, id: string, gx: number, gz: number): void {
  world.addEntity(id);
  world.setComponent(id, "SoftBlockDestroyedEvent", { gx, gz });
}

function countDebrisEntities(world: World): number {
  let n = 0;
  for (const id of world.entityIds()) {
    if (world.hasComponent(id, "AccessoryDebris") && id.startsWith("kaboom.soft-debris.")) {
      n += 1;
    }
  }
  return n;
}

describe("kaboom soft-block-debris (S192)", () => {
  it("spawns 6 debris chunks when a single SoftBlockDestroyedEvent is present", () => {
    const world = new World();
    emitSoftBlockEvent(world, "evt.1", 3, 5);
    const sys = createKaboomSoftBlockDebrisSystem();
    sys.fixedUpdate!(ctx(world));
    expect(countDebrisEntities(world)).toBe(6);
  });

  it("debris carries non-zero outward velocity + upward kick", () => {
    const world = new World();
    emitSoftBlockEvent(world, "evt.1", 3, 5);
    const sys = createKaboomSoftBlockDebrisSystem();
    sys.fixedUpdate!(ctx(world));
    let upwardChunks = 0;
    let outwardChunks = 0;
    for (const id of world.entityIds()) {
      if (!id.startsWith("kaboom.soft-debris.")) continue;
      const state = world.getComponent<{ vx: number; vy: number; vz: number }>(id, "AccessoryDebris");
      expect(state).toBeDefined();
      if (state!.vy > 0) upwardChunks += 1;
      const horizontalSpeed = Math.hypot(state!.vx, state!.vz);
      if (horizontalSpeed > 0.5) outwardChunks += 1;
    }
    expect(upwardChunks).toBe(6); // every chunk gets upward kick
    expect(outwardChunks).toBe(6); // every chunk moves outward
  });

  it("two events on the same tick produce 12 chunks", () => {
    const world = new World();
    emitSoftBlockEvent(world, "evt.1", 1, 1);
    emitSoftBlockEvent(world, "evt.2", 5, 7);
    const sys = createKaboomSoftBlockDebrisSystem();
    sys.fixedUpdate!(ctx(world));
    expect(countDebrisEntities(world)).toBe(12);
  });

  it("does not re-burst the same event on a second tick", () => {
    const world = new World();
    emitSoftBlockEvent(world, "evt.1", 3, 5);
    const sys = createKaboomSoftBlockDebrisSystem();
    sys.fixedUpdate!(ctx(world));
    expect(countDebrisEntities(world)).toBe(6);
    // Event entity still in world — second tick must NOT spawn more.
    sys.fixedUpdate!(ctx(world));
    expect(countDebrisEntities(world)).toBe(6);
  });

  it("chunks spawn at the destroyed cell's (gx, gz) at roughly cell-top Y", () => {
    const world = new World();
    emitSoftBlockEvent(world, "evt.1", 4, 8);
    const sys = createKaboomSoftBlockDebrisSystem();
    sys.fixedUpdate!(ctx(world));
    for (const id of world.entityIds()) {
      if (!id.startsWith("kaboom.soft-debris.")) continue;
      const t = world.getComponent<{ position?: ReadonlyArray<number> }>(id, "Transform");
      const [x, y, z] = t!.position!;
      expect(x).toBe(4);
      expect(z).toBe(8);
      // Flat arena (no heightmap) → cellH=0 → cell-top Y = 0.5
      expect(y).toBeCloseTo(0.5, 5);
    }
  });

  it("uses the active theme's softBlockPalette.primary for chunk color", () => {
    const world = new World();
    world.addEntity("kaboom.game-state");
    world.setComponent("kaboom.game-state", "ArenaTheme", { themeKey: "lab" });
    emitSoftBlockEvent(world, "evt.1", 3, 5);
    const sys = createKaboomSoftBlockDebrisSystem();
    sys.fixedUpdate!(ctx(world));
    // Lab soft-block primary = #c4c8d0 per theme table
    for (const id of world.entityIds()) {
      if (!id.startsWith("kaboom.soft-debris.")) continue;
      const mr = world.getComponent<{ color?: string }>(id, "MeshRenderer");
      expect(mr?.color).toBe("#c4c8d0");
    }
  });
});
