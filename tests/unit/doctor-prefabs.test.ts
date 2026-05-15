// S54 DOCTOR-prefab-section: engine doctor reports declared prefab count,
// total scene-instance count, top-3 used prefab ids, plus unused / missing
// prefab diagnostics.

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runDoctor, formatPrefabs } from "../../engine/tools/doctor/project-doctor";

let projectDir: string;

function writeProject(): void {
  writeFileSync(
    join(projectDir, "project.json"),
    JSON.stringify({
      agfFormatVersion: 1,
      id: "doctor-prefab",
      name: "Doctor prefab fixture",
      startScene: "scenes/start.scene.json",
      assetRoot: "assets",
      render: { mode: "webgl", background: "#000000" },
      profiles: ["static"]
    })
  );
}

function writeScene(body: object): void {
  writeFileSync(
    join(projectDir, "scenes", "start.scene.json"),
    JSON.stringify(body)
  );
}

function writePrefab(id: string): void {
  writeFileSync(
    join(projectDir, "prefabs", `${id}.prefab.json`),
    JSON.stringify({
      agfFormatVersion: 1,
      id,
      components: { Transform: { position: [0, 0, 0] } }
    })
  );
}

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), "agf-doctor-prefabs-"));
  mkdirSync(join(projectDir, "scenes"), { recursive: true });
  mkdirSync(join(projectDir, "assets"), { recursive: true });
  mkdirSync(join(projectDir, "prefabs"), { recursive: true });
  writeProject();
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe("doctor prefabs report (S54)", () => {
  it("reports an empty inventory when the project has no prefabs/ directory", () => {
    rmSync(join(projectDir, "prefabs"), { recursive: true });
    writeScene({ id: "start", entities: [] });

    const report = runDoctor(projectDir);
    expect(report.prefabs.declared).toEqual([]);
    expect(report.prefabs.totalInstances).toBe(0);
    expect(formatPrefabs(report.prefabs)).toContain("0 declared, 0 scene instance(s)");
  });

  it("counts declared prefabs + scene instances and surfaces the top-3 used ids", () => {
    writePrefab("alpha");
    writePrefab("beta");
    writePrefab("gamma");
    writeScene({
      id: "start",
      entities: [],
      instances: [
        { id: "a1", prefab: "alpha" },
        { id: "a2", prefab: "alpha" },
        { id: "a3", prefab: "alpha" },
        { id: "b1", prefab: "beta" },
        { id: "b2", prefab: "beta" },
        { id: "g1", prefab: "gamma" }
      ]
    });

    const report = runDoctor(projectDir);
    expect(report.prefabs.declared).toEqual(["alpha", "beta", "gamma"]);
    expect(report.prefabs.totalInstances).toBe(6);
    expect(report.prefabs.topUsage).toEqual([
      { prefab: "alpha", instanceCount: 3 },
      { prefab: "beta", instanceCount: 2 },
      { prefab: "gamma", instanceCount: 1 }
    ]);
    expect(report.prefabs.unusedPrefabs).toEqual([]);
    expect(report.prefabs.missingPrefabRefs).toEqual([]);
  });

  it("flags unused declared prefabs + instance refs that miss the registry", () => {
    writePrefab("alpha");
    writePrefab("dead-code");
    writeScene({
      id: "start",
      entities: [],
      instances: [
        { id: "a1", prefab: "alpha" },
        { id: "ghost", prefab: "does-not-exist" }
      ]
    });

    const report = runDoctor(projectDir);
    expect(report.prefabs.unusedPrefabs).toEqual(["dead-code"]);
    expect(report.prefabs.missingPrefabRefs).toEqual(["does-not-exist"]);

    const recos = report.recommendations.join("\n");
    expect(recos).toContain("dead-code");
    expect(recos).toContain("does-not-exist");
  });
});
