// S102 PROCBOMBER-PART-BUILDERS — per-part procedural mesh generators.

import { describe, expect, it } from "vitest";

import { paletteByName } from "../../src/generators/bomber-palette";
import {
  generatePart,
  generateForearm,
  generateHead,
  generateLowerLeg,
  generateTorso,
  generateUpperArm,
  generateUpperLeg,
  partColor,
  partKey,
  type BomberPartName,
  type BomberPartSizes
} from "../../src/generators/bomber-parts";
import { BOMBER_MESH_DEFAULTS } from "../../src/generators/bomber-mesh";

const SIZES: BomberPartSizes = {
  headSize: BOMBER_MESH_DEFAULTS.headSize,
  torsoHeight: BOMBER_MESH_DEFAULTS.torsoHeight,
  torsoWidth: BOMBER_MESH_DEFAULTS.torsoWidth,
  upperArmLength: BOMBER_MESH_DEFAULTS.upperArmLength,
  forearmLength: BOMBER_MESH_DEFAULTS.forearmLength,
  armWidth: BOMBER_MESH_DEFAULTS.armWidth,
  upperLegLength: BOMBER_MESH_DEFAULTS.upperLegLength,
  lowerLegLength: BOMBER_MESH_DEFAULTS.lowerLegLength,
  legWidth: BOMBER_MESH_DEFAULTS.legWidth
};
const SKY = paletteByName("sky");

describe("partKey / partColor (S102)", () => {
  it("partKey returns the procedural mesh ref base", () => {
    const expected: Record<BomberPartName, string> = {
      torso: "procbomber-torso",
      head: "procbomber-head",
      upperArm: "procbomber-upperArm",
      forearm: "procbomber-forearm",
      upperLeg: "procbomber-upperLeg",
      lowerLeg: "procbomber-lowerLeg"
    };
    for (const [name, key] of Object.entries(expected) as Array<[BomberPartName, string]>) {
      expect(partKey(name)).toBe(key);
    }
  });

  it("partColor maps to the right palette channel", () => {
    expect(partColor(SKY, "head")).toBe(SKY.head);
    expect(partColor(SKY, "torso")).toBe(SKY.torsoTop);
    expect(partColor(SKY, "upperArm")).toBe(SKY.upperArm);
    expect(partColor(SKY, "forearm")).toBe(SKY.forearm);
    expect(partColor(SKY, "upperLeg")).toBe(SKY.upperLeg);
    expect(partColor(SKY, "lowerLeg")).toBe(SKY.lowerLeg);
  });
});

describe("torso geometry (S102)", () => {
  const g = generateTorso(SIZES, SKY);
  it("is 32 vertices (S109: heightSegments=2 for panel-seam read)", () => {
    // S109 KABOOM-PROCEDURAL-TEXTURING bumped buildBoxLike's BoxGeometry
    // to heightSegments=2 so the top + bottom edge rows can darken
    // independently from the middle band. Pre-S109 this was 24.
    expect(g.getAttribute("position").count).toBe(32);
  });
  it("is centered on Y (range = [-h/2 .. +h/2])", () => {
    let minY = Infinity;
    let maxY = -Infinity;
    const pos = g.getAttribute("position");
    for (let i = 0; i < pos.count; i += 1) {
      minY = Math.min(minY, pos.getY(i));
      maxY = Math.max(maxY, pos.getY(i));
    }
    expect(minY).toBeCloseTo(-SIZES.torsoHeight / 2, 5);
    expect(maxY).toBeCloseTo(SIZES.torsoHeight / 2, 5);
  });
  it("bottom band uses torsoBottom (contact-shadow split)", async () => {
    void (await import("three")); // satisfies the original async signature
    const pos = g.getAttribute("position");
    const color = g.getAttribute("color");
    // S109 KABOOM-PROCEDURAL-TEXTURING — torso is now a 1×2×1 BoxGeometry
    // so a mid-Y vertex row exists. We use that row (Y ≈ 0) as the
    // bright reference and the bottom-extreme row as the contact-shadow
    // reference. The panel-seam pass darkens both top + bottom edges,
    // so we explicitly pick a mid-Y vertex to read the "bright" colour.
    let bottomColor: [number, number, number] | undefined;
    let midColor: [number, number, number] | undefined;
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i);
      if (Math.abs(y - (-SIZES.torsoHeight / 2)) < 1e-4) {
        bottomColor = [color.getX(i), color.getY(i), color.getZ(i)];
      } else if (Math.abs(y) < 1e-4) {
        midColor = [color.getX(i), color.getY(i), color.getZ(i)];
      }
    }
    expect(bottomColor).toBeDefined();
    expect(midColor).toBeDefined();
    // Bottom is darker — at least one channel should be lower than the mid row.
    expect(bottomColor![0] + bottomColor![1] + bottomColor![2])
      .toBeLessThan(midColor![0] + midColor![1] + midColor![2]);
  });
});

