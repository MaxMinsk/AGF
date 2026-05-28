// S176 KABOOM-FLOOR-WANG-TILES MVP (GDP-2026-05-28-012) — regression
// tests for applyTerrainmapCommands. The helper reads a scene's
// optional top-level `terrainmap` field and emits per-cell entity.create
// commands for cells whose family is NOT the default ('floor'). Default-
// floor cells get NO entity so a flat arena pays zero overhead.

import { describe, expect, it } from "vitest";

import type { SceneInput } from "../../../../engine/core/ecs/types";
import { applyTerrainmapCommands } from "../../src/bootstrap-helpers";

function makeBaseScene(): SceneInput {
  return {
    id: "test",
    entities: [
      {
        id: "grid.config",
        components: {
          Grid: { cellSize: 1, sizeX: 3, sizeZ: 3, originX: 0, originZ: 0 }
        }
      }
    ]
  };
}

describe("applyTerrainmapCommands (S176 GDP-012)", () => {
  it("returns an empty list when no terrainmap is authored", () => {
    const scene = makeBaseScene();
    expect(applyTerrainmapCommands(scene)).toEqual([]);
  });

  it("returns an empty list when the terrainmap is an empty array", () => {
    const scene: SceneInput = { ...makeBaseScene(), terrainmap: [] };
    expect(applyTerrainmapCommands(scene)).toEqual([]);
  });

  it("emits NO entity for cells whose family is 'floor' (the default)", () => {
    const scene: SceneInput = {
      ...makeBaseScene(),
      terrainmap: [
        ["floor", "floor", "floor"],
        ["floor", "floor", "floor"]
      ]
    };
    expect(applyTerrainmapCommands(scene)).toEqual([]);
  });

  it("emits one entity.create per non-default cell with the expected components", () => {
    const scene: SceneInput = {
      ...makeBaseScene(),
      terrainmap: [
        ["floor", "floor", "floor"],
        ["floor", "grass", "floor"],
        ["floor", "floor", "floor"]
      ]
    };
    const commands = applyTerrainmapCommands(scene);
    expect(commands).toHaveLength(1);
    const cmd = commands[0] as {
      kind: string;
      entityId: string;
      components: Record<string, unknown>;
    };
    expect(cmd.kind).toBe("entity.create");
    expect(cmd.entityId).toBe("terrain.1.1");
    expect(cmd.components).toMatchObject({
      GridPosition: { gx: 1, gz: 1 },
      GridOccupant: { layer: "floor-overlay", blocksMovement: false, blocksBlast: false },
      Transform: { position: [1, 0.02, 1], rotation: [0, 0, 0], scale: [1, 1, 1] },
      FloorTerrain: { family: "grass" },
      WangTile: { familyName: "kaboom-grass" },
      WangTileFamilyMember: { familyName: "kaboom-grass" }
    });
    // The MeshRenderer carries the placeholder mesh + color; the mesh-
    // sync bridge rewrites the mesh ref once the Wang resolver runs.
    expect(cmd.components["MeshRenderer"]).toMatchObject({ mesh: "box", color: "#ffffff" });
  });

  it("emits entities only for grass cells in a mixed map (default cells skipped)", () => {
    const scene: SceneInput = {
      ...makeBaseScene(),
      terrainmap: [
        ["floor", "grass", "floor"],
        ["grass", "grass", "floor"],
        ["floor", "floor", "floor"]
      ]
    };
    const commands = applyTerrainmapCommands(scene);
    expect(commands).toHaveLength(3);
    const ids = commands.map((c) => (c as { entityId: string }).entityId).sort();
    expect(ids).toEqual(["terrain.0.1", "terrain.1.0", "terrain.1.1"]);
  });

  it("rows of unequal length only emit entities for explicitly authored cells", () => {
    const scene: SceneInput = {
      ...makeBaseScene(),
      terrainmap: [
        ["floor", "grass"],
        ["floor"]
      ]
    };
    const commands = applyTerrainmapCommands(scene);
    expect(commands).toHaveLength(1);
    expect((commands[0] as { entityId: string }).entityId).toBe("terrain.1.0");
  });
});
