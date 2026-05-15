// S54 ASSET-lod-metadata — covers the new diagnostic codes the
// project-check pass emits for LOD chains: out-of-order distances,
// duplicate distances, missing mesh refs.

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkProject } from "../../engine/tools/check/project-check";

let projectDir: string;

function writeProject(): void {
  writeFileSync(
    join(projectDir, "project.json"),
    JSON.stringify({
      agfFormatVersion: 1,
      id: "lod-fixture",
      name: "LOD Fixture",
      startScene: "scenes/start.scene.json",
      assetRoot: "assets",
      render: { mode: "webgl" },
      profiles: ["static"]
    })
  );
}

function writeScene(lodLevels: Array<Record<string, unknown>>): void {
  const entities = [
    {
      id: "lod-target",
      components: {
        MeshRenderer: { mesh: "box" },
        LOD: { levels: lodLevels }
      }
    }
  ];
  writeFileSync(
    join(projectDir, "scenes/start.scene.json"),
    JSON.stringify({ agfFormatVersion: 1, id: "start", entities })
  );
}

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), "agf-lod-check-"));
  mkdirSync(join(projectDir, "scenes"), { recursive: true });
  mkdirSync(join(projectDir, "assets"), { recursive: true });
  writeProject();
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe("LOD validation (S54)", () => {
  it("accepts a valid ascending LOD chain with primitive meshes", () => {
    writeScene([
      { maxDistance: 5, mesh: "box" },
      { maxDistance: 15, mesh: "sphere" }
    ]);
    const result = checkProject(projectDir);
    const lodDiags = result.diagnostics.filter((d) => d.code.startsWith("AGF_LOD_"));
    expect(lodDiags).toHaveLength(0);
  });

  it("emits AGF_LOD_DISTANCES_OUT_OF_ORDER when distances are not strictly ascending", () => {
    writeScene([
      { maxDistance: 10, mesh: "box" },
      { maxDistance: 5, mesh: "sphere" }
    ]);
    const result = checkProject(projectDir);
    const ordering = result.diagnostics.find(
      (d) => d.code === "AGF_LOD_DISTANCES_OUT_OF_ORDER"
    );
    expect(ordering).toBeDefined();
    expect(ordering?.severity).toBe("error");
    expect(ordering?.path).toContain("LOD.levels[1].maxDistance");
  });

  it("emits AGF_LOD_DISTANCE_DUPLICATE when two levels share the same threshold", () => {
    writeScene([
      { maxDistance: 5, mesh: "box" },
      { maxDistance: 5, mesh: "sphere" }
    ]);
    const result = checkProject(projectDir);
    const duplicate = result.diagnostics.find(
      (d) => d.code === "AGF_LOD_DISTANCE_DUPLICATE"
    );
    expect(duplicate).toBeDefined();
    expect(duplicate?.severity).toBe("error");
  });

  it("emits AGF_LOD_MESH_MISSING when a level references a non-existent asset", () => {
    writeScene([
      { maxDistance: 5, mesh: "box" },
      { maxDistance: 15, mesh: "runtime/models/ghost.glb" }
    ]);
    const result = checkProject(projectDir);
    const missing = result.diagnostics.find(
      (d) => d.code === "AGF_LOD_MESH_MISSING"
    );
    expect(missing).toBeDefined();
    expect(missing?.severity).toBe("error");
  });
});
