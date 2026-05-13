import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkProject } from "../../engine/tools/check/project-check";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixturesRoot = resolve(repositoryRoot, "tests/fixtures");

describe("project check", () => {
  it("accepts a valid project", () => {
    const result = checkProject(resolve(fixturesRoot, "valid-project"));

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("accepts external mesh and material references when files exist", () => {
    const result = checkProject(resolve(fixturesRoot, "valid-asset-reference"));

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("reports unknown components and duplicate entity ids", () => {
    const result = checkProject(resolve(fixturesRoot, "invalid-project"));
    const codes = result.diagnostics.map((diagnostic) => diagnostic.code);

    expect(result.ok).toBe(false);
    expect(codes).toContain("AGF_SCHEMA_UNKNOWN_COMPONENT");
    expect(codes).toContain("AGF_SCENE_DUPLICATE_ENTITY_ID");
    const componentDiagnostic = result.diagnostics.find(
      (diagnostic) => diagnostic.code === "AGF_SCHEMA_UNKNOWN_COMPONENT"
    );
    expect(componentDiagnostic).toMatchObject({
      file: "scenes/start.scene.json",
      path: "$.entities[0].components.Rotator",
      message: expect.stringContaining('Unknown component "Rotator"'),
      suggestion: expect.stringContaining("Camera")
    });
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "scenes/start.scene.json",
          path: "$.entities[1].id"
        })
      ])
    );
  });

  it("suggests the nearest known component when the unknown name is a near-match typo", () => {
    const result = checkProject(resolve(fixturesRoot, "component-typo"));
    const diagnostic = result.diagnostics.find(
      (entry) => entry.code === "AGF_SCHEMA_UNKNOWN_COMPONENT"
    );
    expect(diagnostic).toBeDefined();
    expect(diagnostic!.message).toBe('Unknown component "Trnasform".');
    expect(diagnostic!.suggestion).toMatch(/Did you mean "Transform"/);
  });

  it("reports a missing start scene at the project field", () => {
    const result = checkProject(resolve(fixturesRoot, "missing-start-scene"));

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "AGF_PROJECT_START_SCENE_MISSING",
        file: "project.json",
        path: "$.startScene"
      })
    );
  });

  it("validates asset source metadata when present", () => {
    const result = checkProject(resolve(fixturesRoot, "invalid-asset-metadata"));

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "AGF_SCHEMA_REQUIRED_PROPERTY",
        file: "assets/_sources/asset-sources.json",
        path: "$.assets[0].license"
      })
    );
  });

  it("reports missing external mesh and material references", () => {
    const result = checkProject(resolve(fixturesRoot, "missing-asset-reference"));

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "AGF_ASSET_REFERENCE_MISSING",
          file: "scenes/start.scene.json",
          path: "$.entities[0].components.MeshRenderer.mesh"
        }),
        expect.objectContaining({
          code: "AGF_ASSET_REFERENCE_MISSING",
          file: "scenes/start.scene.json",
          path: "$.entities[0].components.MeshRenderer.material"
        })
      ])
    );
  });

  it("validates Networked and Presence components", () => {
    const result = checkProject(resolve(fixturesRoot, "invalid-network-component"));

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "AGF_SCHEMA_VALIDATION_FAILED",
          file: "scenes/start.scene.json",
          path: "$.entities[0].components.Networked.authority"
        }),
        expect.objectContaining({
          code: "AGF_SCHEMA_VALIDATION_FAILED",
          file: "scenes/start.scene.json",
          path: "$.entities[0].components.Presence.playerId"
        })
      ])
    );
  });

  it("validates material manifests under assetRoot/runtime/materials", () => {
    const result = checkProject(resolve(fixturesRoot, "invalid-material"));

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "AGF_SCHEMA_UNKNOWN_PROPERTY",
          file: "assets/runtime/materials/broken.material.json",
          path: "$.extra"
        }),
        expect.objectContaining({
          code: "AGF_SCHEMA_VALIDATION_FAILED",
          file: "assets/runtime/materials/broken.material.json",
          path: "$.shader"
        }),
        expect.objectContaining({
          code: "AGF_SCHEMA_VALIDATION_FAILED",
          file: "assets/runtime/materials/broken.material.json",
          path: "$.color"
        })
      ])
    );
  });
});
