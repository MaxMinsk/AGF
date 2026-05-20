// S095 AGF-RENDER-DEBUG-FREECAM — POST body validator unit tests.

import { describe, expect, it } from "vitest";

import { validateFreeCamBody } from "../../engine/dev/agf-dev-bridge";

describe("validateFreeCamBody (S095 AGF-RENDER-DEBUG-FREECAM)", () => {
  it("accepts { off: true } and reports kind='off'", () => {
    const result = validateFreeCamBody({ off: true });
    expect(result).toEqual({ kind: "off" });
  });

  it("accepts a full pose payload and reports kind='set' with normalised tuples", () => {
    const result = validateFreeCamBody({ position: [10, 8, 10], lookAt: [0, 0, 0] });
    expect(result).toEqual({ kind: "set", position: [10, 8, 10], lookAt: [0, 0, 0] });
  });

  it("rejects a missing position", () => {
    const result = validateFreeCamBody({ lookAt: [0, 0, 0] });
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.code).toBe("AGF_BRIDGE_INVALID_FREECAM");
    }
  });

  it("rejects a missing lookAt", () => {
    const result = validateFreeCamBody({ position: [10, 8, 10] });
    expect(result.kind).toBe("error");
  });

  it("rejects position arrays of the wrong length", () => {
    expect(validateFreeCamBody({ position: [1, 2], lookAt: [0, 0, 0] }).kind).toBe("error");
    expect(validateFreeCamBody({ position: [1, 2, 3, 4], lookAt: [0, 0, 0] }).kind).toBe("error");
  });

  it("rejects non-finite components (NaN, Infinity)", () => {
    expect(
      validateFreeCamBody({ position: [Number.NaN, 0, 0], lookAt: [0, 0, 0] }).kind
    ).toBe("error");
    expect(
      validateFreeCamBody({ position: [0, 0, 0], lookAt: [Number.POSITIVE_INFINITY, 0, 0] }).kind
    ).toBe("error");
  });

  it("rejects non-number components (strings, nulls)", () => {
    expect(
      validateFreeCamBody({ position: ["10", 0, 0], lookAt: [0, 0, 0] }).kind
    ).toBe("error");
  });

  it("rejects null / non-object bodies", () => {
    expect(validateFreeCamBody(null).kind).toBe("error");
    expect(validateFreeCamBody(undefined).kind).toBe("error");
    expect(validateFreeCamBody("nope").kind).toBe("error");
    expect(validateFreeCamBody(42).kind).toBe("error");
  });

  it("off=true wins even if a malformed pose is also supplied", () => {
    const result = validateFreeCamBody({ off: true, position: "bad", lookAt: [0, 0] });
    expect(result.kind).toBe("off");
  });
});