describe("head geometry (S102)", () => {
  it("is 32 vertices (S109 heightSegments=2) centered at Y=0 in local space", () => {
    const g = generateHead(SIZES, SKY);
    expect(g.getAttribute("position").count).toBe(32);
    const pos = g.getAttribute("position");
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i += 1) {
      minY = Math.min(minY, pos.getY(i));
      maxY = Math.max(maxY, pos.getY(i));
    }
    expect(minY).toBeCloseTo(-SIZES.headSize / 2, 5);
    expect(maxY).toBeCloseTo(SIZES.headSize / 2, 5);
  });
});

describe("limb-segment geometry — hangs below the pivot (S102)", () => {
  const arm = generateUpperArm(SIZES, SKY);
  it("upperArm Y range is [-upperArmLength .. 0] (pivot at top)", () => {
    const pos = arm.getAttribute("position");
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i += 1) {
      minY = Math.min(minY, pos.getY(i));
      maxY = Math.max(maxY, pos.getY(i));
    }
    expect(minY).toBeCloseTo(-SIZES.upperArmLength, 5);
    expect(maxY).toBeCloseTo(0, 5);
  });

  it("forearm + upperLeg + lowerLeg share the same hang-below-pivot layout", () => {
    for (const g of [generateForearm(SIZES, SKY), generateUpperLeg(SIZES, SKY), generateLowerLeg(SIZES, SKY)]) {
      const pos = g.getAttribute("position");
      let maxY = -Infinity;
      for (let i = 0; i < pos.count; i += 1) maxY = Math.max(maxY, pos.getY(i));
      expect(maxY).toBeCloseTo(0, 5);
    }
  });
});

describe("generatePart dispatcher (S102)", () => {
  it("returns the same geometry as the named builder for every part", () => {
    const torso = generatePart("torso", SIZES, SKY);
    // S109: heightSegments=2 → 32 verts per box (was 24).
    expect(torso.getAttribute("position").count).toBe(32);
    const head = generatePart("head", SIZES, SKY);
    expect(head.getAttribute("position").count).toBe(32);
  });

  it("S102: branches on shape — cylinder uses non-box vertex count, capsule too", () => {
    const box = generatePart("head", SIZES, SKY, { head: "box", torso: "box", limb: "box" });
    const cyl = generatePart("head", SIZES, SKY, { head: "cylinder", torso: "box", limb: "box" });
    const cap = generatePart("head", SIZES, SKY, { head: "capsule", torso: "box", limb: "box" });
    // S109: BoxGeometry now has 32 vertices (heightSegments=2);
    // CylinderGeometry + CapsuleGeometry generate many more — assert
    // each is distinct from the box count + each other.
    expect(box.getAttribute("position").count).toBe(32);
    expect(cyl.getAttribute("position").count).not.toBe(32);
    expect(cap.getAttribute("position").count).not.toBe(32);
    expect(cap.getAttribute("position").count).not.toBe(cyl.getAttribute("position").count);
  });
});
