// S113 KABOOM-PROCEDURAL-TEXTURING-LAYER-3 — stripes unit tests.

import { Color } from "three";
import { describe, expect, it } from "vitest";

import {
  generateForearm,
  generateUpperArm,
  type BomberPartSizes,
  type BomberTexturing
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
  head: "#666666",
  torsoTop: "#777777",
  torsoBottom: "#333333",
  upperArm: "#555555",
  forearm: "#444444",
  upperLeg: "#888888",
  lowerLeg: "#999999",
  accent: "#ff00ff"
};

function isClose(a: number, b: number, eps = 0.01): boolean {
  return Math.abs(a - b) <= eps;
}

function countAccentVerts(g: ReturnType<typeof generateUpperArm>, accent: Color): number {
  const c = g.getAttribute("color");
  let n = 0;
  for (let i = 0; i < c.count; i += 1) {
    if (isClose(c.getX(i), accent.r) && isClose(c.getY(i), accent.g) && isClose(c.getZ(i), accent.b)) n += 1;
  }
  return n;
}

const STRIPE_TX = (scale = 4): BomberTexturing => ({
  panelSeams: true,
  decals: [],
  pattern: { style: "stripes", scale }
});

const SOLID_TX: BomberTexturing = {
  panelSeams: true,
  decals: [],
  pattern: { style: "solid", scale: 4 }
};

describe("S113 KABOOM-PROCEDURAL-TEXTURING-LAYER-3 — stripes", () => {
  it("solid (default) paints no accent vertices on the upperArm", () => {
    const g = generateUpperArm(SIZES, PALETTE, "box", SOLID_TX);
    const accent = new Color(PALETTE.accent);
    expect(countAccentVerts(g, accent)).toBe(0);
  });

  it("stripes pattern paints SOME vertices with palette.accent on the upperArm", () => {
    const g = generateUpperArm(SIZES, PALETTE, "box", STRIPE_TX(4));
    const accent = new Color(PALETTE.accent);
    expect(countAccentVerts(g, accent)).toBeGreaterThan(0);
  });

  it("stripes geometry has more Y rows than solid (heightSegments bumped to scale × 2)", () => {
    const solid = generateUpperArm(SIZES, PALETTE, "box", SOLID_TX);
    const striped = generateUpperArm(SIZES, PALETTE, "box", STRIPE_TX(4));
    expect(striped.getAttribute("position").count).toBeGreaterThan(solid.getAttribute("position").count);
  });

  it("higher scale → more accent vertices (denser striping)", () => {
    const accent = new Color(PALETTE.accent);
    const scale2 = countAccentVerts(generateUpperArm(SIZES, PALETTE, "box", STRIPE_TX(2)), accent);
    const scale6 = countAccentVerts(generateUpperArm(SIZES, PALETTE, "box", STRIPE_TX(6)), accent);
    expect(scale6).toBeGreaterThan(scale2);
  });

  it("scale out of range gets clamped (scale=99 → max=6)", () => {
    const accent = new Color(PALETTE.accent);
    const scale6 = countAccentVerts(generateUpperArm(SIZES, PALETTE, "box", STRIPE_TX(6)), accent);
    const scale99 = countAccentVerts(generateUpperArm(SIZES, PALETTE, "box", STRIPE_TX(99)), accent);
    expect(scale99).toBe(scale6);
  });

  it("is deterministic — same inputs → identical vertex-colour buffer", () => {
    const a = generateForearm(SIZES, PALETTE, "box", STRIPE_TX(4));
    const b = generateForearm(SIZES, PALETTE, "box", STRIPE_TX(4));
    const ca = a.getAttribute("color");
    const cb = b.getAttribute("color");
    expect(ca.count).toBe(cb.count);
    for (let i = 0; i < ca.count; i += 1) {
      expect(ca.getX(i)).toBe(cb.getX(i));
      expect(ca.getY(i)).toBe(cb.getY(i));
      expect(ca.getZ(i)).toBe(cb.getZ(i));
    }
  });

  it("top + bottom rim rows stay panel-seam-darkened (stripes skip extreme-Y)", () => {
    const g = generateUpperArm(SIZES, PALETTE, "box", STRIPE_TX(4));
    const position = g.getAttribute("position");
    const color = g.getAttribute("color");
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < position.count; i += 1) {
      const y = position.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const span = maxY - minY;
    const accent = new Color(PALETTE.accent);
    // The very top + bottom vertex rows shouldn't be accent-painted —
    // they keep the panel-seam darken (≈ 0.85 × base).
    for (let i = 0; i < position.count; i += 1) {
      const y = position.getY(i);
      const onRim = y <= minY + span * 0.01 || y >= maxY - span * 0.01;
      if (!onRim) continue;
      // Reject: if this vertex were painted accent, our skip-extreme-Y
      // logic would have a bug.
      expect(isClose(color.getX(i), accent.r) && isClose(color.getY(i), accent.g) && isClose(color.getZ(i), accent.b)).toBe(false);
    }
  });
});
