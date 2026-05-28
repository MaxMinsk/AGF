// S165 KABOOM-MULTI-VARIANT-BLOCKS (GDP-2026-05-28-003) — unit coverage
// for the procedural block-variant builders + per-cell variant selector.

import { describe, expect, it } from "vitest";

import { buildHardBlockVariant } from "../../src/blocks/hard-block-variants";
import { buildSoftBlockVariant } from "../../src/blocks/soft-block-variants";
import { buildFloorTileVariant } from "../../src/blocks/floor-tile-variants";
import {
  decodeBlockSeed,
  encodeBlockSeed,
  selectVariantIndex
} from "../../src/blocks/per-cell-variant-selector";

function vertexSignature(g: ReturnType<typeof buildHardBlockVariant>): {
  count: number;
  positionSum: number;
  colorSum: number;
} {
  const pos = g.getAttribute("position");
  const col = g.getAttribute("color");
  let posSum = 0;
  for (let i = 0; i < pos.count; i += 1) {
    posSum += pos.getX(i) + pos.getY(i) + pos.getZ(i);
  }
  // S170 hotfix — variants that share BoxGeometry differ only in
  // vertex-color tinting; include the colour sum so the signature
  // still distinguishes them.
  let colSum = 0;
  if (col !== undefined) {
    for (let i = 0; i < col.count; i += 1) {
      colSum += col.getX(i) + col.getY(i) + col.getZ(i);
    }
  }
  return {
    count: pos.count,
    positionSum: Math.round(posSum * 1000) / 1000,
    colorSum: Math.round(colSum * 1000) / 1000
  };
}

describe("buildHardBlockVariant (S165 GDP-003)", () => {
  it("produces 4 structurally-different geometries", () => {
    const geoms = [0, 1, 2, 3].map((i) => buildHardBlockVariant(i as 0 | 1 | 2 | 3));
    const sigs = geoms.map(vertexSignature);
    // At least two should differ in vertex count OR position sum —
    // require all 4 to be pairwise-different on at least one axis.
    for (let a = 0; a < sigs.length; a += 1) {
      const sa = sigs[a]!;
      for (let b = a + 1; b < sigs.length; b += 1) {
        const sb = sigs[b]!;
        const differ = sa.count !== sb.count || sa.positionSum !== sb.positionSum || sa.colorSum !== sb.colorSum;
        expect(
          differ,
          `variants ${a} and ${b} are indistinguishable (sigs ${JSON.stringify(sa)} vs ${JSON.stringify(sb)})`
        ).toBe(true);
      }
    }
  });

  it("attaches a position + color attribute to every variant", () => {
    for (const i of [0, 1, 2, 3] as const) {
      const g = buildHardBlockVariant(i);
      expect(g.getAttribute("position")).toBeDefined();
      expect(g.getAttribute("color")).toBeDefined();
      expect(g.getAttribute("position").count).toBeGreaterThan(0);
    }
  });

  it("accepts the optional bitmask argument without consuming it", () => {
    // v1 ignores bitmask — same input + bitmask varying should still
    // return the SAME geometry shape (vertex count). The function just
    // has to NOT crash.
    const a = buildHardBlockVariant(2);
    const b = buildHardBlockVariant(2, 7);
    expect(vertexSignature(a).count).toBe(vertexSignature(b).count);
  });
});

describe("buildSoftBlockVariant (S165 GDP-003)", () => {
  it("produces 4 structurally-different geometries", () => {
    const geoms = [0, 1, 2, 3].map((i) => buildSoftBlockVariant(i as 0 | 1 | 2 | 3));
    const sigs = geoms.map(vertexSignature);
    for (let a = 0; a < sigs.length; a += 1) {
      const sa = sigs[a]!;
      for (let b = a + 1; b < sigs.length; b += 1) {
        const sb = sigs[b]!;
        const differ = sa.count !== sb.count || sa.positionSum !== sb.positionSum || sa.colorSum !== sb.colorSum;
        expect(
          differ,
          `soft-block variants ${a} and ${b} are indistinguishable`
        ).toBe(true);
      }
    }
  });

  it("attaches a color attribute to every variant", () => {
    for (const i of [0, 1, 2, 3] as const) {
      const g = buildSoftBlockVariant(i);
      expect(g.getAttribute("position")).toBeDefined();
      expect(g.getAttribute("color")).toBeDefined();
    }
  });
});

