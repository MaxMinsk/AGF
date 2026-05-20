// S097 AGF-PROBE-ENTITY-DUMP + AGF-PROBE-COMPONENT-WRITE — path
// parser + smoke tests on the runtime helpers.

import { describe, expect, it } from "vitest";

import { parseEntityPath } from "../../engine/dev/agf-dev-bridge";

describe("parseEntityPath (S097 AGF-PROBE-ENTITY-DUMP)", () => {
  it("parses /entity/<entityId> cleanly", () => {
    const result = parseEntityPath("/entity/player.1");
    expect(result).toEqual({ kind: "ok", entityId: "player.1" });
  });

  it("decodes URL-encoded entityIds", () => {
    const result = parseEntityPath("/entity/foo%2Ebar");
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.entityId).toBe("foo.bar");
    }
  });

  it("rejects routes that don't start with /entity/", () => {
    expect(parseEntityPath("/other/x").kind).toBe("error");
    expect(parseEntityPath("/snapshot").kind).toBe("error");
  });

  it("rejects empty entityId", () => {
    expect(parseEntityPath("/entity/").kind).toBe("error");
  });

  it("rejects routes with extra path segments", () => {
    expect(parseEntityPath("/entity/a/b").kind).toBe("error");
    expect(parseEntityPath("/entity/player.1/BomberStats").kind).toBe("error");
  });
});
