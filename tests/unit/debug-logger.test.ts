// S83 AGF-LOG-PER-SYSTEM-DEBUG tests for createDebugLogger.

import { describe, expect, it } from "vitest";

import { createDiagnosticsBus } from "../../engine/runtime/diagnostics/diagnostics-bus";
import { createDebugLogger, parseDebugSelector } from "../../engine/runtime/diagnostics/debug-logger";

describe("parseDebugSelector", () => {
  it("returns a never-match for unset / empty / '0' / 'false'", () => {
    for (const raw of [undefined, "", "  ", "0", "false", "FALSE"]) {
      const m = parseDebugSelector(raw);
      expect(m("grid-movement")).toBe(false);
      expect(m("batching")).toBe(false);
    }
  });
  it("'*' matches every source", () => {
    const m = parseDebugSelector("*");
    expect(m("grid-movement")).toBe(true);
    expect(m("anything")).toBe(true);
  });
  it("single name matches exactly", () => {
    const m = parseDebugSelector("grid-movement");
    expect(m("grid-movement")).toBe(true);
    expect(m("batching")).toBe(false);
  });
  it("comma-separated allowlist matches set membership", () => {
    const m = parseDebugSelector("grid-movement, batching ");
    expect(m("grid-movement")).toBe(true);
    expect(m("batching")).toBe(true);
    expect(m("renderer-pool")).toBe(false);
  });
});

describe("createDebugLogger (S83 AGF-LOG-PER-SYSTEM-DEBUG)", () => {
  it("is disabled and no-ops when the selector does not match", () => {
    const bus = createDiagnosticsBus();
    const log = createDebugLogger("grid-movement", { bus, selector: "batching" });
    expect(log.enabled).toBe(false);
    log.debug("AGF_GRIDMOVE_TICK", "tick", { moved: 1 });
    log.trace("AGF_GRIDMOVE_TRACE");
    expect(bus.snapshot()).toEqual([]);
  });

  it("is disabled when no bus is supplied even if the selector matches", () => {
    const log = createDebugLogger("grid-movement", { selector: "*" });
    expect(log.enabled).toBe(false);
    // No throw — both methods are bound to the no-op shape.
    log.debug("AGF_GRIDMOVE_TICK");
    log.trace("AGF_GRIDMOVE_TRACE");
  });

  it("emits a debug diagnostic when '*' selector + bus are wired", () => {
    const bus = createDiagnosticsBus();
    const log = createDebugLogger("grid-movement", { bus, selector: "*" });
    expect(log.enabled).toBe(true);
    log.debug("AGF_GRIDMOVE_TICK", "tick", { moved: 2 });
    const events = bus.snapshot();
    expect(events).toHaveLength(1);
    expect(events[0]?.severity).toBe("debug");
    expect(events[0]?.code).toBe("AGF_GRIDMOVE_TICK");
    expect(events[0]?.source).toBe("grid-movement");
    expect(events[0]?.message).toBe("tick");
    expect(events[0]?.details).toEqual({ moved: 2 });
  });

  it("emits trace through the same path with trace severity", () => {
    const bus = createDiagnosticsBus();
    const log = createDebugLogger("batching", { bus, selector: "batching" });
    log.trace("AGF_BATCHING_BUCKET_DUMP", undefined, { liveBuckets: 3 });
    const events = bus.snapshot();
    expect(events).toHaveLength(1);
    expect(events[0]?.severity).toBe("trace");
    expect(events[0]?.message).toBe("AGF_BATCHING_BUCKET_DUMP");
    expect(events[0]?.details).toEqual({ liveBuckets: 3 });
  });
});
