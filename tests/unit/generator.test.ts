// S81 KABOOM-GENERATOR-FRAMEWORK unit tests.

import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { runGenerator } from "../../engine/tools/generators/generate";
import { runGenerateCli } from "../../engine/tools/generators/cli";
import type { Generator } from "../../engine/tools/generators/types";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureDir = resolve(repoRoot, "tests/fixtures/generator-demo");

describe("runGenerator (S81 KABOOM-GENERATOR-FRAMEWORK)", () => {
  it("deterministic — same seed produces the same scene twice", () => {
    const gen: Generator = (rng) => ({
      id: "test",
      entities: [
        {
          id: `entity.${rng.nextInt(0, 1000)}`,
          components: { Name: { label: `n${rng.nextInt(0, 1000)}` } }
        }
      ]
    });
    const a = runGenerator({ seed: 42, generator: gen });
    const b = runGenerator({ seed: 42, generator: gen });
    expect(JSON.stringify(a.scene)).toBe(JSON.stringify(b.scene));
  });

  it("different seeds yield different scenes", () => {
    const gen: Generator = (rng) => ({
      id: "test",
      entities: Array.from({ length: 5 }, (_, i) => ({
        id: `entity.${i}.${rng.nextInt(0, 1_000_000)}`,
        components: { Name: { label: "x" } }
      }))
    });
    const a = runGenerator({ seed: 1, generator: gen });
    const b = runGenerator({ seed: 2, generator: gen });
    expect(JSON.stringify(a.scene)).not.toBe(JSON.stringify(b.scene));
  });

  it("flags empty entities array as AGF_GENERATOR_EMPTY_ENTITIES", () => {
    const gen: Generator = () => ({ id: "empty", entities: [] });
    const result = runGenerator({ seed: 1, generator: gen });
    expect(result.diagnostics.some((d) => d.code === "AGF_GENERATOR_EMPTY_ENTITIES")).toBe(true);
  });

  it("flags duplicate entity ids", () => {
    const gen: Generator = () => ({
      id: "dupes",
      entities: [
        { id: "dup", components: { Name: { label: "a" } } },
        { id: "dup", components: { Name: { label: "b" } } }
      ]
    });
    const result = runGenerator({ seed: 1, generator: gen });
    expect(result.diagnostics.some((d) => d.code === "AGF_GENERATOR_DUPLICATE_ENTITY_ID")).toBe(true);
  });

  it("flags out-of-bounds GridPosition when a Grid singleton is present", () => {
    const gen: Generator = () => ({
      id: "oob",
      entities: [
        { id: "grid.cfg", components: { Grid: { cellSize: 1, sizeX: 5, sizeZ: 5 } } },
        { id: "block", components: { GridPosition: { gx: 99, gz: 0 } } }
      ]
    });
    const result = runGenerator({ seed: 1, generator: gen });
    expect(
      result.diagnostics.some((d) => d.code === "AGF_GENERATOR_GRID_POSITION_OUT_OF_BOUNDS")
    ).toBe(true);
  });
});

describe("runGenerateCli (S81 KABOOM-GENERATOR-FRAMEWORK CLI)", () => {
  it("loads a fixture generator, runs it, and writes the JSON to --out", async () => {
    const tmp = mkdtempSync(resolve(tmpdir(), "agf-gen-"));
    const outPath = resolve(tmp, "scene.json");
    try {
      const result = await runGenerateCli({
        projectDir: fixtureDir,
        template: "arena",
        seed: 7,
        paramsJson: undefined,
        out: outPath
      });
      expect(result.ok).toBe(true);
      expect(result.outPath).toBe(outPath);
      expect(existsSync(outPath)).toBe(true);
      const written = JSON.parse(readFileSync(outPath, "utf8")) as { id: string; entities: unknown[] };
      expect(written.id).toBe("generated-arena");
      expect(written.entities.length).toBeGreaterThan(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("missing generator module surfaces AGF_GENERATOR_MODULE_NOT_FOUND", async () => {
    const result = await runGenerateCli({
      projectDir: fixtureDir,
      template: "does-not-exist",
      seed: 1,
      paramsJson: undefined,
      out: undefined
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]!.code).toBe("AGF_GENERATOR_MODULE_NOT_FOUND");
  });

  it("identical seed produces a byte-identical scene file", async () => {
    const tmp1 = mkdtempSync(resolve(tmpdir(), "agf-gen-a-"));
    const tmp2 = mkdtempSync(resolve(tmpdir(), "agf-gen-b-"));
    const out1 = resolve(tmp1, "scene.json");
    const out2 = resolve(tmp2, "scene.json");
    try {
      await runGenerateCli({ projectDir: fixtureDir, template: "arena", seed: 99, paramsJson: undefined, out: out1 });
      await runGenerateCli({ projectDir: fixtureDir, template: "arena", seed: 99, paramsJson: undefined, out: out2 });
      const a = readFileSync(out1, "utf8");
      const b = readFileSync(out2, "utf8");
      expect(a).toBe(b);
    } finally {
      rmSync(tmp1, { recursive: true, force: true });
      rmSync(tmp2, { recursive: true, force: true });
    }
  });
});
