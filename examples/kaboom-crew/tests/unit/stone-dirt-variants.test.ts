// GDP-2026-06-04-004 — stone + dirt biome curved-outline mesh tests.

import { describe, expect, it } from "vitest";

import { buildStoneShape } from "../../src/blocks/stone-variants";
import { buildDirtShape } from "../../src/blocks/dirt-variants";

function span(g: { computeBoundingBox: () => void; boundingBox: unknown }): { x: number; z: number } {
  g.computeBoundingBox();
  const b = (g as { boundingBox: { max: { x: number; z: number }; min: { x: number; z: number } } }).boundingBox;
  return { x: b.max.x - b.min.x, z: b.max.z - b.min.z };
}

function topYValues(g: { getAttribute: (n: string) => { count: number; getY: (i: number) => number } }): Set<number> {
  const pos = g.getAttribute("position");
  const ys = new Set<number>();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > 0.01) ys.add(Math.round(y * 1000));
  }
  return ys;
}

describe("buildStoneShape (GDP-2026-06-04-004)", () => {
  it("Shape F is ~1x1; Shape A has overhang", () => {
    expect(Math.abs(span(buildStoneShape("F", 0)).x - 1.0)).toBeLessThan(0.02);
    expect(span(buildStoneShape("A", 0)).x).toBeGreaterThan(1.0);
  });
  it("filler has faceting — multiple distinct top Y levels", () => {
    expect(topYValues(buildStoneShape("F", 0)).size).toBeGreaterThanOrEqual(2);
  });
  it("all 18 combos valid", () => {
    for (const shape of ["A", "B", "C", "D", "E", "F"] as const)
      for (const sub of [0, 1, 2] as const)
        expect(buildStoneShape(shape, sub).getAttribute("position").count).toBeGreaterThan(0);
  });
});

describe("buildDirtShape (GDP-2026-06-04-004)", () => {
  it("Shape F is ~1x1; Shape A has overhang", () => {
    expect(Math.abs(span(buildDirtShape("F", 0)).x - 1.0)).toBeLessThan(0.02);
    expect(span(buildDirtShape("A", 0)).x).toBeGreaterThan(1.0);
  });
  it("filler has rough noisy top — many distinct Y values", () => {
    expect(topYValues(buildDirtShape("F", 0)).size).toBeGreaterThanOrEqual(5);
  });
  it("all 18 combos valid", () => {
    for (const shape of ["A", "B", "C", "D", "E", "F"] as const)
      for (const sub of [0, 1, 2] as const)
        expect(buildDirtShape(shape, sub).getAttribute("position").count).toBeGreaterThan(0);
  });
});
