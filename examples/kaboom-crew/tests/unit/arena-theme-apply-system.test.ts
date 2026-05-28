// S171 KABOOM-ARENA-THEMES MVP (GDP-2026-05-28-013) — apply-system coverage.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import {
  applyArenaThemeToWorld,
  createArenaThemeApplySystem,
  readActiveThemeKey,
  resolveArenaTheme
} from "../../src/systems/arena-theme-apply-system";
import { ARENA_THEMES } from "../../src/themes/theme-table";

type MeshRendererLike = { mesh?: string; color?: string };

function ctx(world: World) {
  return {
    world,
    time: { elapsed: 0, dt: 1 / 60, fixedDt: 1 / 60, frameCount: 0, fixedStepCount: 0 }
  };
}

function seedFloor(world: World, color = "#1d2536"): void {
  world.addEntity("floor");
  world.setComponent("floor", "Transform", { position: [7, -0.05, 5], rotation: [0, 0, 0], scale: [15, 0.1, 11] });
  world.setComponent("floor", "MeshRenderer", { mesh: "box", color });
}

function seedGameState(world: World, themeKey?: string): void {
  world.addEntity("kaboom.game-state");
  if (themeKey !== undefined) {
    world.setComponent("kaboom.game-state", "ArenaTheme", { themeKey });
  }
}

describe("resolveArenaTheme (S171 GDP-013)", () => {
  it("returns the matching theme for a known key", () => {
    expect(resolveArenaTheme("lab")).toBe(ARENA_THEMES.lab);
    expect(resolveArenaTheme("bunker")).toBe(ARENA_THEMES.bunker);
  });

  it("falls back to warehouse for unknown keys", () => {
    expect(resolveArenaTheme("nope")).toBe(ARENA_THEMES.warehouse);
    expect(resolveArenaTheme(undefined)).toBe(ARENA_THEMES.warehouse);
    expect(resolveArenaTheme(null)).toBe(ARENA_THEMES.warehouse);
    expect(resolveArenaTheme(42)).toBe(ARENA_THEMES.warehouse);
  });
});

describe("readActiveThemeKey (S171 GDP-013)", () => {
  it("returns the seeded themeKey from kaboom.game-state", () => {
    const world = new World();
    seedGameState(world, "factory");
    expect(readActiveThemeKey(world)).toBe("factory");
  });

  it("falls back to warehouse when kaboom.game-state is missing", () => {
    const world = new World();
    expect(readActiveThemeKey(world)).toBe("warehouse");
  });

  it("falls back to warehouse when ArenaTheme component is missing", () => {
    const world = new World();
    seedGameState(world);
    expect(readActiveThemeKey(world)).toBe("warehouse");
  });

  it("falls back to warehouse when themeKey is unknown", () => {
    const world = new World();
    seedGameState(world, "bogus");
    expect(readActiveThemeKey(world)).toBe("warehouse");
  });
});

describe("applyArenaThemeToWorld (S171 GDP-013)", () => {
  it("writes the theme floorPrimaryHex onto the floor MeshRenderer.color", () => {
    const world = new World();
    seedFloor(world);
    applyArenaThemeToWorld(world, ARENA_THEMES.lab);
    const mr = world.getComponent<MeshRendererLike>("floor", "MeshRenderer");
    expect(mr?.color).toBe(ARENA_THEMES.lab.floorPrimaryHex);
  });

  it("preserves other MeshRenderer fields (e.g. mesh)", () => {
    const world = new World();
    seedFloor(world);
    applyArenaThemeToWorld(world, ARENA_THEMES.factory);
    const mr = world.getComponent<MeshRendererLike>("floor", "MeshRenderer");
    expect(mr?.mesh).toBe("box");
    expect(mr?.color).toBe(ARENA_THEMES.factory.floorPrimaryHex);
  });

  it("is a no-op when the floor entity is missing", () => {
    const world = new World();
    expect(() => applyArenaThemeToWorld(world, ARENA_THEMES.warehouse)).not.toThrow();
    expect(world.hasEntity("floor")).toBe(false);
  });

  it("creates a MeshRenderer.color when none was authored", () => {
    const world = new World();
    world.addEntity("floor");
    // No MeshRenderer component yet — the system should still tint.
    applyArenaThemeToWorld(world, ARENA_THEMES.dock);
    const mr = world.getComponent<MeshRendererLike>("floor", "MeshRenderer");
    expect(mr?.color).toBe(ARENA_THEMES.dock.floorPrimaryHex);
  });
});

