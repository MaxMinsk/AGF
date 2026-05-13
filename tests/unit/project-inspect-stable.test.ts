import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectProject, toStableInspectResult } from "../../engine/tools/inspect/project-inspect";

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
