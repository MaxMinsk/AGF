// S098 AGF-PROBE-ENTITY-CREATE — pure body validator tests.

import { describe, expect, it } from "vitest";

import { validateEntityCreateBody } from "../../engine/dev/agf-dev-bridge";

describe("validateEntityCreateBody (S098 AGF-PROBE-ENTITY-CREATE)", () => {
  it("accepts the canonical { entityId, components } shape", () => {
    const result = validateEntityCreateBody({ entityId: "qa.1", components: { Foo: { x: 1 } } });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.entityId).toBe("qa.1");
      expect(result.components).toEqual({ Foo: { x: 1 } });
    }
  });

  it("accepts an empty components object (entity with no components)", () => {
    const result = validateEntityCreateBody({ entityId: "empty.1", components: {} });
    expect(result.kind).toBe("ok");
  });

  it("rejects a non-object body (null, string, number)", () => {
    expect(validateEntityCreateBody(null).kind).toBe("error");
    expect(validateEntityCreateBody("nope").kind).toBe("error");
    expect(validateEntityCreateBody(42).kind).toBe("error");
    expect(validateEntityCreateBody(undefined).kind).toBe("error");
  });

  it("rejects a missing entityId", () => {
    const r = validateEntityCreateBody({ components: {} });
    expect(r.kind).toBe("error");
    if (r.kind === "error") {
      expect(r.message).toContain("entityId");
    }
  });

  it("rejects an empty-string entityId", () => {
    expect(validateEntityCreateBody({ entityId: "", components: {} }).kind).toBe("error");
  });

  it("rejects a non-string entityId", () => {
    expect(validateEntityCreateBody({ entityId: 42, components: {} }).kind).toBe("error");
  });

  it("rejects missing or non-object components", () => {
    expect(validateEntityCreateBody({ entityId: "a" }).kind).toBe("error");
    expect(validateEntityCreateBody({ entityId: "a", components: null }).kind).toBe("error");
    expect(validateEntityCreateBody({ entityId: "a", components: "not-object" }).kind).toBe("error");
  });

  it("rejects array-as-components (must be a plain object map)", () => {
    expect(validateEntityCreateBody({ entityId: "a", components: [] }).kind).toBe("error");
    expect(validateEntityCreateBody({ entityId: "a", components: [1, 2, 3] }).kind).toBe("error");
  });
});
