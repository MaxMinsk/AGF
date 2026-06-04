// GDP-2026-06-04-003 — grass curved-outline mesh tests (6-shape model).

import { describe, expect, it } from "vitest";

import {
  buildGrassShape,
  grassShapeForBitmask,
  type GrassShape
} from "../../src/blocks/grass-variants";

function vertexCount(g: ReturnType<typeof buildGrassShape>): number {
  return g.getAttribute("position").count;
}

function xzSpan(g: ReturnType<typeof buildGrassShape>): { x: number; z: number } {
  g.computeBoundingBox();
  const b = g.boundingBox!;
  return { x: b.max.x - b.min.x, z: b.max.z - b.min.z };
}

const ALL_SHAPES: GrassShape[] = ["A", "B", "C", "D", "E", "F"];

describe("buildGrassShape (GDP-2026-06-04-003)", () => {
  it("Shape A (isolated): XZ span exceeds 1.0 — overhang on all edges", () => {
    const s = xzSpan(buildGrassShape("A", 0));
    expect(s.x).toBeGreaterThan(1.0);
    expect(s.z).toBeGreaterThan(1.0);
  });

  it("Shape F (filler): XZ span is ~1×1 square — no overhang", () => {
    const s = xzSpan(buildGrassShape("F", 0));
    expect(Math.abs(s.x - 1.0)).toBeLessThan(0.02);
    expect(Math.abs(s.z - 1.0)).toBeLessThan(0.02);
  });

  it("Shape A has more vertices than Shape F (curved outline > square)", () => {
    expect(vertexCount(buildGrassShape("A", 0))).toBeGreaterThan(vertexCount(buildGrassShape("F", 0)));
  });

  it("all 18 shape×sub combos produce valid position/normal/color attributes", () => {
    for (const shape of ALL_SHAPES) {
      for (const sub of [0, 1, 2] as const) {
        const g = buildGrassShape(shape, sub);
        expect(g.getAttribute("position"), `${shape}-${sub}`).toBeDefined();
        expect(g.getAttribute("normal"),   `${shape}-${sub}`).toBeDefined();
        expect(g.getAttribute("color"),    `${shape}-${sub}`).toBeDefined();
        expect(g.getAttribute("position").count).toBeGreaterThan(0);
      }
    }
  });

  it("sub-variants change the outline (vertex count differs across subs for an open shape)", () => {
    // sub 2 uses double-bump Bezier → different sample count than single-bump.
    const counts = new Set([0, 1, 2].map(s => vertexCount(buildGrassShape("A", s as 0 | 1 | 2))));
    expect(counts.size).toBeGreaterThan(1);
  });

  it("deterministic: same shape+sub yields identical vertex count", () => {
    expect(vertexCount(buildGrassShape("C", 1))).toBe(vertexCount(buildGrassShape("C", 1)));
  });

  it("Shape F filler is now DISTINCT across all 3 sub-variants (GDP-006 §A)", () => {
    const sig = (sub: 0 | 1 | 2): string => {
      const g = buildGrassShape("F", sub);
      const pos = g.getAttribute("position"), col = g.getAttribute("color");
      let s = "";
      for (let i = 0; i < pos.count; i++) s += `${pos.getY(i).toFixed(3)}:${col.getX(i).toFixed(2)}`;
      return s;
    };
    const a = sig(0), b = sig(1), c = sig(2);
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a).not.toBe(c);
  });

  it("Shape F perimeter stays pinned at nominal Y (C-1 — interior variation didn't move the seam)", () => {
    for (const sub of [0, 1, 2] as const) {
      const g = buildGrassShape("F", sub);
      const pos = g.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const onPerimeter = Math.abs(Math.abs(x) - 0.5) < 1e-6 || Math.abs(Math.abs(z) - 0.5) < 1e-6;
        if (onPerimeter && y > 0.01) {
          expect(Math.abs(y - 0.20), `sub=${sub} perimeter y=${y}`).toBeLessThan(1e-6);
        }
      }
    }
  });

  it("Shape C convex-corner push differs across sub-variants (GDP-006 §B)", () => {
    const ext = (sub: 0 | 1 | 2): number => {
      const g = buildGrassShape("C", sub);
      g.computeBoundingBox();
      const b = g.boundingBox!;
      return (b.max.x - b.min.x) + (b.max.z - b.min.z);
    };
    // sub 1 push 0.16 > sub 0 push 0.10 > sub 2 push 0.06 → extents differ.
    expect(ext(0)).not.toBeCloseTo(ext(1), 2);
    expect(ext(1)).not.toBeCloseTo(ext(2), 2);
  });

  describe("grassShapeForBitmask — bitmask → (shape, rotation)", () => {
    it("bitmask 0 → A, bitmask 15 → F", () => {
      expect(grassShapeForBitmask(0).shape).toBe("A");
      expect(grassShapeForBitmask(15).shape).toBe("F");
    });

    it("single-neighbour bitmasks all map to shape B", () => {
      for (const m of [1, 2, 4, 8]) expect(grassShapeForBitmask(m).shape).toBe("B");
    });

    it("adjacent-pair bitmasks map to shape C (corner)", () => {
      for (const m of [3, 6, 9, 12]) expect(grassShapeForBitmask(m).shape).toBe("C");
    });

    it("opposite-pair bitmasks map to shape D (strip)", () => {
      for (const m of [5, 10]) expect(grassShapeForBitmask(m).shape).toBe("D");
    });

    it("three-neighbour bitmasks map to shape E (T-junction)", () => {
      for (const m of [7, 11, 13, 14]) expect(grassShapeForBitmask(m).shape).toBe("E");
    });

    it("the four shape-B rotations are distinct (cover N/E/S/W)", () => {
      const rots = new Set([8, 1, 2, 4].map(m => grassShapeForBitmask(m).rotationYDeg));
      expect(rots.size).toBe(4);
    });
  });
});
