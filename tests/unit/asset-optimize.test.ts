// S54 ASSET-optimize-command — covers the new `--source` per-file
// option's path-validation branches. The happy path is exercised
// manually via `engine asset optimize <projectDir> --source ...` on
// real GLB fixtures; this suite pins the error rails.

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { optimizeProjectAssets } from "../../engine/tools/asset/asset-optimize";

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), "agf-asset-optimize-"));
  mkdirSync(join(projectDir, "assets/_sources"), { recursive: true });
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe("optimizeProjectAssets — `source` per-file option (S54)", () => {
  it("throws when the source file doesn't exist", async () => {
    await expect(
      optimizeProjectAssets(projectDir, { source: "assets/_sources/missing.glb" })
    ).rejects.toThrow(/not found/);
  });

  it("throws when the source file isn't a .glb", async () => {
    const path = join(projectDir, "assets/_sources/notes.txt");
    writeFileSync(path, "hello");
    await expect(
      optimizeProjectAssets(projectDir, { source: "assets/_sources/notes.txt" })
    ).rejects.toThrow(/\.glb files/);
  });

  it("throws when the source file is outside assets/_sources/", async () => {
    mkdirSync(join(projectDir, "elsewhere"), { recursive: true });
    const path = join(projectDir, "elsewhere/strange.glb");
    writeFileSync(path, "");
    await expect(
      optimizeProjectAssets(projectDir, { source: "elsewhere/strange.glb" })
    ).rejects.toThrow(/assets\/_sources/);
  });

  it("returns an empty report when no .glb files exist under _sources/", async () => {
    const report = await optimizeProjectAssets(projectDir);
    expect(report.entries).toHaveLength(0);
    expect(report.totalBytesSaved).toBe(0);
  });
});
