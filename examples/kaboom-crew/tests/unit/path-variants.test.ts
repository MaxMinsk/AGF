// GDP-2026-06-04-004 — path biome curved-outline mesh tests.

import { describe, expect, it } from "vitest";

import { buildPathShape } from "../../src/blocks/path-variants";
import { buildGrassShape } from "../../src/blocks/grass-variants";

function span(g: ReturnType<typeof buildPathShape>): { x: number; z: number } {
  g.computeBoundingBox();
  const b = g.boundingBox!;
  return { x: b.max.x - b.min.x, z: b.max.z - b.min.z };
}

describe("buildPathShape (GDP-2026-06-04-004)", () => {
  it("Shape A (isolated) has overhang — XZ span > 1.0", () => {
    expect(span(buildPathShape("A", 0)).x).toBeGreaterThan(1.0);
  });

  it("Shape F (filler) is a ~1x1 square", () => {
    const s = span(buildPathShape("F", 0));
    expect(Math.abs(s.x - 1.0)).toBeLessThan(0.02);
    expect(Math.abs(s.z - 1.0)).toBeLessThan(0.02);
  });

  it("all 18 shape x sub combos have position + color attributes", () => {
    for (const shape of ["A", "B", "C", "D", "E", "F"] as const) {
      for (const sub of [0, 1, 2] as const) {
        const g = buildPathShape(shape, sub);
        expect(g.getAttribute("position").count, `${shape}-${sub}`).toBeGreaterThan(0);
        expect(g.getAttribute("color"), `${shape}-${sub}`).toBeDefined();
      }
    }
  });

  it("path is flatter than grass — Shape A overhang smaller than grass", () => {
    expect(span(buildPathShape("A", 0)).x).toBeLessThan(span(buildGrassShape("A", 0)).x);
  });
});
