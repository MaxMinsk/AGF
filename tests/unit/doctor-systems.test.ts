// S89 AGF-DOCTOR-SYSTEMS-SECTION.

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { formatSystems, runDoctor } from "../../engine/tools/doctor/project-doctor";

const PROJECT_DIR = "examples/hello-3d";

function writeDiag(events: ReadonlyArray<unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "doctor-systems-"));
  const path = join(dir, "diag.json");
  writeFileSync(path, JSON.stringify({ snapshot: events }));
  return path;
}

describe("DoctorReport.systems (S89 AGF-DOCTOR-SYSTEMS-SECTION)", () => {
  it("is null when --diagnostics-from is not supplied", () => {
    const report = runDoctor(PROJECT_DIR);
    expect(report.systems).toBeNull();
  });

  it("is null when no scheduler lifecycle traces are present in the snapshot", () => {
    const path = writeDiag([
      { code: "AGF_FRAME_SPIKE", severity: "warning", details: { totalMs: 80 } }
    ]);
    const report = runDoctor(PROJECT_DIR, undefined, { diagnosticsFrom: path });
    expect(report.systems).toBeNull();
    rmSync(path, { force: true });
  });

  it("reconstructs the system list from REGISTERED traces", () => {
    const path = writeDiag([
      { code: "AGF_SCHEDULER_SYSTEM_REGISTERED", details: { name: "input" } },
      { code: "AGF_SCHEDULER_SYSTEM_REGISTERED", details: { name: "physics" } },
      { code: "AGF_SCHEDULER_SYSTEM_REGISTERED", details: { name: "render.particle-emitter" } }
    ]);
    const report = runDoctor(PROJECT_DIR, undefined, { diagnosticsFrom: path });
    expect(report.systems).not.toBeNull();
    expect(report.systems!.count).toBe(3);
    expect(report.systems!.names).toEqual(["input", "physics", "render.particle-emitter"]);
    rmSync(path, { force: true });
  });

  it("honors DEREGISTERED traces — removes the matching name", () => {
    const path = writeDiag([
      { code: "AGF_SCHEDULER_SYSTEM_REGISTERED", details: { name: "input" } },
      { code: "AGF_SCHEDULER_SYSTEM_REGISTERED", details: { name: "physics" } },
      { code: "AGF_SCHEDULER_SYSTEM_DEREGISTERED", details: { name: "physics" } }
    ]);
    const report = runDoctor(PROJECT_DIR, undefined, { diagnosticsFrom: path });
    expect(report.systems!.count).toBe(1);
    expect(report.systems!.names).toEqual(["input"]);
    rmSync(path, { force: true });
  });

  it("dedupes repeated REGISTERED events (HMR re-register pattern)", () => {
    const path = writeDiag([
      { code: "AGF_SCHEDULER_SYSTEM_REGISTERED", details: { name: "input" } },
      { code: "AGF_SCHEDULER_SYSTEM_REGISTERED", details: { name: "input" } }
    ]);
    const report = runDoctor(PROJECT_DIR, undefined, { diagnosticsFrom: path });
    expect(report.systems!.count).toBe(1);
    rmSync(path, { force: true });
  });

  it("formatSystems prints the header + names", () => {
    const out = formatSystems({ count: 2, names: ["a", "b"] });
    expect(out).toContain("Systems (2):");
    expect(out).toContain("a");
    expect(out).toContain("b");
  });

  it("formatSystems handles an empty system list with the explanatory line", () => {
    const out = formatSystems({ count: 0, names: [] });
    expect(out).toContain("(no AGF_SCHEDULER_SYSTEM_REGISTERED traces");
  });
});
