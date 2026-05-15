// S51-doctor: the doctor reports `render.batching.auto` state from project.json
// alongside per-class (primitive / external) entity counts. Agents use this to
// decide whether to flip auto-batch on or chase per-entity Batchable annotations.

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runDoctor, formatBatching } from "../../engine/tools/doctor/project-doctor";

let projectDir: string;

function writeProject(body: object): void {
  writeFileSync(join(projectDir, "project.json"), JSON.stringify(body));
}

function writeScene(entities: Array<Record<string, unknown>>): void {
  writeFileSync(
    join(projectDir, "scenes", "start.scene.json"),
    JSON.stringify({ agfFormatVersion: 1, id: "start", entities })
  );
}

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), "agf-doctor-batching-"));
  mkdirSync(join(projectDir, "scenes"), { recursive: true });
  mkdirSync(join(projectDir, "assets"), { recursive: true });
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe("doctor batching report (S51)", () => {
  it("reports autoBatch=false and a 'flip the switch' recommendation when primitives could batch", () => {
    writeProject({
      agfFormatVersion: 1,
      id: "fake",
      name: "Fake",
      startScene: "scenes/start.scene.json",
      assetRoot: "assets",
      render: { mode: "webgl" },
      profiles: ["static"]
    });
    writeScene([
      { id: "a", components: { MeshRenderer: { mesh: "box", color: "#ff0000" } } },
      { id: "b", components: { MeshRenderer: { mesh: "box", color: "#00ff00" } } },
      { id: "c", components: { MeshRenderer: { mesh: "box", color: "#0000ff" } } }
    ]);

    const report = runDoctor(projectDir);
    expect(report.batching.autoBatch).toBe(false);
    expect(report.batching.primitiveCount).toBe(3);
    expect(report.batching.primitiveBucketCount).toBe(1);
    expect(report.batching.externalCount).toBe(0);
    expect(
      report.recommendations.some((r) => r.includes("Auto-batch is off"))
    ).toBe(true);
  });

  it("reports autoBatch=true and 'X draw calls saved' when auto is enabled", () => {
    writeProject({
      agfFormatVersion: 1,
      id: "fake",
      name: "Fake",
      startScene: "scenes/start.scene.json",
      assetRoot: "assets",
      render: { mode: "webgl", batching: { auto: true } },
      profiles: ["static"]
    });
    writeScene([
      { id: "a", components: { MeshRenderer: { mesh: "box" } } },
      { id: "b", components: { MeshRenderer: { mesh: "box" } } }
    ]);

    const report = runDoctor(projectDir);
    expect(report.batching.autoBatch).toBe(true);
    expect(report.batching.primitiveCount).toBe(2);
    expect(report.batching.primitiveBucketCount).toBe(1);
    expect(formatBatching(report.batching)).toContain("auto=ON");
    expect(formatBatching(report.batching)).toContain("1 draw call(s) saved");
    expect(
      report.recommendations.some((r) => r.includes("Auto-batch is off"))
    ).toBe(false);
  });

  it("counts external (.glb) entities separately from primitives", () => {
    writeProject({
      agfFormatVersion: 1,
      id: "fake",
      name: "Fake",
      startScene: "scenes/start.scene.json",
      assetRoot: "assets",
      render: { mode: "webgl", batching: { auto: true } },
      profiles: ["static"]
    });
    writeScene([
      { id: "ground", components: { MeshRenderer: { mesh: "box" } } },
      { id: "beacon.a", components: { MeshRenderer: { mesh: "runtime/models/beacon.glb" } } },
      { id: "beacon.b", components: { MeshRenderer: { mesh: "runtime/models/beacon.glb" } } }
    ]);

    const report = runDoctor(projectDir);
    expect(report.batching.primitiveCount).toBe(1);
    expect(report.batching.externalCount).toBe(2);
    expect(report.batching.externalBucketCount).toBe(1);
    expect(formatBatching(report.batching)).toContain("external meshes: 2 entities");
  });

  it("counts explicit Batchable / opted-out entities from scene JSON", () => {
    writeProject({
      agfFormatVersion: 1,
      id: "fake",
      name: "Fake",
      startScene: "scenes/start.scene.json",
      assetRoot: "assets",
      render: { mode: "webgl", batching: { auto: true } },
      profiles: ["static"]
    });
    writeScene([
      {
        id: "a",
        components: { MeshRenderer: { mesh: "box" }, Batchable: { group: "rocks" } }
      },
      {
        id: "b",
        components: { MeshRenderer: { mesh: "box" }, Batchable: { enabled: false } }
      }
    ]);

    const report = runDoctor(projectDir);
    expect(report.batching.explicitBatchableCount).toBe(1);
    expect(report.batching.optedOutCount).toBe(1);
  });
});
