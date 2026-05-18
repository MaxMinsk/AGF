// S84 AGF-DOCTOR-RENDERER-INSPECT-SECTION.

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { runDoctor } from "../../engine/tools/doctor/project-doctor";

const PROJECT_DIR = "examples/hello-3d";

describe("DoctorReport.rendererInspect (S84 AGF-DOCTOR-RENDERER-INSPECT-SECTION)", () => {
  it("is null when --renderer-inspect-from is not supplied", () => {
    const report = runDoctor(PROJECT_DIR);
    expect(report.rendererInspect).toBeNull();
  });

  it("populates info + handles.sample from a raw inspect() payload", () => {
    const dir = mkdtempSync(join(tmpdir(), "doctor-inspect-"));
    const path = join(dir, "inspect.json");
    writeFileSync(
      path,
      JSON.stringify({
        info: { meshes: 4, lights: 2, buckets: 1, handleLeak: 0, renderer: "webgl" },
        handles: { count: 3, entityIds: ["player.1", "bot.1", "light.sun"] }
      })
    );
    const report = runDoctor(PROJECT_DIR, undefined, { rendererInspectFrom: path });
    expect(report.rendererInspect).not.toBeNull();
    expect(report.rendererInspect!.info["meshes"]).toBe(4);
    expect(report.rendererInspect!.handles.count).toBe(3);
    expect(report.rendererInspect!.handles.sample).toEqual(["player.1", "bot.1", "light.sun"]);
    expect(report.rendererInspect!.handleLeak).toBe(0);
    rmSync(dir, { recursive: true });
  });

  it("unwraps the dev-bridge envelope { ok, payload: { … } }", () => {
    const dir = mkdtempSync(join(tmpdir(), "doctor-inspect-"));
    const path = join(dir, "inspect.json");
    writeFileSync(
      path,
      JSON.stringify({
        ok: true,
        payload: {
          info: { meshes: 1, handleLeak: 7 },
          handles: { count: 8, entityIds: ["leaked.1", "leaked.2", "leaked.3", "leaked.4", "leaked.5", "leaked.6", "leaked.7", "leaked.8", "alive.1"] }
        }
      })
    );
    const report = runDoctor(PROJECT_DIR, undefined, { rendererInspectFrom: path });
    expect(report.rendererInspect!.handleLeak).toBe(7);
    // sample is capped at 8 ids.
    expect(report.rendererInspect!.handles.sample).toHaveLength(8);
    rmSync(dir, { recursive: true });
  });

  it("returns null when the path doesn't exist or the JSON is malformed", () => {
    const report1 = runDoctor(PROJECT_DIR, undefined, { rendererInspectFrom: "/nope/missing.json" });
    expect(report1.rendererInspect).toBeNull();
    const dir = mkdtempSync(join(tmpdir(), "doctor-inspect-"));
    const path = join(dir, "bad.json");
    writeFileSync(path, "not json {{");
    const report2 = runDoctor(PROJECT_DIR, undefined, { rendererInspectFrom: path });
    expect(report2.rendererInspect).toBeNull();
    rmSync(dir, { recursive: true });
  });

  it("S85 AGF-DOCTOR-RECOMMENDATION-HANDLE-LEAK: surfaces a recommendation when handleLeak > 0", () => {
    const dir = mkdtempSync(join(tmpdir(), "doctor-inspect-"));
    const path = join(dir, "inspect.json");
    writeFileSync(
      path,
      JSON.stringify({
        info: { meshes: 4, handleLeak: 4 },
        handles: { count: 8, entityIds: ["leaked.1", "leaked.2", "leaked.3", "leaked.4", "live.a"] }
      })
    );
    const report = runDoctor(PROJECT_DIR, undefined, { rendererInspectFrom: path });
    const leakRec = report.recommendations.find((r) => r.startsWith("Renderer handle leak detected"));
    expect(leakRec).toBeDefined();
    expect(leakRec!).toContain("handleLeak=4");
    expect(leakRec!).toContain("leaked.1");
    rmSync(dir, { recursive: true });
  });

  it("S85 AGF-DOCTOR-RECOMMENDATION-HANDLE-LEAK: stays quiet when handleLeak = 0", () => {
    const dir = mkdtempSync(join(tmpdir(), "doctor-inspect-"));
    const path = join(dir, "inspect.json");
    writeFileSync(path, JSON.stringify({ info: { handleLeak: 0 }, handles: { count: 0, entityIds: [] } }));
    const report = runDoctor(PROJECT_DIR, undefined, { rendererInspectFrom: path });
    const leakRec = report.recommendations.find((r) => r.startsWith("Renderer handle leak detected"));
    expect(leakRec).toBeUndefined();
    rmSync(dir, { recursive: true });
  });
});
