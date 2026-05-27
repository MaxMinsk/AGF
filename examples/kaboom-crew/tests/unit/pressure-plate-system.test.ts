// S151 KABOOM-PRESSURE-PLATE — unit tests for the new arena hazard.

import { describe, expect, it } from "vitest";

import { World } from "../../../../engine/core/ecs/world";
import { createGridOccupancySystem } from "../../../../engine/core/systems/grid-occupancy-system";
import { createKaboomPressurePlateSystem } from "../../src/systems/pressure-plate-system";

const FIXED_DT = 1 / 60;

function ctx(world: World, fixedDt = FIXED_DT) {
  return { world, time: { elapsed: 0, dt: fixedDt, fixedDt, frameCount: 0, fixedStepCount: 0 } };
}

function addPlate(
  world: World,
  id: string,
  gx: number,
  gz: number,
  plateId: number,
  spawnGx: number,
  spawnGz: number,
  cooldownMs = 1000
): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "Transform", { position: [gx, 0.06, gz], rotation: [0, 0, 0], scale: [0.9, 0.05, 0.9] });
  world.setComponent(id, "PressurePlate", {
    plateId,
    triggerAction: "spawn-bomb",
    cooldownMs,
    actionPayload: { spawnGx, spawnGz, range: 2, fuseS: 1.5 }
  });
}

function addBomber(world: World, id: string, gx: number, gz: number, alive = true): void {
  world.addEntity(id);
  world.setComponent(id, "GridPosition", { gx, gz });
  world.setComponent(id, "Transform", { position: [gx, 0.4, gz], rotation: [0, 0, 0], scale: [0.4, 0.4, 0.4] });
  world.setComponent(id, "GridOccupant", { layer: id, blocksMovement: false, blocksBlast: false });
  world.setComponent(id, "BomberStats", { maxBombs: 1, range: 2, alive });
}

function tick(world: World, occ: ReturnType<typeof createGridOccupancySystem>, sys: ReturnType<typeof createKaboomPressurePlateSystem>, n = 1): void {
  for (let i = 0; i < n; i += 1) {
    occ.frameUpdate!(ctx(world));
    sys.fixedUpdate!(ctx(world));
  }
}

