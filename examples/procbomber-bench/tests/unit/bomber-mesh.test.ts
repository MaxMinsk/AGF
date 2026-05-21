// S101 PROCBOMBER-MESH-V0 — humanoid mesh generator.

import { describe, expect, it } from "vitest";

import { paletteByName } from "../../src/generators/bomber-palette";
import {
  BOMBER_MESH_DEFAULTS,
  generateBomberMesh,
  type BomberAnchors,
  type BomberMeshSpec
} from "../../src/generators/bomber-mesh";

function specWith(overrides: Partial<BomberMeshSpec> = {}): BomberMeshSpec {
  return { palette: paletteByName("sky"), ...overrides };
}

describe("generateBomberMesh structure (S101)", () => {
  it("produces a BufferGeometry with position + color attributes", () => {
    const g = generateBomberMesh(specWith());
    expect(g.getAttribute("position")).toBeDefined();
    expect(g.getAttribute("color")).toBeDefined();
    const position = g.getAttribute("position")!;
    const color = g.getAttribute("color")!;
    expect(position.count).toBe(color.count);
  });

  it("uses the canonical six-box vertex count (6 parts × 24 verts each = 144)", () => {
    const g = generateBomberMesh(specWith());
    // BoxGeometry produces 24 vertices (4 per face × 6 faces). The
    // generator merges 6 part boxes without re-indexing across part
    // boundaries, so the total is exactly 144.
    expect(g.getAttribute("position")!.count).toBe(144);
  });

  it("centers the mesh on the XZ plane (vertex X range is symmetric around 0)", () => {
    const g = generateBomberMesh(specWith());
    const pos = g.getAttribute("position")!;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    expect(maxX + minX).toBeCloseTo(0, 4);
  });

  it("stands the mesh feet-on-ground (minimum Y >= 0; total height matches spec)", () => {
    const g = generateBomberMesh(specWith());
    const pos = g.getAttribute("position")!;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    expect(minY).toBeCloseTo(0, 4);
    const totalHeight =
      BOMBER_MESH_DEFAULTS.legLength + BOMBER_MESH_DEFAULTS.torsoHeight + BOMBER_MESH_DEFAULTS.headSize;
    expect(maxY).toBeCloseTo(totalHeight, 4);
  });
});

describe("generateBomberMesh anchors (S101)", () => {
  it("stashes head/torso/limb anchors in userData; head Y > torso Y > leg Y", () => {
    const g = generateBomberMesh(specWith());
    const anchors = g.userData["anchors"] as BomberAnchors;
    expect(anchors.head.center[1]).toBeGreaterThan(anchors.torso.center[1]);
    expect(anchors.torso.center[1]).toBeGreaterThan(anchors.legL.center[1]);
    expect(anchors.legL.center[1]).toBe(anchors.legR.center[1]);
    expect(anchors.armL.center[0]).toBeLessThan(0);
    expect(anchors.armR.center[0]).toBeGreaterThan(0);
  });

  it("records totalHeight + palette name in userData", () => {
    const g = generateBomberMesh(specWith());
    expect(typeof g.userData["totalHeight"]).toBe("number");
    expect(g.userData["palette"]).toBe("sky");
  });
});

describe("generateBomberMesh determinism + scale (S101)", () => {
  it("same spec produces same vertex positions byte-for-byte", () => {
    const a = generateBomberMesh(specWith());
    const b = generateBomberMesh(specWith());
    const aPos = a.getAttribute("position")!.array as Float32Array;
    const bPos = b.getAttribute("position")!.array as Float32Array;
    expect(aPos.length).toBe(bPos.length);
    for (let i = 0; i < aPos.length; i += 1) {
      expect(aPos[i]).toBe(bPos[i]);
    }
  });

  it("larger headSize raises the head anchor + total height", () => {
    const small = generateBomberMesh(specWith({ headSize: 0.2 }));
    const big = generateBomberMesh(specWith({ headSize: 0.6 }));
    const smallH = small.userData["totalHeight"] as number;
    const bigH = big.userData["totalHeight"] as number;
    expect(bigH).toBeGreaterThan(smallH);
    expect(bigH - smallH).toBeCloseTo(0.4, 4);
  });

  it("vertex colors map to palette head/torso/limbs values", async () => {
    const { Color } = await import("three");
    const spec = specWith();
    const g = generateBomberMesh(spec);
    const color = g.getAttribute("color")!;
    // Head vertices are the first 24 entries (head is the first part).
    // Three.js Color stores linear-RGB internally — compute the expected
    // value via Color() rather than raw hex/255.
    const headLinear = new Color(spec.palette.head);
    const torsoLinear = new Color(spec.palette.torsoTop);
    expect(color.getX(0)).toBeCloseTo(headLinear.r, 4);
    expect(color.getY(0)).toBeCloseTo(headLinear.g, 4);
    expect(color.getZ(0)).toBeCloseTo(headLinear.b, 4);
    // Torso vertices start at index 24 (head is 24 verts).
    expect(color.getX(24)).toBeCloseTo(torsoLinear.r, 4);
  });
});
