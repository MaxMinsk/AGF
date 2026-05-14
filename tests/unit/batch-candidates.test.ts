import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { analyzeBatchCandidates, formatBatchCandidates } from "../../engine/tools/doctor/batch-candidates";

function makeProject(entities: Array<{ id: string; components: Record<string, unknown> }>) {
  const dir = mkdtempSync(resolve(tmpdir(), "agf-batch-"));
  mkdirSync(resolve(dir, "scenes"));
  writeFileSync(
    resolve(dir, "scenes/start.scene.json"),
    JSON.stringify({ id: "start", entities })
  );
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true })
  };
}

describe("analyzeBatchCandidates (M17-doctor)", () => {
  it("collapses entities sharing mesh + material into one bucket", () => {
    const { dir, cleanup } = makeProject([
      { id: "a", components: { MeshRenderer: { mesh: "runtime/models/x.glb", material: "runtime/materials/x.material.json" } } },
      { id: "b", components: { MeshRenderer: { mesh: "runtime/models/x.glb", material: "runtime/materials/x.material.json" } } },
      { id: "c", components: { MeshRenderer: { mesh: "runtime/models/y.glb", material: "runtime/materials/y.material.json" } } }
    ]);
    try {
      const report = analyzeBatchCandidates(dir);
      expect(report.totalRenderable).toBe(3);
      expect(report.totalBuckets).toBe(2);
      expect(report.potentialDrawCallSavings).toBe(1);
      expect(report.buckets[0]?.entities.map((e) => e.entityId).sort()).toEqual(["a", "b"]);
    } finally {
      cleanup();
    }
  });

  it("isolates entities that differ on ShadowFlags", () => {
    const { dir, cleanup } = makeProject([
      { id: "a", components: { MeshRenderer: { mesh: "box" } } },
      { id: "b", components: { MeshRenderer: { mesh: "box" }, ShadowFlags: { cast: false } } }
    ]);
    try {
      const report = analyzeBatchCandidates(dir);
      expect(report.totalBuckets).toBe(2);
      expect(report.isolationNotes.length).toBe(2);
    } finally {
      cleanup();
    }
  });

  it("explains unique-mesh singletons", () => {
    const { dir, cleanup } = makeProject([
      { id: "solo", components: { MeshRenderer: { mesh: "runtime/models/unique.glb" } } },
      { id: "pair-a", components: { MeshRenderer: { mesh: "box" } } },
      { id: "pair-b", components: { MeshRenderer: { mesh: "box" } } }
    ]);
    try {
      const report = analyzeBatchCandidates(dir);
      const soloNote = report.isolationNotes.find((n) => n.entityId === "solo");
      expect(soloNote?.reason).toContain("unique mesh");
    } finally {
      cleanup();
    }
  });

  it("returns empty report when no MeshRenderer entities exist", () => {
    const { dir, cleanup } = makeProject([
      { id: "a", components: { Transform: { position: [0, 0, 0] } } }
    ]);
    try {
      const report = analyzeBatchCandidates(dir);
      expect(report.totalRenderable).toBe(0);
      expect(report.buckets).toHaveLength(0);
      expect(formatBatchCandidates(report)).toContain("no MeshRenderer");
    } finally {
      cleanup();
    }
  });
});
