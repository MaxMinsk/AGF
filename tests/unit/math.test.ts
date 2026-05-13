import { describe, expect, it } from "vitest";
import { clamp } from "../../engine/core/math";

describe("clamp", () => {
  it("keeps values inside the inclusive range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-4, 0, 10)).toBe(0);
    expect(clamp(24, 0, 10)).toBe(10);
  });

  it("rejects invalid ranges", () => {
    expect(() => clamp(1, 10, 0)).toThrow("Invalid clamp range");
  });
});

