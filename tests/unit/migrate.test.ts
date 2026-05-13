import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyMigration, formatPlan, planMigration } from "../../engine/tools/migrate/project-migrate";

const here = dirname(fileURLToPath(import.meta.url));
const sandboxRoot = resolve(here, "../tmp/migrate");

function setupSandbox(name: string, projectJson: object): string {
  const dir = resolve(sandboxRoot, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "project.json"), JSON.stringify(projectJson, null, 2));
  return dir;
}

describe("engine migrate v0", () => {
  it("plans adding agfFormatVersion when missing", () => {
    const dir = setupSandbox("no-version", {
      id: "no-version",
      name: "No Version",
      startScene: "scenes/start.scene.json",
      assetRoot: "assets",
      render: { mode: "webgl", background: "#000000" },
      profiles: ["static"]
    });

    const plan = planMigration(dir);
    expect(plan.fromVersion).toBeUndefined();
    expect(plan.toVersion).toBe(1);
    expect(plan.patches).toHaveLength(1);
    expect(plan.patches[0]).toMatchObject({
      file: "project.json",
      path: "$.agfFormatVersion",
      before: undefined,
      after: 1
    });
  });

  it("is a no-op when the project is already at the current version", () => {
    const dir = setupSandbox("current", {
      agfFormatVersion: 1,
      id: "current",
      name: "Current",
      startScene: "scenes/start.scene.json",
      assetRoot: "assets",
      render: { mode: "webgl", background: "#000000" },
      profiles: ["static"]
    });

    const plan = planMigration(dir);
    expect(plan.patches).toEqual([]);
    expect(formatPlan(plan)).toContain("no changes needed");
  });

  it("applyMigration writes the agfFormatVersion field at the top of project.json", () => {
    const dir = setupSandbox("apply", {
      id: "apply",
      name: "Apply",
      startScene: "scenes/start.scene.json",
      assetRoot: "assets",
      render: { mode: "webgl", background: "#000000" },
      profiles: ["static"]
    });

    const plan = planMigration(dir);
    applyMigration(plan);

    const after = JSON.parse(readFileSync(resolve(dir, "project.json"), "utf8"));
    expect(after.agfFormatVersion).toBe(1);
    // Other fields stay intact.
    expect(after.id).toBe("apply");
    expect(after.profiles).toEqual(["static"]);
  });
});
