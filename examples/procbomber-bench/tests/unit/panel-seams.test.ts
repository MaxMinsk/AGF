// S109 KABOOM-PROCEDURAL-TEXTURING — Layer 1 panel-seams unit tests.

import { Color } from "three";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_BOMBER_TEXTURING,
  PANEL_SEAM_FACTOR,
  generateTorso,
  generateUpperArm,
  type BomberPartSizes
} from "../../src/generators/bomber-parts";
import type { BomberPalette } from "../../src/generators/bomber-palette";

const SIZES: BomberPartSizes = {
  headSize: 0.4,
  torsoHeight: 0.5,
  torsoWidth: 0.4,
  upperArmLength: 0.18,
  forearmLength: 0.18,
  armWidth: 0.12,
  upperLegLength: 0.18,
  lowerLegLength: 0.18,
  legWidth: 0.16
};

const PALETTE: BomberPalette = {
  name: "sky",
  head: "#ff0000",
  torsoTop: "#00ff00",
  torsoBottom: "#003300",
  upperArm: "#0000ff",
  forearm: "#000088",
  upperLeg: "#888800",
  lowerLeg: "#440044",
  accent: "#ffffff"
};

// Project a hex onto a (r,g,b) triple in 0..1.
function colorOf(hex: string): [number, number, number] {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
}

function isNear(a: number, b: number, eps = 1e-4): boolean {
  return Math.abs(a - b) <= eps;
}

describe("S109 KABOOM-PROCEDURAL-TEXTURING — Layer 1 panel seams", () => {
  it("with panelSeams=false the upperArm box paints every vertex uniformly", () => {
    const g = generateUpperArm(SIZES, PALETTE, "box", { panelSeams: false, decals: [] });
    const color = g.getAttribute("color");
    expect(color).toBeDefined();
    const [r0, g0, b0] = colorOf(PALETTE.upperArm);
    for (let i = 0; i < color!.count; i += 1) {
      expect(color!.getX(i)).toBeCloseTo(r0, 5);
      expect(color!.getY(i)).toBeCloseTo(g0, 5);
      expect(color!.getZ(i)).toBeCloseTo(b0, 5);
    }
  });

  it("with panelSeams=true the upperArm extreme-Y vertices are darkened by PANEL_SEAM_FACTOR", () => {
    const g = generateUpperArm(SIZES, PALETTE, "box", { panelSeams: true, decals: [] });
    const position = g.getAttribute("position");
    const color = g.getAttribute("color");
    expect(color).toBeDefined();
    const [r0, g0, b0] = colorOf(PALETTE.upperArm);
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < position!.count; i += 1) {
      const y = position!.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    let darkenedCount = 0;
    let uniformCount = 0;
    const span = maxY - minY;
    const eps = span * 0.005;
    for (let i = 0; i < color!.count; i += 1) {
      const y = position!.getY(i);
      const onEdge = y <= minY + eps || y >= maxY - eps;
      const r = color!.getX(i);
      if (onEdge) {
        expect(r).toBeCloseTo(r0 * PANEL_SEAM_FACTOR, 4);
        expect(color!.getY(i)).toBeCloseTo(g0 * PANEL_SEAM_FACTOR, 4);
        expect(color!.getZ(i)).toBeCloseTo(b0 * PANEL_SEAM_FACTOR, 4);
        darkenedCount += 1;
      } else {
        // Non-edge vertex — full channel colour.
        expect(r).toBeCloseTo(r0, 4);
        uniformCount += 1;
      }
    }
    // BoxGeometry emits 24 vertices (4 per face × 6 faces). The 8 corner
    // vertices each appear in 3 faces → 24 darkened slots; the 4
    // mid-side vertices on the top + bottom faces also count here ONLY
    // if buildBoxLike emits a 1×1×1 subdivision (it does — BoxGeometry's
    // default segments are 1, so face has 4 verts). So darkened = top
    // 4-vert ring + bottom 4-vert ring duplicated across the 3 faces
    // they share. We just assert it's > 0 and < count.
    expect(darkenedCount).toBeGreaterThan(0);
    expect(uniformCount).toBeGreaterThan(0);
  });

  it("default texturing has panelSeams=true (DEFAULT_BOMBER_TEXTURING)", () => {
    expect(DEFAULT_BOMBER_TEXTURING.panelSeams).toBe(true);
  });

  it("generateTorso composes panelSeams on top of paintBottomShadow", () => {
    const g = generateTorso(SIZES, PALETTE, "box", { panelSeams: true, decals: [] });
    const position = g.getAttribute("position");
    const color = g.getAttribute("color");
    let minY = Infinity;
    for (let i = 0; i < position!.count; i += 1) {
      const y = position!.getY(i);
      if (y < minY) minY = y;
    }
    const span = SIZES.torsoHeight;
    const eps = span * 0.005;
    const [rBottom, gBottom, bBottom] = colorOf(PALETTE.torsoBottom);
    // Bottom-Y vertices: were painted torsoBottom by paintBottomShadow,
    // then darkened by panelSeams.
    let checked = 0;
    for (let i = 0; i < color!.count; i += 1) {
      const y = position!.getY(i);
      if (y <= minY + eps) {
        expect(color!.getX(i)).toBeCloseTo(rBottom * PANEL_SEAM_FACTOR, 4);
        expect(color!.getY(i)).toBeCloseTo(gBottom * PANEL_SEAM_FACTOR, 4);
        expect(color!.getZ(i)).toBeCloseTo(bBottom * PANEL_SEAM_FACTOR, 4);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("cylinder shape darkens top + bottom rings when panelSeams is on", () => {
    const g = generateUpperArm(SIZES, PALETTE, "cylinder", { panelSeams: true, decals: [] });
    const position = g.getAttribute("position");
    const color = g.getAttribute("color");
    const [r0, g0, b0] = colorOf(PALETTE.upperArm);
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < position!.count; i += 1) {
      const y = position!.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const eps = (maxY - minY) * 0.005;
    let darkenedCount = 0;
    for (let i = 0; i < color!.count; i += 1) {
      const y = position!.getY(i);
      if (y <= minY + eps || y >= maxY - eps) {
        const r = color!.getX(i);
        if (isNear(r, r0 * PANEL_SEAM_FACTOR, 0.01)) darkenedCount += 1;
      }
    }
    // A cylinder with 16 radial segments has 17 top-ring verts + 17 bottom-ring
    // verts in BufferGeometry's emit (because the seam vertex duplicates).
    // We just assert "some are darkened".
    expect(darkenedCount).toBeGreaterThan(5);
  });

  it("is deterministic — same inputs → identical vertex-colour buffer", () => {
    const a = generateUpperArm(SIZES, PALETTE, "box", { panelSeams: true, decals: [] });
    const b = generateUpperArm(SIZES, PALETTE, "box", { panelSeams: true, decals: [] });
    const ca = a.getAttribute("color")!;
    const cb = b.getAttribute("color")!;
    expect(ca.count).toBe(cb.count);
    for (let i = 0; i < ca.count; i += 1) {
      expect(ca.getX(i)).toBe(cb.getX(i));
      expect(ca.getY(i)).toBe(cb.getY(i));
      expect(ca.getZ(i)).toBe(cb.getZ(i));
    }
  });
});
