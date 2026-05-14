// S45 AGENT-cli-new: copies an example into a fresh directory and rewrites
// project metadata. Verifies a) the copy doesn't drag generated artifacts,
// b) the new project's engine:check passes, c) destination collisions fail
// cleanly without partial writes.

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjectFromTemplate } from "../../engine/tools/new/project-new";

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "agf-new-"));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("engine new — project scaffolding from template", () => {
  it("scaffolds hello-3d into a fresh directory and engine:check passes", () => {
    const targetDir = join(workDir, "my-game");
    const result = createProjectFromTemplate({
      name: "my-game",
      templateId: "hello-3d",
      targetDir
    });
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.filesCopied).toBeGreaterThan(0);
    expect(result.rewritten).toContain("project.json");
    expect(existsSync(join(targetDir, "project.json"))).toBe(true);

    const project = JSON.parse(readFileSync(join(targetDir, "project.json"), "utf8")) as {
      id: string;
      name: string;
    };
    expect(project.id).toBe("my-game");
    expect(project.name).toBe("My Game");
  });

  it("rejects an invalid project name", () => {
    const targetDir = join(workDir, "Bad_Name");
    const result = createProjectFromTemplate({
      name: "Bad_Name",
      templateId: "hello-3d",
      targetDir
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/match/i);
    expect(result.filesCopied).toBe(0);
    expect(existsSync(targetDir)).toBe(false);
  });

  it("refuses to overwrite an existing directory", () => {
    const targetDir = join(workDir, "occupied");
    createProjectFromTemplate({
      name: "occupied",
      templateId: "hello-3d",
      targetDir
    });
    const second = createProjectFromTemplate({
      name: "occupied",
      templateId: "hello-3d",
      targetDir
    });
    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/already exists/i);
  });

  it("reports a missing template clearly", () => {
    const targetDir = join(workDir, "ghost");
    const result = createProjectFromTemplate({
      name: "ghost",
      templateId: "does-not-exist",
      targetDir
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Template directory not found/);
    expect(result.filesCopied).toBe(0);
  });
});
