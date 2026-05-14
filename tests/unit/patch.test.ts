import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyPatch, type EnginePatch } from "../../engine/tools/patch/project-patch";

const here = dirname(fileURLToPath(import.meta.url));
const sandboxRoot = resolve(here, "../tmp/patch");

function sandbox(name: string, files: Record<string, unknown>): string {
  const dir = resolve(sandboxRoot, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [relative, data] of Object.entries(files)) {
    const absolute = resolve(dir, relative);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, JSON.stringify(data, null, 2));
  }
  return dir;
}

describe("engine patch v0", () => {
  it("dry-runs a set on project.json without touching disk", () => {
    const dir = sandbox("set-dry", {
      "project.json": { id: "foo", name: "Foo", agfFormatVersion: 1 }
    });

    const patch: EnginePatch = {
      operations: [{ kind: "set", file: "project.json", path: "/name", value: "Bar" }]
    };
    const result = applyPatch(dir, patch);

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
    expect((result.files["project.json"] as { name: string }).name).toBe("Bar");

    const onDisk = JSON.parse(readFileSync(resolve(dir, "project.json"), "utf8")) as { name: string };
    expect(onDisk.name).toBe("Foo");
  });

  it("writes the result when options.write is true", () => {
    const dir = sandbox("set-write", {
      "project.json": { id: "foo", name: "Foo" }
    });

    const result = applyPatch(
      dir,
      {
        operations: [{ kind: "set", file: "project.json", path: "/name", value: "Bar" }]
      },
      { write: true }
    );

    expect(result.ok).toBe(true);
    const onDisk = JSON.parse(readFileSync(resolve(dir, "project.json"), "utf8")) as { name: string };
    expect(onDisk.name).toBe("Bar");
  });

  it("inserts into an array at the end when no index is given", () => {
    const dir = sandbox("insert", {
      "assets/_sources/asset-sources.json": {
        version: 1,
        assets: [{ id: "drone" }]
      }
    });

    const result = applyPatch(dir, {
      operations: [
        {
          kind: "insert",
          file: "assets/_sources/asset-sources.json",
          path: "/assets",
          value: { id: "core" }
        }
      ]
    });

    expect(result.ok).toBe(true);
    const assets = (result.files["assets/_sources/asset-sources.json"] as {
      assets: Array<{ id: string }>;
    }).assets;
    expect(assets.map((a) => a.id)).toEqual(["drone", "core"]);
  });

  it("rejects malformed pointer + unknown file + insert on object", () => {
    const dir = sandbox("malformed", {
      "project.json": { id: "foo", profiles: ["static"] }
    });

    const result = applyPatch(dir, {
      operations: [
        { kind: "set", file: "project.json", path: "no-leading-slash", value: 1 },
        { kind: "set", file: "missing.json", path: "/anything", value: 1 },
        { kind: "insert", file: "project.json", path: "/id", value: "bar" }
      ]
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(3);
    expect(result.diagnostics[0]?.message).toMatch(/JSON pointer/);
    expect(result.diagnostics[1]?.message).toMatch(/does not exist/);
    expect(result.diagnostics[2]?.message).toMatch(/insert.*array/);
  });

  it("deletes an object key", () => {
    const dir = sandbox("delete", {
      "project.json": { id: "foo", legacy: { drop: "me" } }
    });

    const result = applyPatch(dir, {
      operations: [{ kind: "delete", file: "project.json", path: "/legacy" }]
    });

    expect(result.ok).toBe(true);
    expect(result.files["project.json"]).not.toHaveProperty("legacy");
  });

  it("postCheck FAIL: a valid patch that produces an invalid project lands an error", async () => {
    // Start from a known-good fixture; patch project.json's startScene to a
    // missing path. The patch ops succeed; engine check rejects the result.
    const fs = await import("node:fs");
    const here = dirname(fileURLToPath(import.meta.url));
    const fixturesRoot = resolve(here, "../fixtures");
    const valid = resolve(fixturesRoot, "valid-project");

    const dir = resolve(sandboxRoot, "post-check");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    fs.cpSync(valid, dir, { recursive: true });

    const result = applyPatch(
      dir,
      {
        operations: [
          { kind: "set", file: "project.json", path: "/startScene", value: "scenes/does-not-exist.scene.json" }
        ]
      },
      { validateAfter: true }
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([]); // op-level: no errors
    expect(result.postCheck?.ok).toBe(false);
    const codes = (result.postCheck?.diagnostics ?? []).map((d) => d.code);
    expect(codes).toContain("AGF_PROJECT_START_SCENE_MISSING");
  });
});
