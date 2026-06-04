// GDP-2026-06-04-009 — cliffs are tall biome tiles. The biome's curved Wang
// tile is extruded up to its heightmap height and its side walls carry a
// vertical gradient (dark shadowed base → brighter weathered crown). These
// tests pin the extrusion height + the side-wall gradient direction; the
// shape/rotation Wang mapping is covered in grass-variants.test.ts.

import type { BufferGeometry } from "three";
import { describe, expect, it } from "vitest";

import { buildGrassShape } from "../../src/blocks/grass-variants";
import { buildStoneShape } from "../../src/blocks/stone-variants";

function yRange(g: BufferGeometry): { min: number; max: number } {
  const pos = g.getAttribute("position");
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < min) min = y;
    if (y > max) max = y;
  }
  return { min, max };
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Average colour luminance of side-wall verts (|normal.y| ≈ 0) at a given Y. */
function sideLumAtY(g: BufferGeometry, targetY: number): number {
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const col = g.getAttribute("color");
  let sum = 0, count = 0;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(nor.getY(i)) > 0.1) continue; // top faces point +Y → skip
    if (Math.abs(pos.getY(i) - targetY) > 1e-3) continue;
    sum += luminance(col.getX(i), col.getY(i), col.getZ(i));
    count += 1;
  }
  return count === 0 ? NaN : sum / count;
}

describe("tall biome cliff tiles (GDP-2026-06-04-009)", () => {
  it("flat tile (heightCells=0) tops out near the thin-slab height (~0.20)", () => {
    const { max } = yRange(buildGrassShape("A", 0, 0));
    expect(max).toBeGreaterThan(0.18);
    expect(max).toBeLessThan(0.30);
  });

  it("tall tile (heightCells=2) spans floor (y=0) to plateau (y≈2)", () => {
    const { min, max } = yRange(buildGrassShape("A", 0, 2));
    expect(min).toBeCloseTo(0, 5);
    expect(max).toBeGreaterThan(1.9);
    expect(max).toBeLessThan(2.2);
  });

  it("extrusion height scales linearly with heightCells", () => {
    const h1 = yRange(buildStoneShape("A", 0, 1)).max;
    const h3 = yRange(buildStoneShape("A", 0, 3)).max;
    expect(h3 / h1).toBeGreaterThan(2.5); // ~3× (small interior dy aside)
  });

  it("side wall gradient: crown (top) is brighter than the base", () => {
    const g = buildGrassShape("A", 0, 2);
    const lumTop = sideLumAtY(g, 2);   // crown at y = heightCells
    const lumBase = sideLumAtY(g, 0);  // shadowed contact base
    expect(lumTop).not.toBeNaN();
    expect(lumBase).not.toBeNaN();
    expect(lumTop).toBeGreaterThan(lumBase);
  });

  it("a tall corner tile (shape C) keeps a rounded convex corner (overhang > cell)", () => {
    const g = buildGrassShape("C", 0, 2);
    g.computeBoundingBox();
    const b = g.boundingBox!;
    // grass corner push lifts the open corner past the 0.5 cell half-extent.
    const maxAbs = Math.max(
      Math.abs(b.max.x), Math.abs(b.min.x), Math.abs(b.max.z), Math.abs(b.min.z)
    );
    expect(maxAbs).toBeGreaterThan(0.5);
  });
});
