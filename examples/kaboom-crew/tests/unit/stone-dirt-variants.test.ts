// S272 KABOOM-FLOOR-WANG-STONE + KABOOM-FLOOR-WANG-DIRT — coverage for
// the procedural stone + dirt variant builders. Mirrors the
// path-variants tests; adds cross-family palette differentiation
// (stone vs dirt vs path vs grass) so a future palette regression
// is caught early.

import { describe, expect, it } from "vitest";

import { buildStoneVariant } from "../../src/blocks/stone-variants";
import { buildDirtVariant } from "../../src/blocks/dirt-variants";
import { buildPathVariant } from "../../src/blocks/path-variants";
import { buildGrassVariant } from "../../src/blocks/grass-variants";

type Builder = (i: 0 | 1 | 2 | 3) => ReturnType<typeof buildGrassVariant>;

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

function describeFamily(name: string, build: Builder): void {
  describe(name, () => {
    it("produces 4 distinguishable geometries", () => {
      const sigs = [0, 1, 2, 3].map((i) => {
        const g = build(i as 0 | 1 | 2 | 3);
        return `${vertexCount(g)}:${colorSum(g)}`;
      });
      expect(new Set(sigs).size, `distinct sigs: ${sigs.join(" | ")}`).toBe(4);
    });

    it("attaches position + color attributes", () => {
      for (const i of [0, 1, 2, 3] as const) {
        const g = build(i);
        expect(g.getAttribute("position")).toBeDefined();
        expect(g.getAttribute("color")).toBeDefined();
        expect(g.getAttribute("position").count).toBeGreaterThan(0);
      }
    });

    it("uses the thin-slab 1 × 0.05 × 1 outer dimensions", () => {
      for (const i of [0, 1, 2, 3] as const) {
        const g = build(i);
        g.computeBoundingBox();
        const box = g.boundingBox!;
        expect(Math.abs(box.max.x - box.min.x) - 1).toBeLessThan(0.01);
        expect(Math.abs(box.max.y - box.min.y) - 0.05).toBeLessThan(0.01);
        expect(Math.abs(box.max.z - box.min.z) - 1).toBeLessThan(0.01);
      }
    });
  });
}

describeFamily("buildStoneVariant (S272)", (i) => buildStoneVariant(i));
describeFamily("buildDirtVariant (S272)", (i) => buildDirtVariant(i));

describe("S272 cross-family palette differentiation", () => {
  it("stone palette differs from grass + path + dirt on every variant", () => {
    for (const i of [0, 1, 2, 3] as const) {
      const stone = colorSum(buildStoneVariant(i));
      expect(stone).not.toBeCloseTo(colorSum(buildGrassVariant(i)), 2);
      expect(stone).not.toBeCloseTo(colorSum(buildPathVariant(i)), 2);
      expect(stone).not.toBeCloseTo(colorSum(buildDirtVariant(i)), 2);
    }
  });

  it("dirt palette differs from grass + path + stone on every variant", () => {
    for (const i of [0, 1, 2, 3] as const) {
      const dirt = colorSum(buildDirtVariant(i));
      expect(dirt).not.toBeCloseTo(colorSum(buildGrassVariant(i)), 2);
      expect(dirt).not.toBeCloseTo(colorSum(buildPathVariant(i)), 2);
      expect(dirt).not.toBeCloseTo(colorSum(buildStoneVariant(i)), 2);
    }
  });
});
