// S196 — bomb-fuse-color-system lerps the bomb's MeshRenderer.color
// from its authored dark hex toward bright orange in the final 0.6s
// of the fuse. Carried + airborne bombs (S144) are skipped.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import {
  createKaboomBombFuseColorSystem,
  lerpHex
} from "../../src/systems/bomb-fuse-color-system";

function ctx(world: World, dt = 1 / 60) {
  return {
    world,
    time: { elapsed: 0, dt, fixedDt: dt, frameCount: 0, fixedStepCount: 0 }
  };
}

function spawnBomb(world: World, id: string, fuseRemaining: number, color = "#1a1a1a"): void {
  world.addEntity(id);
  world.setComponent(id, "Bomb", { fuseRemaining, range: 2, ownerId: "p" });
  world.setComponent(id, "MeshRenderer", { mesh: "sphere", color });
}

function colorOf(world: World, id: string): string {
  return world.getComponent<{ color?: string }>(id, "MeshRenderer")?.color ?? "";
}

describe("kaboom bomb-fuse-color (S196)", () => {
  describe("lerpHex pure helper", () => {
    it("t=0 returns the low colour", () => {
      expect(lerpHex("#000000", "#ffffff", 0)).toBe("#000000");
    });

    it("t=1 returns the high colour", () => {
      expect(lerpHex("#000000", "#ffffff", 1)).toBe("#ffffff");
    });

    it("t=0.5 returns a midpoint", () => {
      expect(lerpHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    });

    it("mixes channels independently", () => {
      // black → red, t=0.5 → mid-red
      expect(lerpHex("#000000", "#ff0000", 0.5)).toBe("#800000");
    });
  });

  describe("integrated system", () => {
    it("bomb with fuseRemaining > 0.6 stays at authored dark colour", () => {
      const world = new World();
      spawnBomb(world, "bomb", 1.5);
      const sys = createKaboomBombFuseColorSystem();
      sys.fixedUpdate!(ctx(world));
      expect(colorOf(world, "bomb")).toBe("#1a1a1a");
    });

    it("bomb at fuseRemaining = 0 reaches the hot colour", () => {
      const world = new World();
      spawnBomb(world, "bomb", 0);
      const sys = createKaboomBombFuseColorSystem();
      sys.fixedUpdate!(ctx(world));
      expect(colorOf(world, "bomb")).toBe("#ff5500");
    });

    it("bomb at fuseRemaining = 0.3 hits the midpoint between authored + hot", () => {
      const world = new World();
      spawnBomb(world, "bomb", 0.3);
      const sys = createKaboomBombFuseColorSystem();
      sys.fixedUpdate!(ctx(world));
      // t = 1 - 0.3/0.6 = 0.5 → halfway between #1a1a1a and #ff5500.
      expect(colorOf(world, "bomb")).toBe(lerpHex("#1a1a1a", "#ff5500", 0.5));
    });

    it("carried bomb (carriedBy set) is skipped — colour stays at authored", () => {
      const world = new World();
      world.addEntity("bomb");
      world.setComponent("bomb", "Bomb", {
        fuseRemaining: 0.1,
        range: 2,
        ownerId: "p",
        carriedBy: "player.1"
      });
      world.setComponent("bomb", "MeshRenderer", { mesh: "sphere", color: "#1a1a1a" });
      const sys = createKaboomBombFuseColorSystem();
      sys.fixedUpdate!(ctx(world));
      expect(colorOf(world, "bomb")).toBe("#1a1a1a");
    });

    it("airborne bomb is skipped", () => {
      const world = new World();
      world.addEntity("bomb");
      world.setComponent("bomb", "Bomb", {
        fuseRemaining: 0.1,
        range: 2,
        ownerId: "p",
        airborne: true
      });
      world.setComponent("bomb", "MeshRenderer", { mesh: "sphere", color: "#1a1a1a" });
      const sys = createKaboomBombFuseColorSystem();
      sys.fixedUpdate!(ctx(world));
      expect(colorOf(world, "bomb")).toBe("#1a1a1a");
    });

    it("fresh-placed bomb (fuse 2.5) stays dark on every tick — regression for BUG-POOL-REUSED-BOMBS-FLASH-001", () => {
      // Before the fix, bomb-fuse-system overwrote MeshRenderer.color with a
      // Date.now()-based orange pulse on the very first tick BEFORE this
      // system ran, causing the authored-colour capture to latch onto orange.
      // The fix removed that overwrite; this test verifies the dark colour
      // holds for several consecutive ticks (not just on construction).
      const world = new World();
      spawnBomb(world, "bomb", 2.5);
      const sys = createKaboomBombFuseColorSystem();
      sys.fixedUpdate!(ctx(world));
      expect(colorOf(world, "bomb")).toBe("#1a1a1a");
      // Second tick — authored colour must still hold.
      world.setComponent("bomb", "Bomb", { fuseRemaining: 2.48, range: 2, ownerId: "p" });
      sys.fixedUpdate!(ctx(world));
      expect(colorOf(world, "bomb")).toBe("#1a1a1a");
    });

    it("multiple bombs lerp independently from their own captured authored colour", () => {
      const world = new World();
      spawnBomb(world, "bomb.a", 0, "#1a1a1a");
      spawnBomb(world, "bomb.b", 0, "#22aacc"); // different authored hex
      const sys = createKaboomBombFuseColorSystem();
      sys.fixedUpdate!(ctx(world));
      expect(colorOf(world, "bomb.a")).toBe("#ff5500");
      expect(colorOf(world, "bomb.b")).toBe("#ff5500");
      // Reset fuse → both should snap back to their own authored colour.
      world.setComponent("bomb.a", "Bomb", { fuseRemaining: 2, range: 2, ownerId: "p" });
      world.setComponent("bomb.b", "Bomb", { fuseRemaining: 2, range: 2, ownerId: "p" });
      sys.fixedUpdate!(ctx(world));
      expect(colorOf(world, "bomb.a")).toBe("#1a1a1a");
      expect(colorOf(world, "bomb.b")).toBe("#22aacc");
    });
  });
});
