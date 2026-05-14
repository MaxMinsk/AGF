import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { analyzeMaterialSharing } from "../../engine/tools/doctor/material-sharing";

function makeProject(): string {
  const root = mkdtempSync(resolve(tmpdir(), "agf-material-sharing-"));
  mkdirSync(resolve(root, "assets/runtime/materials"), { recursive: true });
  return root;
}

function writeManifest(projectDir: string, name: string, payload: object): void {
  const path = resolve(projectDir, "assets/runtime/materials", name);
  writeFileSync(path, JSON.stringify(payload));
}

describe("analyzeMaterialSharing (M17-material-sharing-doctor)", () => {
  it("reports manifests that resolve to identical signatures as duplicates", () => {
    const dir = makeProject();
    try {
      writeManifest(dir, "a.material.json", { shader: "standard", color: "#ff8800" });
      writeManifest(dir, "b.material.json", { shader: "standard", color: "#ff8800" });
      writeManifest(dir, "c.material.json", { shader: "standard", color: "#3366ff" });
      const report = analyzeMaterialSharing(dir);
      expect(report.totalManifests).toBe(3);
      expect(report.uniqueSignatures).toBe(2);
      expect(report.duplicates).toHaveLength(1);
      expect(report.duplicates[0]?.manifests).toEqual([
        "assets/runtime/materials/a.material.json",
        "assets/runtime/materials/b.material.json"
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("treats different PBR params as distinct signatures even when colour matches", () => {
    const dir = makeProject();
    try {
      writeManifest(dir, "matte.material.json", {
        shader: "standard",
        color: "#888888",
        roughness: 0.9,
        metalness: 0
      });
      writeManifest(dir, "glossy.material.json", {
        shader: "standard",
        color: "#888888",
        roughness: 0.1,
        metalness: 0.8
      });
      const report = analyzeMaterialSharing(dir);
      expect(report.totalManifests).toBe(2);
      expect(report.uniqueSignatures).toBe(2);
      expect(report.duplicates).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns an empty report when no manifests exist", () => {
    const dir = makeProject();
    try {
      const report = analyzeMaterialSharing(dir);
      expect(report.totalManifests).toBe(0);
      expect(report.uniqueSignatures).toBe(0);
      expect(report.duplicates).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
