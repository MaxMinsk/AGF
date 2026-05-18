// S83 AGF-LOG-DOCTOR-DIAGNOSTICS.

import { describe, expect, it } from "vitest";

import { createDiagnosticsBus, summarizeDiagnostics } from "../../engine/runtime/diagnostics/diagnostics-bus";

describe("summarizeDiagnostics (S83 AGF-LOG-DOCTOR-DIAGNOSTICS)", () => {
  it("returns zeros for an empty buffer", () => {
    const s = summarizeDiagnostics([]);
    expect(s.total).toBe(0);
    expect(s.bySeverity).toEqual({ info: 0, warning: 0, error: 0, debug: 0, trace: 0 });
    expect(s.topCodes).toEqual([]);
  });

  it("counts events by severity and ranks codes", () => {
    const bus = createDiagnosticsBus();
    bus.emit({ severity: "info", code: "AGF_X", source: "t", message: "1" });
    bus.emit({ severity: "info", code: "AGF_X", source: "t", message: "2" });
    bus.emit({ severity: "warning", code: "AGF_Y", source: "t", message: "3" });
    bus.emit({ severity: "error", code: "AGF_Z", source: "t", message: "4" });
    const s = summarizeDiagnostics(bus.snapshot());
    expect(s.total).toBe(4);
    expect(s.bySeverity.info).toBe(2);
    expect(s.bySeverity.warning).toBe(1);
    expect(s.bySeverity.error).toBe(1);
    expect(s.topCodes[0]).toEqual({ code: "AGF_X", count: 2 });
    // Y and Z tie on count(1); alphabetical fallback.
    expect(s.topCodes.slice(1).map((c) => c.code)).toEqual(["AGF_Y", "AGF_Z"]);
  });

  it("honors topCodes cap", () => {
    const events = ["A", "B", "C", "D", "E"].map((code) => ({
      id: 0,
      emittedAtSeconds: 0,
      severity: "info" as const,
      code,
      source: "t",
      message: code
    }));
    const s = summarizeDiagnostics(events, { topCodes: 3 });
    expect(s.topCodes.map((c) => c.code)).toEqual(["A", "B", "C"]);
  });
});
