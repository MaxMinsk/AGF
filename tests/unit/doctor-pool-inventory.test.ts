// S88 AGF-POOL-DOCTOR-SECTION.

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { formatPoolInventory, runDoctor } from "../../engine/tools/doctor/project-doctor";

const PROJECT_DIR = "examples/hello-3d";

describe("DoctorReport.pools (S88 AGF-POOL-DOCTOR-SECTION)", () => {
  it("is null when --pool-inventory-from is not supplied", () => {
    const report = runDoctor(PROJECT_DIR);
    expect(report.pools).toBeNull();
  });

  it("parses a raw array payload", () => {
    const dir = mkdtempSync(join(tmpdir(), "doctor-pool-"));
    const path = join(dir, "pools.json");
    writeFileSync(
      path,
      JSON.stringify([
        { name: "instanced", live: 2, peak: 3 },
        { name: "batched", live: 0, peak: 0 },
        { name: "particle", live: 1, peak: 2 }
      ])
    );
    const report = runDoctor(PROJECT_DIR, undefined, { poolInventoryFrom: path });
    expect(report.pools).not.toBeNull();
    expect(report.pools!.pools).toHaveLength(3);
    expect(report.pools!.pools[0]!.name).toBe("instanced");
    expect(report.pools!.unused).toEqual(["batched"]);
    rmSync(dir, { recursive: true });
  });

  it("unwraps the dev-bridge envelope { payload: { pools: [...] } }", () => {
    const dir = mkdtempSync(join(tmpdir(), "doctor-pool-"));
    const path = join(dir, "pools.json");
    writeFileSync(
      path,
      JSON.stringify({
        ok: true,
        payload: {
          pools: [{ name: "particle", live: 0, peak: 1 }]
        }
      })
    );
    const report = runDoctor(PROJECT_DIR, undefined, { poolInventoryFrom: path });
    expect(report.pools!.pools[0]!.peak).toBe(1);
    expect(report.pools!.unused).toEqual([]);
    rmSync(dir, { recursive: true });
  });

  it("returns null on missing path / malformed JSON", () => {
    expect(runDoctor(PROJECT_DIR, undefined, { poolInventoryFrom: "/nope" }).pools).toBeNull();
    const dir = mkdtempSync(join(tmpdir(), "doctor-pool-"));
    const path = join(dir, "bad.json");
    writeFileSync(path, "{ not json");
    expect(runDoctor(PROJECT_DIR, undefined, { poolInventoryFrom: path }).pools).toBeNull();
    rmSync(dir, { recursive: true });
  });

  it("formatPoolInventory flags unused pools and reports live/peak", () => {
    const out = formatPoolInventory({
      pools: [
        { name: "instanced", live: 1, peak: 1 },
        { name: "particle", live: 0, peak: 0 }
      ],
      unused: ["particle"]
    });
    expect(out).toContain("Pools:");
    expect(out).toContain("instanced");
    expect(out).toContain("never used");
    expect(out).toContain("Unused pools (peak=0): particle");
  });

  it("recommends dropping unused pre-warm presets when peak=0", () => {
    const dir = mkdtempSync(join(tmpdir(), "doctor-pool-"));
    const path = join(dir, "pools.json");
    writeFileSync(
      path,
      JSON.stringify([{ name: "particle", live: 0, peak: 0 }])
    );
    const report = runDoctor(PROJECT_DIR, undefined, { poolInventoryFrom: path });
    expect(report.recommendations.some((r) => r.includes("peak=0"))).toBe(true);
    rmSync(dir, { recursive: true });
  });
});