describe("createArenaThemeApplySystem (S171 GDP-013)", () => {
  it("applies the registered theme to the floor entity on first tick", () => {
    const world = new World();
    seedFloor(world);
    seedGameState(world, "factory");
    const sys = createArenaThemeApplySystem();
    sys.fixedUpdate!(ctx(world));
    const mr = world.getComponent<MeshRendererLike>("floor", "MeshRenderer");
    expect(mr?.color).toBe(ARENA_THEMES.factory.floorPrimaryHex);
  });

  it("falls back to warehouse when ArenaTheme is absent", () => {
    const world = new World();
    seedFloor(world);
    seedGameState(world); // no ArenaTheme
    const sys = createArenaThemeApplySystem();
    sys.fixedUpdate!(ctx(world));
    const mr = world.getComponent<MeshRendererLike>("floor", "MeshRenderer");
    expect(mr?.color).toBe(ARENA_THEMES.warehouse.floorPrimaryHex);
  });

  it("falls back to warehouse for an unknown themeKey (defensive)", () => {
    const world = new World();
    seedFloor(world);
    seedGameState(world, "alien-cheese");
    const sys = createArenaThemeApplySystem();
    sys.fixedUpdate!(ctx(world));
    const mr = world.getComponent<MeshRendererLike>("floor", "MeshRenderer");
    expect(mr?.color).toBe(ARENA_THEMES.warehouse.floorPrimaryHex);
  });

  it("is idempotent — running the system twice on the same world leaves the same colour", () => {
    const world = new World();
    seedFloor(world);
    seedGameState(world, "lab");
    const sys = createArenaThemeApplySystem();
    sys.fixedUpdate!(ctx(world));
    const after1 = world.getComponent<MeshRendererLike>("floor", "MeshRenderer")?.color;
    // Mutate the floor colour AFTER the first apply — if the system
    // weren't idempotent (or were keyed off the world mutation counter
    // rather than a "applied" flag) it would overwrite again.
    world.setComponent("floor", "MeshRenderer", { mesh: "box", color: "#abcdef" });
    sys.fixedUpdate!(ctx(world));
    const after2 = world.getComponent<MeshRendererLike>("floor", "MeshRenderer")?.color;
    expect(after1).toBe(ARENA_THEMES.lab.floorPrimaryHex);
    // Second pass should NOT have re-applied the theme — `appliedThisWorld` latched.
    expect(after2).toBe("#abcdef");
  });

  it("re-applies on a fresh world (scene.load swap)", () => {
    const sys = createArenaThemeApplySystem();
    const worldA = new World();
    seedFloor(worldA);
    seedGameState(worldA, "lab");
    sys.fixedUpdate!(ctx(worldA));
    expect(
      worldA.getComponent<MeshRendererLike>("floor", "MeshRenderer")?.color
    ).toBe(ARENA_THEMES.lab.floorPrimaryHex);

    // Simulate scene.load: a brand-new World instance, different theme.
    const worldB = new World();
    seedFloor(worldB);
    seedGameState(worldB, "bunker");
    sys.fixedUpdate!(ctx(worldB));
    expect(
      worldB.getComponent<MeshRendererLike>("floor", "MeshRenderer")?.color
    ).toBe(ARENA_THEMES.bunker.floorPrimaryHex);
  });

  it("does not throw when the world has no floor entity", () => {
    const world = new World();
    seedGameState(world, "factory");
    const sys = createArenaThemeApplySystem();
    expect(() => sys.fixedUpdate!(ctx(world))).not.toThrow();
  });
});
