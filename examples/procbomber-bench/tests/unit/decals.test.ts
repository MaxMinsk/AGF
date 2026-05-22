// S112 KABOOM-PROCEDURAL-TEXTURING-LAYER-2 — decal unit tests.

import { Color } from "three";
import { describe, expect, it } from "vitest";

import {
  generateHead,
  generateLowerLeg,
  generateTorso,
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
  head: "#666666",
  torsoTop: "#777777",
  torsoBottom: "#333333",
  upperArm: "#555555",
  forearm: "#444444",
  upperLeg: "#888888",
  lowerLeg: "#999999",
  accent: "#ff00ff"
};

function colorTriple(hex: string): [number, number, number] {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
}

function isClose(a: number, b: number, eps = 0.01): boolean {
  return Math.abs(a - b) <= eps;
}

function countVerticesWithColor(g: ReturnType<typeof generateTorso>, color: [number, number, number]): number {
  const c = g.getAttribute("color");
  let n = 0;
  for (let i = 0; i < c.count; i += 1) {
    if (
      isClose(c.getX(i), color[0]) &&
      isClose(c.getY(i), color[1]) &&
      isClose(c.getZ(i), color[2])
    ) n += 1;
  }
  return n;
}

describe("S112 KABOOM-PROCEDURAL-TEXTURING-LAYER-2 — decals", () => {
  it("chestEmblem paints torso front-face mid-vertices with palette.accent", () => {
    const g = generateTorso(SIZES, PALETTE, "box", { panelSeams: true, decals: ["chestEmblem"] });
    const accent = colorTriple(PALETTE.accent);
    const accentVerts = countVerticesWithColor(g, accent);
    // Torso is now a 2x2x2 BoxGeometry; the front face has 9 verts
    // (3x3 grid) and the center vert lands in mid-X mid-Y — at least
    // 1 vertex must end up accent-coloured. Allow up to ~9 for the
    // mid band depending on the exact spanX / spanY proportions.
    expect(accentVerts).toBeGreaterThanOrEqual(1);
  });

  it("helmetStripe paints upper-half vertices of the head with palette.accent", () => {
    const g = generateHead(SIZES, PALETTE, "box", { panelSeams: true, decals: ["helmetStripe"] });
    const accent = colorTriple(PALETTE.accent);
    const accentVerts = countVerticesWithColor(g, accent);
    expect(accentVerts).toBeGreaterThan(0);
  });

  it("kneePad paints lowerLeg upper-third front-face vertices with the darker lowerLeg colour", () => {
    const g = generateLowerLeg(SIZES, PALETTE, "box", { panelSeams: true, decals: ["kneePad"] });
    // The kneePad shade is the lowerLeg colour × 0.55. Three.js Color
    // converts hex to linear sRGB (so `#999999` → ~0.32, not 0.6), so
    // we compute the expected value through Three.js too.
    const expected = new Color(PALETTE.lowerLeg).multiplyScalar(0.55);
    const c = g.getAttribute("color");
    let kneePadVerts = 0;
    for (let i = 0; i < c.count; i += 1) {
      if (isClose(c.getX(i), expected.r) && isClose(c.getY(i), expected.g) && isClose(c.getZ(i), expected.b)) {
        kneePadVerts += 1;
      }
    }
    expect(kneePadVerts).toBeGreaterThan(0);
  });

  it("decals=[] leaves no accent vertices on the torso", () => {
    const g = generateTorso(SIZES, PALETTE, "box", { panelSeams: true, decals: [] });
    const accent = colorTriple(PALETTE.accent);
    expect(countVerticesWithColor(g, accent)).toBe(0);
  });

  it("chestEmblem on lowerLeg has no effect (decal scoped to torso)", () => {
    const g = generateLowerLeg(SIZES, PALETTE, "box", { panelSeams: true, decals: ["chestEmblem"] });
    const accent = colorTriple(PALETTE.accent);
    expect(countVerticesWithColor(g, accent)).toBe(0);
  });

  it("is deterministic — same inputs → identical vertex-colour buffer", () => {
    const a = generateTorso(SIZES, PALETTE, "box", { panelSeams: true, decals: ["chestEmblem"] });
    const b = generateTorso(SIZES, PALETTE, "box", { panelSeams: true, decals: ["chestEmblem"] });
    const ca = a.getAttribute("color");
    const cb = b.getAttribute("color");
    expect(ca.count).toBe(cb.count);
    for (let i = 0; i < ca.count; i += 1) {
      expect(ca.getX(i)).toBe(cb.getX(i));
      expect(ca.getY(i)).toBe(cb.getY(i));
      expect(ca.getZ(i)).toBe(cb.getZ(i));
    }
  });

  it("multiple decals can be applied independently to different parts", () => {
    const torso = generateTorso(SIZES, PALETTE, "box", { panelSeams: true, decals: ["chestEmblem", "helmetStripe", "kneePad"] });
    const head = generateHead(SIZES, PALETTE, "box", { panelSeams: true, decals: ["chestEmblem", "helmetStripe", "kneePad"] });
    const lowerLeg = generateLowerLeg(SIZES, PALETTE, "box", { panelSeams: true, decals: ["chestEmblem", "helmetStripe", "kneePad"] });
    const accent = colorTriple(PALETTE.accent);
    expect(countVerticesWithColor(torso, accent)).toBeGreaterThan(0); // chestEmblem hit
    expect(countVerticesWithColor(head, accent)).toBeGreaterThan(0); // helmetStripe hit
    // lowerLeg paints kneePad (darker variant); accent vertices stay zero on lowerLeg.
    expect(countVerticesWithColor(lowerLeg, accent)).toBe(0);
  });
});
