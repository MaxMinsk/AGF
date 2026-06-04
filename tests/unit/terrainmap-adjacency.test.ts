// S292 (GDP-2026-06-04-005) — tile-edge contract C-2: different floor-overlay
// biomes must not be cardinally adjacent. validateTerrainmapAdjacency flags it.

import { describe, expect, it } from "vitest";

import { validateTerrainmapAdjacency } from "../../engine/tools/check/project-check";

function check(terrainmap: string[][]) {
  return validateTerrainmapAdjacency({ terrainmap } as never, "scenes/x.scene.json", "/proj");
}

describe("validateTerrainmapAdjacency (S292 / C-2)", () => {
  it("accepts biomes separated by a floor cell", () => {
    expect(check([["grass", "floor", "stone"]])).toEqual([]);
  });

  it("accepts same-family adjacency (normal Wang case)", () => {
    expect(check([["grass", "grass", "grass"]])).toEqual([]);
  });

  it("accepts floor next to any biome", () => {
    expect(check([["floor", "grass"], ["dirt", "floor"]])).toEqual([]);
  });

  it("rejects two different biomes adjacent horizontally", () => {
    const d = check([["grass", "stone"]]);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ code: "AGF_TERRAINMAP_OVERLAY_ADJACENT", severity: "error" });
  });

  it("rejects two different biomes adjacent vertically", () => {
    const d = check([["grass"], ["dirt"]]);
    expect(d).toHaveLength(1);
    expect(d[0]!.code).toBe("AGF_TERRAINMAP_OVERLAY_ADJACENT");
  });

  it("reports each offending pair once (no double counting)", () => {
    // grass-stone share one vertical + one horizontal edge in this 2x2.
    const d = check([["grass", "stone"], ["grass", "stone"]]);
    // pairs: (0,0)-(1,0) g/s, (0,1)-(1,1) g/s → 2 distinct adjacencies.
    expect(d).toHaveLength(2);
  });

  it("no-op when terrainmap is absent", () => {
    expect(validateTerrainmapAdjacency({} as never, "s", "/p")).toEqual([]);
  });
})
