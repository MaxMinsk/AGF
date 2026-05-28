// S176 KABOOM-FLOOR-WANG-TILES MVP (GDP-2026-05-28-012) — coverage for
// the procedural grass variant builders.

import { describe, expect, it } from "vitest";

import { buildGrassVariant } from "../../src/blocks/grass-variants";

function colorSum(g: ReturnType<typeof buildGrassVariant>): number {
  const color = g.getAttribute("color");
  if (color === undefined) return 0;
  let sum = 0;
  for (let i = 0; i < color.count; i += 1) {
    sum += color.getX(i) + color.getY(i) + color.getZ(i);
  }
  return Math.round(sum * 1000) / 1000;
}

function vertexCount(g: ReturnType<typeof buildGrassVariant>): number {
  return g.getAttribute("position").count;
}

describe("buildGrassVariant (S176 GDP-012)", () => {
  it("produces 4 distinguishable geometries (count or colour-sum differs across variants)", () => {
    const geoms = [0, 1, 2, 3].map((i) => buildGrassVariant(i as 0 | 1 | 2 | 3));
    // Build a signature that mixes vertex count + colour sum. Variant 0
    // uses 1×1×1 subdivisions (fewer verts); variants 1..3 share 4×1×4
    // subdivisions but paint different vertex patterns → colour-sum
    // differs.
    const sigs = geoms.map((g) => `${vertexCount(g)}:${colorSum(g)}`);
    const distinct = new Set(sigs);
    expect(distinct.size, `distinct sigs: ${sigs.join(" | ")}`).toBe(4);
  });

  it("attaches a position + color attribute to every variant", () => {
    for (const i of [0, 1, 2, 3] as const) {
      const g = buildGrassVariant(i);
      expect(g.getAttribute("position")).toBeDefined();
      expect(g.getAttribute("color")).toBeDefined();
      expect(g.getAttribute("position").count).toBeGreaterThan(0);
    }
  });

  it("uses thin slab outer dimensions (1 × 0.05 × 1)", () => {
    for (const i of [0, 1, 2, 3] as const) {
      const g = buildGrassVariant(i);
      g.computeBoundingBox();
      const box = g.boundingBox!;
      expect(Math.abs(box.max.x - box.min.x) - 1).toBeLessThan(0.01);
      expect(Math.abs(box.max.y - box.min.y) - 0.05).toBeLessThan(0.01);
      expect(Math.abs(box.max.z - box.min.z) - 1).toBeLessThan(0.01);
    }
  });

  it("ignores the optional bitmask argument (reserved for future sub-variants)", () => {
    // Variant index drives the geometry; the bitmask param is reserved
    // and currently ignored. Same index + bitmask varying should hit
    // the same vertex count.
    const a = buildGrassVariant(2);
    const b = buildGrassVariant(2, 7);
    expect(vertexCount(a)).toBe(vertexCount(b));
  });
});