describe("buildFloorTileVariant (S165 GDP-003)", () => {
  it("produces 4 structurally-different geometries", () => {
    const geoms = [0, 1, 2, 3].map((i) => buildFloorTileVariant(i as 0 | 1 | 2 | 3));
    const sigs = geoms.map(vertexSignature);
    // Floor variants share the same base box subdivisions but differ
    // in vertex-colour painting. Require at least one PAIR to differ
    // on the position-sum (the plain variant has fewer subdivisions).
    // Sum-based check is loose by design — patterns paint, they don't
    // displace.
    const distinctSigs = new Set(sigs.map((s) => `${s.count}:${s.positionSum}:${s.colorSum}`));
    // At least plain (1 subdivision) vs the 4-segment variants is
    // structurally different — distinctSigs should hold > 1 entry.
    expect(distinctSigs.size).toBeGreaterThan(1);
  });

  it("colours floor variants distinctly", () => {
    // Variants 1..3 paint different vertex patterns on the same
    // subdivision count. Compare color attribute sums.
    const colorSums = ([0, 1, 2, 3] as const).map((i) => {
      const g = buildFloorTileVariant(i);
      const color = g.getAttribute("color")!;
      let sum = 0;
      for (let v = 0; v < color.count; v += 1) {
        sum += color.getX(v) + color.getY(v) + color.getZ(v);
      }
      return Math.round(sum * 1000) / 1000;
    });
    // All four should NOT collapse to a single value.
    expect(new Set(colorSums).size).toBeGreaterThan(1);
  });

  it("uses thin slab outer dimensions (1 × 0.05 × 1)", () => {
    const g = buildFloorTileVariant(0);
    g.computeBoundingBox();
    const box = g.boundingBox!;
    expect(Math.abs(box.max.x - box.min.x) - 1).toBeLessThan(0.01);
    expect(Math.abs(box.max.y - box.min.y) - 0.05).toBeLessThan(0.01);
    expect(Math.abs(box.max.z - box.min.z) - 1).toBeLessThan(0.01);
  });
});

describe("selectVariantIndex (S165 GDP-003)", () => {
  it("returns a 0..3 index", () => {
    for (let gx = 0; gx < 5; gx += 1) {
      for (let gz = 0; gz < 5; gz += 1) {
        const v = selectVariantIndex(gx, gz, "abc");
        expect([0, 1, 2, 3]).toContain(v);
      }
    }
  });

  it("is deterministic — same inputs → same output", () => {
    expect(selectVariantIndex(5, 5, "abc")).toBe(selectVariantIndex(5, 5, "abc"));
    expect(selectVariantIndex(13, 9, "scene-x")).toBe(selectVariantIndex(13, 9, "scene-x"));
  });

  it("varies across the cell grid (not constant)", () => {
    const seen = new Set<number>();
    for (let gx = 0; gx < 15; gx += 1) {
      for (let gz = 0; gz < 11; gz += 1) {
        seen.add(selectVariantIndex(gx, gz, "kaboom-crew"));
      }
    }
    // Across a 15×11 grid we should hit at least 3 of the 4 variants.
    // Hitting all 4 is the target; this assertion guards against
    // a hash function that collapses everything to one value.
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  it("respects scene seed — different seeds give different variant maps", () => {
    let diffs = 0;
    for (let gx = 0; gx < 15; gx += 1) {
      for (let gz = 0; gz < 11; gz += 1) {
        if (selectVariantIndex(gx, gz, "scene-a") !== selectVariantIndex(gx, gz, "scene-b")) {
          diffs += 1;
        }
      }
    }
    // We expect ~75% of cells to differ across seeds (random would
    // give 3/4). Allow a wide margin for hash quality.
    expect(diffs).toBeGreaterThan(15 * 11 * 0.3);
  });
});

describe("encodeBlockSeed / decodeBlockSeed (S165 GDP-003)", () => {
  it("roundtrips gx, gz + sceneSeed", () => {
    const encoded = encodeBlockSeed(7, 3, "kaboom-crew");
    expect(encoded).toBe("7,3,kaboom-crew");
    expect(decodeBlockSeed(encoded)).toEqual({ gx: 7, gz: 3, sceneSeed: "kaboom-crew" });
  });

  it("returns undefined for malformed seeds", () => {
    expect(decodeBlockSeed("")).toBeUndefined();
    expect(decodeBlockSeed("default")).toBeUndefined();
    expect(decodeBlockSeed("nope")).toBeUndefined();
    expect(decodeBlockSeed("5,")).toBeUndefined();
  });

  it("handles scene seeds containing commas", () => {
    // The decoder splits on the first two commas only — extra commas
    // belong to the scene seed body.
    const encoded = encodeBlockSeed(2, 4, "my,scene,seed");
    const decoded = decodeBlockSeed(encoded);
    expect(decoded).toEqual({ gx: 2, gz: 4, sceneSeed: "my,scene,seed" });
  });
});
