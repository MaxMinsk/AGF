// S106 KABOOM-ACCESSORY-CATALOG.

import { describe, expect, it } from "vitest";

import {
  ACCESSORY_KINDS,
  accessoryKey,
  generateAccessory,
  isAccessoryKind,
  generateAntennaeAccessory,
  generateBackpackAccessory,
  generateCapAccessory,
  generateFinAccessory,
  generateVisorAccessory
} from "../../src/accessories/catalog";
import { paletteByName } from "../../src/generators/bomber-palette";

const SKY = paletteByName("sky");

describe("ACCESSORY_KINDS (S106)", () => {
  it("ships exactly 5 starter kinds", () => {
    expect(ACCESSORY_KINDS.length).toBe(5);
    expect(new Set(ACCESSORY_KINDS).size).toBe(5);
  });
  it("isAccessoryKind accepts each shipped name", () => {
    for (const k of ACCESSORY_KINDS) expect(isAccessoryKind(k)).toBe(true);
  });
  it("rejects unknown kinds", () => {
    expect(isAccessoryKind("crown")).toBe(false);
    expect(isAccessoryKind("")).toBe(false);
  });
});

describe("accessoryKey (S106)", () => {
  it("emits procedural mesh key per kind", () => {
    expect(accessoryKey("antennae")).toBe("procbomber-accessory-antennae");
    expect(accessoryKey("visor")).toBe("procbomber-accessory-visor");
    expect(accessoryKey("backpack")).toBe("procbomber-accessory-backpack");
    expect(accessoryKey("cap")).toBe("procbomber-accessory-cap");
    expect(accessoryKey("fins")).toBe("procbomber-accessory-fins");
  });
});

describe("accessory mesh generators (S106)", () => {
  it("each generator returns a BufferGeometry with position + color attributes", () => {
    for (const kind of ACCESSORY_KINDS) {
      const g = generateAccessory(kind, SKY);
      expect(g.getAttribute("position")).toBeDefined();
      expect(g.getAttribute("color")).toBeDefined();
      const count = g.getAttribute("position").count;
      expect(count).toBeGreaterThan(0);
      // Keep small — < 400 vertices each to stay within the budget noted
      // in S106 sprint notes (3 accessories × 4 bombers); cap is the
      // chunkiest at ~230 verts due to CapsuleGeometry.
      expect(count).toBeLessThan(400);
    }
  });

  it("antennae uses the accent palette channel", async () => {
    const { Color } = await import("three");
    const g = generateAntennaeAccessory(SKY);
    const color = g.getAttribute("color")!;
    const expected = new Color(SKY.accent);
    expect(color.getX(0)).toBeCloseTo(expected.r, 3);
  });

  it("backpack uses torsoTop body fill + accent strap", async () => {
    const { Color } = await import("three");
    const g = generateBackpackAccessory(SKY);
    const color = g.getAttribute("color")!;
    // Find at least one vertex matching torsoTop and at least one matching accent.
    const torsoTop = new Color(SKY.torsoTop);
    const accent = new Color(SKY.accent);
    let sawTorso = false;
    let sawAccent = false;
    for (let i = 0; i < color.count; i += 1) {
      const r = color.getX(i);
      const g_ = color.getY(i);
      const b = color.getZ(i);
      if (Math.abs(r - torsoTop.r) < 0.02 && Math.abs(g_ - torsoTop.g) < 0.02 && Math.abs(b - torsoTop.b) < 0.02) sawTorso = true;
      if (Math.abs(r - accent.r) < 0.02 && Math.abs(g_ - accent.g) < 0.02 && Math.abs(b - accent.b) < 0.02) sawAccent = true;
    }
    expect(sawTorso).toBe(true);
    expect(sawAccent).toBe(true);
  });

  it("visor + cap + fins return non-empty BufferGeometries", () => {
    for (const g of [generateVisorAccessory(SKY), generateCapAccessory(SKY), generateFinAccessory(SKY)]) {
      expect(g.getAttribute("position").count).toBeGreaterThan(0);
    }
  });
});
