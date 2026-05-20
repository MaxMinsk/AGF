// S097 AGF-PROBE-DIAGNOSTICS-SINCE — pure filter helper tests.

import { describe, expect, it } from "vitest";

import {
  filterDiagnosticsSince,
  type RuntimeDiagnostic
} from "../../engine/runtime/diagnostics/diagnostics-bus";

function diag(id: number, emittedAtSeconds: number): RuntimeDiagnostic {
  return {
    id,
    emittedAtSeconds,
    severity: "info",
    code: `D_${id}`,
    source: "test",
    message: `msg ${id}`
  };
}

describe("filterDiagnosticsSince (S097 AGF-PROBE-DIAGNOSTICS-SINCE)", () => {
  const all = [diag(1, 10), diag(2, 20), diag(3, 30), diag(4, 40)];

  it("threshold below all returns everything", () => {
    expect(filterDiagnosticsSince(all, 0).map((d) => d.id)).toEqual([1, 2, 3, 4]);
    expect(filterDiagnosticsSince(all, -Infinity).map((d) => d.id)).toEqual([1, 2, 3, 4]);
  });

  it("threshold above all returns []", () => {
    expect(filterDiagnosticsSince(all, 9999)).toEqual([]);
  });

  it("threshold mid-list returns the strict suffix (exclusive)", () => {
    // threshold 20 → emittedAtSeconds > 20 → ids 3 + 4
    expect(filterDiagnosticsSince(all, 20).map((d) => d.id)).toEqual([3, 4]);
  });

  it("threshold matching an entry's timestamp returns the strict suffix (boundary is exclusive)", () => {
    // threshold exactly 30 → keep only > 30 → id 4
    expect(filterDiagnosticsSince(all, 30).map((d) => d.id)).toEqual([4]);
  });

  it("empty input returns empty regardless of threshold", () => {
    expect(filterDiagnosticsSince([], 0)).toEqual([]);
    expect(filterDiagnosticsSince([], 9999)).toEqual([]);
  });

  it("NaN threshold returns all (defensive)", () => {
    expect(filterDiagnosticsSince(all, Number.NaN).map((d) => d.id)).toEqual([1, 2, 3, 4]);
  });

  it("+Infinity threshold returns all (defensive — not finite)", () => {
    expect(filterDiagnosticsSince(all, Number.POSITIVE_INFINITY).map((d) => d.id)).toEqual([1, 2, 3, 4]);
  });
});
