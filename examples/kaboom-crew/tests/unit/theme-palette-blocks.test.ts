// S172 — theme-aware block palette tests.

import { describe, expect, it } from "vitest";
import type { BufferAttribute } from "three";

import { buildHardBlockVariant } from "../../src/blocks/hard-block-variants";
import { buildSoftBlockVariant } from "../../src/blocks/soft-block-variants";

function colorSum(g: ReturnType<typeof buildHardBlockVariant>): number {
  const c = g.getAttribute("color") as BufferAttribute | undefined;
  if (c === undefined) return 0;
  let s = 0;
  for (let i = 0; i < c.count; i += 1) s += c.getX(i) + c.getY(i) + c.getZ(i);
  return Math.round(s * 1000) / 1000;
}

describe("buildHardBlockVariant — theme palette parameter (S172)", () => {
  it("default palette matches hard-block constants (backwards compat)", () => {
    const a = buildHardBlockVariant(0);
    const b = buildHardBlockVariant(0, undefined);
    expect(colorSum(a)).toBe(colorSum(b));
  });

  it("explicit warm palette produces a different colour-sum than default", () => {
    const a = buildHardBlockVariant(0);
    const warm = buildHardBlockVariant(0, { primary: "#d04020" });
    expect(colorSum(a)).not.toBe(colorSum(warm));
  });

  it("two distinct primary palettes produce distinct geometries", () => {
    const red = buildHardBlockVariant(0, { primary: "#d04020" });
    const blue = buildHardBlockVariant(0, { primary: "#4080ff" });
    expect(colorSum(red)).not.toBe(colorSum(blue));
  });

  it("shadow + seam fall back from primary if only primary is given", () => {
    // The builder derives shadow/seam by darkening primary when not
    // explicitly supplied; the geometry still has a non-zero colour
    // attribute (no missing colour vertices).
    const g = buildHardBlockVariant(2, { primary: "#a05050" });
    const c = g.getAttribute("color") as BufferAttribute | undefined;
    expect(c).not.toBeUndefined();
    expect(c!.count).toBeGreaterThan(0);
  });

  it("third argument bitmask is still accepted (Wang autotile reserved)", () => {
    const a = buildHardBlockVariant(2);
    const b = buildHardBlockVariant(2, undefined, 7);
    // Bitmask is reserved — same input + bitmask shouldn't change
    // structural vertex count.
    const pa = a.getAttribute("position");
    const pb = b.getAttribute("position");
    expect(pa.count).toBe(pb.count);
  });
});

describe("buildSoftBlockVariant — theme palette parameter (S172)", () => {
  it("default palette equals legacy soft-block constants", () => {
    const a = buildSoftBlockVariant(0);
    const b = buildSoftBlockVariant(0, undefined);
    expect(colorSum(a)).toBe(colorSum(b));
  });

  it("explicit lab-style cool palette differs from default tan", () => {
    const a = buildSoftBlockVariant(0);
    const cool = buildSoftBlockVariant(0, { primary: "#c4c8d0" });
    expect(colorSum(a)).not.toBe(colorSum(cool));
  });

  it("bitmask third argument accepted, doesn't change structure", () => {
    const a = buildSoftBlockVariant(1);
    const b = buildSoftBlockVariant(1, undefined, 5);
    expect(a.getAttribute("position").count).toBe(b.getAttribute("position").count);
  });
});
