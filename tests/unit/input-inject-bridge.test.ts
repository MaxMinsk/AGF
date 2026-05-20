// S098 AGF-PROBE-INPUT-INJECT — pure body validator tests.

import { describe, expect, it } from "vitest";

import { validateInputInjectBody } from "../../engine/dev/agf-dev-bridge";

describe("validateInputInjectBody (S098 AGF-PROBE-INPUT-INJECT)", () => {
  it("accepts the canonical { entityId, action } shape", () => {
    const r = validateInputInjectBody({ entityId: "player.1", action: "place-bomb" });
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.entityId).toBe("player.1");
      expect(r.action).toBe("place-bomb");
      expect(r.value).toBeUndefined();
    }
  });

  it("carries through an optional value", () => {
    const r = validateInputInjectBody({ entityId: "player.1", action: "move-to", value: { gx: 5, gz: 3 } });
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.value).toEqual({ gx: 5, gz: 3 });
    }
  });

  it("rejects non-object body (null, string, number, undefined)", () => {
    expect(validateInputInjectBody(null).kind).toBe("error");
    expect(validateInputInjectBody("nope").kind).toBe("error");
    expect(validateInputInjectBody(42).kind).toBe("error");
    expect(validateInputInjectBody(undefined).kind).toBe("error");
  });

  it("rejects missing or empty entityId", () => {
    expect(validateInputInjectBody({ action: "place-bomb" }).kind).toBe("error");
    expect(validateInputInjectBody({ entityId: "", action: "place-bomb" }).kind).toBe("error");
    expect(validateInputInjectBody({ entityId: 42, action: "place-bomb" }).kind).toBe("error");
  });

  it("rejects missing or empty action", () => {
    expect(validateInputInjectBody({ entityId: "player.1" }).kind).toBe("error");
    expect(validateInputInjectBody({ entityId: "player.1", action: "" }).kind).toBe("error");
    expect(validateInputInjectBody({ entityId: "player.1", action: 42 }).kind).toBe("error");
  });

  it("accepts arbitrary action names (engine stays project-agnostic)", () => {
    expect(validateInputInjectBody({ entityId: "x", action: "place-bomb" }).kind).toBe("ok");
    expect(validateInputInjectBody({ entityId: "x", action: "harvest-resource" }).kind).toBe("ok");
    expect(validateInputInjectBody({ entityId: "x", action: "any-string-works" }).kind).toBe("ok");
  });
});
