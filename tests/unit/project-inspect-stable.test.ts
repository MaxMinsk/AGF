import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatInspection,
  inspectProject,
  NOISY_METADATA_COMPONENTS,
  tailInspectResult,
  toStableInspectResult
} from "../../engine/tools/inspect/project-inspect";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixturesRoot = resolve(repositoryRoot, "tests/fixtures");

describe("toStableInspectResult", () => {
  it("collapses projectDir to its basename so the diff between two runs is byte-stable", () => {
    const fromAbsolute = inspectProject(resolve(fixturesRoot, "valid-project"));
    const stable = toStableInspectResult(fromAbsolute);
    expect(stable.projectDir).toBe("valid-project");
  });

  it("sorts top-level keys so two runs produce byte-identical JSON when the world is unchanged", () => {
    const result = inspectProject(resolve(fixturesRoot, "valid-project"));
    const first = JSON.stringify(toStableInspectResult(result), null, 2);
    const second = JSON.stringify(toStableInspectResult(result), null, 2);
    expect(first).toBe(second);

    const keys = Array.from(first.matchAll(/^  "(\w+)":/gm)).map((match) => match[1]);
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
  });

  it("does not strip filter / project / scene when present", () => {
    const result = inspectProject(resolve(fixturesRoot, "valid-project"), {
      components: ["Camera"]
    });
    const stable = toStableInspectResult(result);
    expect(stable.filter?.components).toEqual(["Camera"]);
    expect(stable.project?.id).toBe("valid-project");
    expect(stable.scene).toBeDefined();
  });
});

describe("tailInspectResult", () => {
  it("returns the same result when tail is undefined", () => {
    const result = inspectProject(resolve(fixturesRoot, "valid-project"));
    const tailed = tailInspectResult(result, undefined);
    expect(tailed).toBe(result);
  });

  it("keeps only the last N entities and preserves matchedEntityCount", () => {
    const result = inspectProject(resolve(fixturesRoot, "valid-project"));
    expect(result.scene!.entities.length).toBeGreaterThan(1);
    const tailed = tailInspectResult(result, 1);
    expect(tailed.scene!.entities).toHaveLength(1);
    expect(tailed.scene!.entities[0]!.id).toBe(result.scene!.entities.at(-1)!.id);
    expect(tailed.scene!.matchedEntityCount).toBe(result.scene!.matchedEntityCount);
  });

  it("treats tail 0 as keep nothing but keeps the match count", () => {
    const result = inspectProject(resolve(fixturesRoot, "valid-project"));
    const tailed = tailInspectResult(result, 0);
    expect(tailed.scene!.entities).toEqual([]);
    expect(tailed.scene!.matchedEntityCount).toBe(result.scene!.matchedEntityCount);
  });

  it("drops excluded components from every entity output", () => {
    const result = inspectProject(resolve(fixturesRoot, "valid-project"), {
      excludeComponents: ["Name"]
    });
    for (const entity of result.scene!.entities) {
      expect(entity.componentNames).not.toContain("Name");
      expect(Object.keys(entity.components)).not.toContain("Name");
    }
  });

  it("NOISY_METADATA_COMPONENTS lists the canonical metadata names dropped by --components-only", () => {
    expect(NOISY_METADATA_COMPONENTS).toContain("Name");
    expect(NOISY_METADATA_COMPONENTS).toContain("Networked");
    expect(NOISY_METADATA_COMPONENTS).toContain("Presence");
  });

  it("formatInspection annotates the truncated count", () => {
    const result = inspectProject(resolve(fixturesRoot, "valid-project"));
    const tailed = tailInspectResult(result, 1);
    const formatted = formatInspection(tailed);
    const hidden = result.scene!.matchedEntityCount - 1;
    expect(formatted).toContain(`Showing last 1 of ${result.scene!.matchedEntityCount} (${hidden} hidden by --tail).`);
  });

  it("formatInspection surfaces asset-runtime-undeclared warnings under a Diagnostics section", () => {
    const result = inspectProject(resolve(fixturesRoot, "undeclared-runtime-asset"));
    const formatted = formatInspection(result);
    expect(formatted).toMatch(/Diagnostics:/);
    expect(formatted).toMatch(/AGF_ASSET_RUNTIME_UNDECLARED/);
    expect(formatted).toMatch(/runtime\/models\/orphan\.glb/);
  });
});
