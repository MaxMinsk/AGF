// S188 — heightmap pillar colour pulls from the active arena theme so
// raised cells visually match the floor/block palette of the arena
// instead of a hardcoded slate gradient.

import { describe, expect, it } from "vitest";

import type { SceneInput } from "../../../../engine/core/ecs/types";
import { applyHeightmapCommands } from "../../src/bootstrap-helpers";
import { ARENA_THEMES } from "../../src/themes/theme-table";

function pillarColorAt(scene: SceneInput, gx: number, gz: number, theme?: string): string | undefined {
  const commands = applyHeightmapCommands(scene, theme);
  const pillarId = `heightmap.pillar.${gx}.${gz}`;
  for (const c of commands) {
    if (c.kind !== "entity.create") continue;
    if (c.entityId !== pillarId) continue;
    const mr = (c.components as Record<string, { color?: string } | undefined>)["MeshRenderer"];
    return mr?.color;
  }
  return undefined;
}

describe("heightmap pillar theme colour (S188)", () => {
  const scene: SceneInput = {
    id: "test",
    heightmap: [[0, 1, 2, 4]],
    entities: [
      {
        id: "grid.config",
        components: { Grid: { cellSize: 1, sizeX: 4, sizeZ: 1 } }
      }
    ]
  };

  it("default (no theme arg) lerps in the warehouse gradient", () => {
    const color = pillarColorAt(scene, 1, 0);
    expect(color).toBeDefined();
    // warehouse floorPrimary #6a6258 → hardBlock #7a7570; H=1 lerp 0.25
    // Check that channels are between low and high.
    const r = Number.parseInt(color!.slice(1, 3), 16);
    expect(r).toBeGreaterThanOrEqual(0x6a);
    expect(r).toBeLessThanOrEqual(0x7a);
  });

  it("lab theme yields significantly different pillar colours than warehouse", () => {
    const warehouseH2 = pillarColorAt(scene, 2, 0, "warehouse")!;
    const labH2 = pillarColorAt(scene, 2, 0, "lab")!;
    expect(warehouseH2).not.toBe(labH2);
    // Lab floor is near-white (#e0e2e6) so its H=2 should read much
    // brighter than warehouse's earthy H=2.
    const warehouseLum = parseLum(warehouseH2);
    const labLum = parseLum(labH2);
    expect(labLum).toBeGreaterThan(warehouseLum);
  });

  it("invalid themeKey falls back to warehouse", () => {
    const warehouseColor = pillarColorAt(scene, 1, 0, "warehouse");
    const garbageColor = pillarColorAt(scene, 1, 0, "not-a-real-theme");
    expect(garbageColor).toBe(warehouseColor);
  });

  it("each of the 5 registered themes produces a non-default-warehouse H=4 colour for H=4 cells", () => {
    const warehouseTop = pillarColorAt(scene, 3, 0, "warehouse");
    for (const key of Object.keys(ARENA_THEMES)) {
      if (key === "warehouse") continue;
      const top = pillarColorAt(scene, 3, 0, key);
      expect(top).toBeDefined();
      expect(top).not.toBe(warehouseTop);
    }
  });
});

function parseLum(hex: string): number {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
