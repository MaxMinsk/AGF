import { describe, expect, it } from "vitest";
import { DRONE_MATERIAL_PALETTE, pickDroneMaterialFor } from "../../src/drone-palette";

describe("pickDroneMaterialFor", () => {
  it("returns a palette entry for any non-empty playerId", () => {
    const result = pickDroneMaterialFor("alpha");
    expect(result).toBeDefined();
    expect(DRONE_MATERIAL_PALETTE).toContain(result);
  });

  it("is stable for the same playerId", () => {
    expect(pickDroneMaterialFor("alpha")).toBe(pickDroneMaterialFor("alpha"));
    expect(pickDroneMaterialFor("bravo")).toBe(pickDroneMaterialFor("bravo"));
  });

  it("returns undefined for an empty playerId", () => {
    expect(pickDroneMaterialFor("")).toBeUndefined();
  });

  it("returns undefined when the palette is empty", () => {
    expect(pickDroneMaterialFor("alpha", [])).toBeUndefined();
  });

  it("uses the provided palette when supplied", () => {
    const palette = ["a", "b", "c"];
    const result = pickDroneMaterialFor("alpha", palette);
    expect(palette).toContain(result);
  });
});
