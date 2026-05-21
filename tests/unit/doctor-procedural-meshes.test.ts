// S101 AGF-PROCMESH-DOCTOR-LINE — declaredKeys + sceneUsageCount +
// missingRegistrations + formatProceduralMeshes rendering.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import {
  formatProceduralMeshes,
  summarizeProceduralMeshes
} from "../../engine/tools/doctor/project-doctor";

type FixtureOpts = {
  bootstrapRegistrations?: ReadonlyArray<string>;
  srcRegistrations?: ReadonlyArray<{ file: string; keys: ReadonlyArray<string> }>;
  sceneRefs?: ReadonlyArray<string>;
};

function stageProject(opts: FixtureOpts): { projectDir: string; cleanup(): void } {
  const projectDir = mkdtempSync(join(tmpdir(), "procmesh-doctor-"));
  mkdirSync(join(projectDir, "src"), { recursive: true });
  mkdirSync(join(projectDir, "scenes"), { recursive: true });
  // Minimal project.json + template.json so the rest of the doctor
  // wouldn't blow up if we wired this into the full summarizeProject path;
  // we only call summarizeProceduralMeshes via the formatted output, so
  // these are not strictly needed. Keep them for symmetry.
  writeFileSync(
    join(projectDir, "project.json"),
    JSON.stringify({ id: "fixture", entry: "bootstrap.ts" }, null, 2),
    "utf8"
  );

  if (opts.bootstrapRegistrations !== undefined && opts.bootstrapRegistrations.length > 0) {
    const calls = opts.bootstrapRegistrations
      .map((k) => `renderer.proceduralMeshRegistry().register("${k}", () => new BoxGeometry(1, 1, 1));`)
      .join("\n");
    writeFileSync(join(projectDir, "bootstrap.ts"), `// fixture\n${calls}\n`, "utf8");
  }
  for (const r of opts.srcRegistrations ?? []) {
    const calls = r.keys
      .map((k) => `renderer.proceduralMeshRegistry().register('${k}', () => geometry);`)
      .join("\n");
    writeFileSync(join(projectDir, "src", r.file), `// fixture\n${calls}\n`, "utf8");
  }
  if (opts.sceneRefs !== undefined && opts.sceneRefs.length > 0) {
    const entities = opts.sceneRefs.map((ref, i) => ({
      id: `e${i}`,
      components: { MeshRenderer: { mesh: ref } }
    }));
    const scene = { id: "fixture", entities };
    writeFileSync(
      join(projectDir, "scenes", "start.scene.json"),
      JSON.stringify(scene, null, 2) + "\n",
      "utf8"
    );
  }

  return {
    projectDir,
    cleanup: () => rmSync(projectDir, { recursive: true, force: true })
  };
}

describe("summarizeProceduralMeshes walker (S101)", () => {
  it("picks up registered keys from bootstrap.ts", () => {
    const fx = stageProject({ bootstrapRegistrations: ["procbomber", "tower"] });
    try {
      const r = summarizeProceduralMeshes(fx.projectDir);
      expect(r.declaredKeys).toEqual(["procbomber", "tower"]);
      expect(r.sceneUsageCount).toBe(0);
      expect(r.perKey).toEqual([]);
      expect(r.missingRegistrations).toEqual([]);
    } finally {
      fx.cleanup();
    }
  });

  it("picks up registered keys from src/**/*.ts", () => {
    const fx = stageProject({
      srcRegistrations: [
        { file: "register-bombers.ts", keys: ["procbomber"] },
        { file: "register-towers.ts", keys: ["tower-a", "tower-b"] }
      ]
    });
    try {
      const r = summarizeProceduralMeshes(fx.projectDir);
      expect(r.declaredKeys).toEqual(["procbomber", "tower-a", "tower-b"]);
    } finally {
      fx.cleanup();
    }
  });

  it("counts scene usage per key and across all entities", () => {
    const fx = stageProject({
      bootstrapRegistrations: ["procbomber"],
      sceneRefs: ["procedural:procbomber#a", "procedural:procbomber#b", "procedural:procbomber"]
    });
    try {
      const r = summarizeProceduralMeshes(fx.projectDir);
      expect(r.sceneUsageCount).toBe(3);
      expect(r.perKey).toEqual([{ key: "procbomber", instanceCount: 3 }]);
      expect(r.missingRegistrations).toEqual([]);
    } finally {
      fx.cleanup();
    }
  });

  it("flags scene refs whose key is never registered", () => {
    const fx = stageProject({
      sceneRefs: ["procedural:mystery"]
    });
    try {
      const r = summarizeProceduralMeshes(fx.projectDir);
      expect(r.declaredKeys).toEqual([]);
      expect(r.missingRegistrations).toEqual(["mystery"]);
    } finally {
      fx.cleanup();
    }
  });
});

describe("formatProceduralMeshes (S101)", () => {
  it("reports the empty case as a no-op section (format returns empty string)", () => {
    const out = formatProceduralMeshes({
      declaredKeys: [],
      sceneUsageCount: 0,
      perKey: [],
      missingRegistrations: []
    });
    expect(out).toBe("");
  });

  it("renders declared keys + per-key scene usage when both present", () => {
    const out = formatProceduralMeshes({
      declaredKeys: ["procbomber"],
      sceneUsageCount: 2,
      perKey: [{ key: "procbomber", instanceCount: 2 }],
      missingRegistrations: []
    });
    expect(out).toContain("Procedural mesh registry: 1 declared key(s) [procbomber], 2 scene entity reference(s)");
    expect(out).toContain("2× procedural:procbomber");
    expect(out).not.toContain("⚠ not registered");
  });

  it("flags missing registrations with a warning glyph", () => {
    const out = formatProceduralMeshes({
      declaredKeys: ["procbomber"],
      sceneUsageCount: 3,
      perKey: [
        { key: "procbomber", instanceCount: 2 },
        { key: "mystery", instanceCount: 1 }
      ],
      missingRegistrations: ["mystery"]
    });
    expect(out).toContain("1× procedural:mystery ⚠ not registered");
    expect(out).toContain("2× procedural:procbomber");
    // procbomber line is unflagged.
    expect(out).not.toMatch(/procedural:procbomber ⚠/);
  });

  it("renders even with zero declared keys when a scene references something (so the missing-registration warning is visible)", () => {
    const out = formatProceduralMeshes({
      declaredKeys: [],
      sceneUsageCount: 1,
      perKey: [{ key: "mystery", instanceCount: 1 }],
      missingRegistrations: ["mystery"]
    });
    expect(out).toContain("0 declared key(s) [(none)]");
    expect(out).toContain("1× procedural:mystery ⚠ not registered");
  });
});

