// S271 KABOOM-FLOOR-WANG-PATH — coverage for the procedural path
// variant builders. Mirrors grass-variants.test.ts.

import { describe, expect, it } from "vitest";

import { buildPathVariant } from "../../src/blocks/path-variants";
import { buildGrassVariant } from "../../src/blocks/grass-variants";

function colorSum(g: ReturnType<typeof buildPathVariant>): number {
  const color = g.getAttribute("color");
  if (color === undefined) return 0;
  let sum = 0;
  for (let i = 0; i < color.count; i += 1) {
    sum += color.getX(i) + color.getY(i) + color.getZ(i);
  }
  return Math.round(sum * 1000) / 1000;
}

function vertexCount(g: ReturnType<typeof buildPathVariant>): number {
  return g.getAttribute("position").count;
}

describe("buildPathVariant (S271)", () => {
  it("produces 4 distinguishable geometries", () => {
    const geoms = [0, 1, 2, 3].map((i) => buildPathVariant(i as 0 | 1 | 2 | 3));
    const sigs = geoms.map((g) => `${vertexCount(g)}:${colorSum(g)}`);
    expect(new Set(sigs).size, `distinct sigs: ${sigs.join(" | ")}`).toBe(4);
  });

  it("attaches position + color attributes to every variant", () => {
    for (const i of [0, 1, 2, 3] as const) {
      const g = buildPathVariant(i);
      expect(g.getAttribute("position")).toBeDefined();
      expect(g.getAttribute("color")).toBeDefined();
      expect(g.getAttribute("position").count).toBeGreaterThan(0);
    }
  });

  it("uses the thin-slab 1 × 0.05 × 1 outer dimensions", () => {
    for (const i of [0, 1, 2, 3] as const) {
      const g = buildPathVariant(i);
      g.computeBoundingBox();
      const box = g.boundingBox!;
      expect(Math.abs(box.max.x - box.min.x) - 1).toBeLessThan(0.01);
      expect(Math.abs(box.max.y - box.min.y) - 0.05).toBeLessThan(0.01);
      expect(Math.abs(box.max.z - box.min.z) - 1).toBeLessThan(0.01);
    }
  });

  it("ignores the bitmask parameter (reserved for future sub-variants)", () => {
    const a = buildPathVariant(0, 0);
    const b = buildPathVariant(0, 15);
    expect(vertexCount(a)).toBe(vertexCount(b));
    expect(colorSum(a)).toBeCloseTo(colorSum(b), 3);
  });

  it("path colour palette differs from grass on every variant", () => {
    for (const i of [0, 1, 2, 3] as const) {
      const path = colorSum(buildPathVariant(i));
      const grass = colorSum(buildGrassVariant(i));
      expect(path, `variant ${i}: path colour-sum must differ from grass`).not.toBeCloseTo(grass, 2);
    }
  });
});
