// S096 AGF-PROBE-COMPONENT-AT — pure path parser tests.

import { describe, expect, it } from "vitest";

import { parseComponentPath } from "../../engine/dev/agf-dev-bridge";

describe("parseComponentPath (S096 AGF-PROBE-COMPONENT-AT)", () => {
  it("parses /component/<entityId>/<componentName> into the segments", () => {
    const result = parseComponentPath("/component/player.1/BomberStats");
    expect(result).toEqual({
      kind: "ok",
      entityId: "player.1",
      componentName: "BomberStats"
    });
  });

  it("decodes URL-encoded segments", () => {
    const result = parseComponentPath("/component/foo%2Ebar/SomeComponent");
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.entityId).toBe("foo.bar");
      expect(result.componentName).toBe("SomeComponent");
    }
  });

  it("rejects routes that don't start with /component/", () => {
    expect(parseComponentPath("/other/a/b").kind).toBe("error");
    expect(parseComponentPath("/snapshot").kind).toBe("error");
  });

  it("rejects empty entityId", () => {
    expect(parseComponentPath("/component//BomberStats").kind).toBe("error");
  });

  it("rejects empty componentName", () => {
    expect(parseComponentPath("/component/player.1/").kind).toBe("error");
  });

  it("rejects extra path segments (e.g. /component/a/b/c)", () => {
    const r = parseComponentPath("/component/player.1/Bomber/Stats");
    expect(r.kind).toBe("error");
  });

  it("rejects routes missing the second slash entirely", () => {
    expect(parseComponentPath("/component/player.1").kind).toBe("error");
  });
});
