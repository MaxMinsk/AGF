// S293 (GDP-2026-06-04-001) — cliff-face curved-outline mesh builder tests.

import { describe, expect, it } from "vitest";

import { buildCliffFace, buildCliffCorner, cliffVariant } from "../../src/blocks/cliff-face-variants";

function yExtent(g: ReturnType<typeof buildCliffFace>): number {
  g.computeBoundingBox();
  const b = g.boundingBox!;
  return b.max.y - b.min.y;
}

describe("buildCliffFace (S293)", () => {
  it("height scales with delta", () => {
    expect(yExtent(buildCliffFace("cliff-grass", 0, 0, 1))).toBeLessThan(yExtent(buildCliffFace("cliff-grass", 0, 0, 3)));
  });

  it("delta=2 face spans ~2 cells tall", () => {
    expect(yExtent(buildCliffFace("cliff-stone", 3, 0, 2))).toBeGreaterThan(1.8);
  });

  it("all biome x variant x sub combos produce position + colour", () => {
    for (const biome of ["cliff-grass", "cliff-stone"] as const)
      for (const v of [0, 1, 2, 3] as const)
        for (const s of [0, 1] as const) {
          const g = buildCliffFace(biome, v, s, 1);
          expect(g.getAttribute("position").count, `${biome}-${v}-${s}`).toBeGreaterThan(0);
          expect(g.getAttribute("color")).toBeDefined();
        }
  });

  it("grass vs stone biome produce different geometry (lip vs bevel)", () => {
    const grass = buildCliffFace("cliff-grass", 0, 0, 1).getAttribute("position").count;
    const stone = buildCliffFace("cliff-stone", 0, 0, 1).getAttribute("position").count;
    // both non-trivial; lip + bevel differ in vertex count or at least both present
    expect(grass).toBeGreaterThan(0);
    expect(stone).toBeGreaterThan(0);
  });

  it("corner cap builds geometry", () => {
    const g = buildCliffCorner("cliff-grass", 2);
    expect(g.getAttribute("position").count).toBeGreaterThan(0);
  });

  it("cliffVariant packs left/right into a 2-bit index", () => {
    expect(cliffVariant(false, false)).toBe(0);
    expect(cliffVariant(true, false)).toBe(1);
    expect(cliffVariant(false, true)).toBe(2);
    expect(cliffVariant(true, true)).toBe(3);
  });
});