describe("createKaboomPressurePlateSystem (S151)", () => {
  it("bomber on a spawn-bomb plate spawns a bomb at the configured cell next tick", () => {
    const world = new World();
    addPlate(world, "plate.0", 3, 5, 0, 7, 5);
    addBomber(world, "player.1", 3, 5);
    const occ = createGridOccupancySystem();
    const sys = createKaboomPressurePlateSystem({ occupancy: occ });
    tick(world, occ, sys);
    const bombIds = Array.from((world as unknown as { entityIds(): Iterable<string> }).entityIds?.() ?? []);
    const plateBomb = bombIds.find((id) => id.startsWith("plate-bomb."));
    expect(plateBomb).toBeDefined();
    const bombPos = world.getComponent<{ gx: number; gz: number }>(plateBomb!, "GridPosition")!;
    expect(bombPos.gx).toBe(7);
    expect(bombPos.gz).toBe(5);
  });

  it("spawned bomb has fuse + range from the actionPayload", () => {
    const world = new World();
    addPlate(world, "plate.0", 3, 5, 0, 7, 5);
    addBomber(world, "player.1", 3, 5);
    const occ = createGridOccupancySystem();
    const sys = createKaboomPressurePlateSystem({ occupancy: occ });
    tick(world, occ, sys);
    const bombIds = Array.from((world as unknown as { entityIds(): Iterable<string> }).entityIds?.() ?? []);
    const plateBomb = bombIds.find((id) => id.startsWith("plate-bomb."))!;
    const bomb = world.getComponent<{ fuseRemaining: number; range: number; ownerId: string }>(plateBomb, "Bomb")!;
    expect(bomb.fuseRemaining).toBe(1.5);
    expect(bomb.range).toBe(2);
    expect(bomb.ownerId).toBe("plate.0");
  });

  it("dead bomber on plate does NOT trigger", () => {
    const world = new World();
    addPlate(world, "plate.0", 3, 5, 0, 7, 5);
    addBomber(world, "player.1", 3, 5, false);
    const occ = createGridOccupancySystem();
    const sys = createKaboomPressurePlateSystem({ occupancy: occ });
    tick(world, occ, sys);
    const bombIds = Array.from((world as unknown as { entityIds(): Iterable<string> }).entityIds?.() ?? []);
    expect(bombIds.find((id) => id.startsWith("plate-bomb."))).toBeUndefined();
  });

  it("empty plate cell does NOT trigger", () => {
    const world = new World();
    addPlate(world, "plate.0", 3, 5, 0, 7, 5);
    addBomber(world, "player.1", 0, 0);
    const occ = createGridOccupancySystem();
    const sys = createKaboomPressurePlateSystem({ occupancy: occ });
    tick(world, occ, sys, 5);
    const bombIds = Array.from((world as unknown as { entityIds(): Iterable<string> }).entityIds?.() ?? []);
    expect(bombIds.find((id) => id.startsWith("plate-bomb."))).toBeUndefined();
  });

  it("cooldown: bomber stays on plate; trigger fires once then waits cooldownMs before firing again", () => {
    const world = new World();
    addPlate(world, "plate.0", 3, 5, 0, 7, 5, 600);
    addBomber(world, "player.1", 3, 5);
    const occ = createGridOccupancySystem();
    const sys = createKaboomPressurePlateSystem({ occupancy: occ });
    // First tick triggers.
    tick(world, occ, sys);
    const afterFirst = Array.from((world as unknown as { entityIds(): Iterable<string> }).entityIds?.() ?? [])
      .filter((id) => id.startsWith("plate-bomb."));
    expect(afterFirst.length).toBe(1);
    // 10 more ticks at 1/60 s ≈ 167 ms — still inside the 600 ms cooldown.
    tick(world, occ, sys, 10);
    const afterCooldownInside = Array.from((world as unknown as { entityIds(): Iterable<string> }).entityIds?.() ?? [])
      .filter((id) => id.startsWith("plate-bomb."));
    expect(afterCooldownInside.length).toBe(1);
    // 35 more ticks ≈ 583 ms more (total ~750 ms since first trigger) — past cooldown.
    tick(world, occ, sys, 35);
    const afterCooldownPast = Array.from((world as unknown as { entityIds(): Iterable<string> }).entityIds?.() ?? [])
      .filter((id) => id.startsWith("plate-bomb."));
    expect(afterCooldownPast.length).toBe(2);
  });

  it("two plates with different plateIds fire independently in the same tick", () => {
    const world = new World();
    addPlate(world, "plate.0", 3, 5, 0, 7, 5);
    addPlate(world, "plate.1", 11, 5, 1, 7, 5);
    addBomber(world, "player.1", 3, 5);
    addBomber(world, "player.2", 11, 5);
    const occ = createGridOccupancySystem();
    const sys = createKaboomPressurePlateSystem({ occupancy: occ });
    tick(world, occ, sys);
    const bombIds = Array.from((world as unknown as { entityIds(): Iterable<string> }).entityIds?.() ?? [])
      .filter((id) => id.startsWith("plate-bomb."));
    // 2 plates triggered; but both spawn at the SAME cell — the second
    // spawnBomb call sees the first bomb already there and bails on the
    // `world.hasEntity` check ONLY if the id collides. Different plates
    // give different ids, so we expect 2 bombs at the same cell.
    expect(bombIds.length).toBe(2);
  });

  it("plate-puzzle.scene.json has 4 plates all spawning at the centre", async () => {
    const sceneModule = await import("../../scenes/plate-puzzle.scene.json");
    const scene = (sceneModule as unknown as { default: { entities: Array<{ id: string; components: Record<string, unknown> }> } }).default;
    const plates = scene.entities.filter((e) => e.components["PressurePlate"] !== undefined);
    expect(plates.length).toBe(4);
    const plateIds = new Set<number>();
    for (const p of plates) {
      const c = p.components["PressurePlate"] as { plateId: number; triggerAction: string; actionPayload?: { spawnGx?: number; spawnGz?: number } };
      plateIds.add(c.plateId);
      expect(c.triggerAction).toBe("spawn-bomb");
      expect(c.actionPayload?.spawnGx).toBe(7);
      expect(c.actionPayload?.spawnGz).toBe(5);
    }
    expect(plateIds.size).toBe(4); // unique ids
  });
});
