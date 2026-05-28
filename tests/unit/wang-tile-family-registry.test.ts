// S169 ENGINE-WANG-AUTOTILE (GDP-2026-05-28-002) — family registry tests.

import { afterEach, describe, expect, it } from "vitest";

import {
  clearWangTileFamilies,
  getWangTileFamily,
  listWangTileFamilies,
  registerWangTileFamily,
  type WangTileFamily,
  type WangTileVariant
} from "../../engine/render/autotile/family-registry";

function buildVariants(prefix: string): WangTileVariant[] {
  const variants: WangTileVariant[] = [];
  for (let i = 0; i < 16; i += 1) {
    variants.push({ meshKey: `${prefix}:variant-${i}` });
  }
  return variants;
}

describe("WangTileFamily registry (S169)", () => {
  afterEach(() => {
    clearWangTileFamilies();
  });

  it("register + get round-trip a valid family", () => {
    const family: WangTileFamily = { name: "soft-block", variants: buildVariants("soft") };
    registerWangTileFamily(family);
    expect(getWangTileFamily("soft-block")).toEqual(family);
  });

  it("getWangTileFamily returns undefined for unknown names", () => {
    expect(getWangTileFamily("nope")).toBeUndefined();
  });

  it("listWangTileFamilies returns sorted registered names", () => {
    registerWangTileFamily({ name: "c-fam", variants: buildVariants("c") });
    registerWangTileFamily({ name: "a-fam", variants: buildVariants("a") });
    registerWangTileFamily({ name: "b-fam", variants: buildVariants("b") });
    expect(listWangTileFamilies()).toEqual(["a-fam", "b-fam", "c-fam"]);
  });

  it("duplicate name throws a helpful error", () => {
    registerWangTileFamily({ name: "dup", variants: buildVariants("d") });
    expect(() =>
      registerWangTileFamily({ name: "dup", variants: buildVariants("d2") })
    ).toThrow(/duplicate name "dup"/);
  });

  it("empty name throws fast", () => {
    expect(() =>
      registerWangTileFamily({ name: "", variants: buildVariants("e") })
    ).toThrow(/non-empty string/);
  });

  it("variants.length !== 16 rejected (15)", () => {
    const variants = buildVariants("short").slice(0, 15);
    expect(() =>
      registerWangTileFamily({ name: "short", variants })
    ).toThrow(/exactly 16 variants/);
  });

  it("variants.length !== 16 rejected (17)", () => {
    const variants = [...buildVariants("long"), { meshKey: "extra" }];
    expect(() =>
      registerWangTileFamily({ name: "long", variants })
    ).toThrow(/exactly 16 variants/);
  });

  it("missing meshKey rejected by schema validator", () => {
    const variants = buildVariants("bad");
    // @ts-expect-error — intentional invalid shape
    variants[3] = { rotationY: 0 };
    expect(() => registerWangTileFamily({ name: "bad-mesh", variants })).toThrow();
  });

  it("duplicate variant entries (same meshKey at multiple indices) are allowed", () => {
    const shared: WangTileVariant = { meshKey: "shared" };
    const variants: WangTileVariant[] = [];
    for (let i = 0; i < 16; i += 1) variants.push(shared);
    expect(() => registerWangTileFamily({ name: "shared-fam", variants })).not.toThrow();
    expect(getWangTileFamily("shared-fam")?.variants[7]).toEqual(shared);
  });

  it("clearWangTileFamilies wipes the registry", () => {
    registerWangTileFamily({ name: "x", variants: buildVariants("x") });
    expect(listWangTileFamilies()).toEqual(["x"]);
    clearWangTileFamilies();
    expect(listWangTileFamilies()).toEqual([]);
    expect(getWangTileFamily("x")).toBeUndefined();
  });

  it("accepts rotationY + mirrorX on variants", () => {
    const variants = buildVariants("rot");
    variants[0] = { meshKey: "rot:0", rotationY: Math.PI / 2, mirrorX: true };
    registerWangTileFamily({ name: "rot-fam", variants });
    const fam = getWangTileFamily("rot-fam");
    expect(fam?.variants[0]?.rotationY).toBeCloseTo(Math.PI / 2);
    expect(fam?.variants[0]?.mirrorX).toBe(true);
  });
});
