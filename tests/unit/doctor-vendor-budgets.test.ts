// Regression for S43 OSS-doctor-budget-align: the doctor's bundle path used to
// treat lazy-loaded vendor chunks (Rapier WASM, Three.js auto-split) as the
// project's "largest chunk" and fail every project with physics enabled.
// With vendor-aware budgets the main chunk and each vendor chunk get their
// own ceiling matching `scripts/check-bundle-size.mjs`.

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { runDoctor, DEFAULT_VENDOR_BUDGETS } from "../../engine/tools/doctor/project-doctor";

function writeChunk(distAssets: string, name: string, approxGzipKb: number): void {
  // The doctor measures gzipped size. Random bytes have ~1.0 gzip ratio
  // (gzip's framing adds ~20 bytes), so writing N random bytes produces a
  // chunk whose gzip size is approximately N. The doctor's comparison is
  // strict-greater-than, so a small +5% margin makes the violation deterministic.
  const bytes = Math.round(approxGzipKb * 1024);
  writeFileSync(join(distAssets, name), randomBytes(bytes));
}

function writeBudget(projectDir: string, body: object): void {
  writeFileSync(
    join(projectDir, "performance-budget.json"),
    JSON.stringify({ agfFormatVersion: 1, renderer: { soft: {}, hard: {} }, bundle: body })
  );
}

let repoRoot: string;
let projectDir: string;

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), "agf-doctor-budgets-"));
  projectDir = join(repoRoot, "examples", "fake");
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(join(repoRoot, "dist", "assets"), { recursive: true });
  writeFileSync(
    join(projectDir, "project.json"),
    JSON.stringify({
      agfFormatVersion: 1,
      id: "fake",
      name: "Fake",
      startScene: "scenes/start.scene.json",
      assetRoot: "assets",
      profiles: ["static"]
    })
  );
  mkdirSync(join(projectDir, "scenes"), { recursive: true });
  writeFileSync(
    join(projectDir, "scenes", "start.scene.json"),
    JSON.stringify({ agfFormatVersion: 1, id: "start", entities: [] })
  );
  mkdirSync(join(projectDir, "assets"), { recursive: true });
});

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true });
});

describe("doctor vendor-aware bundle budgets", () => {
  it("does not flag a Rapier vendor chunk against the project's main-chunk budget", () => {
    writeChunk(join(repoRoot, "dist", "assets"), "rapier-AbCd.js", 800);
    writeChunk(join(repoRoot, "dist", "assets"), "main-XyZw.js", 150);
    writeBudget(projectDir, {
      softLargestChunkGzipKb: 200,
      hardLargestChunkGzipKb: 250
    });

    const report = runDoctor(projectDir, repoRoot);

    const rapierBundle = report.vendorBundles.find((v) => v.prefix === "rapier-");
    expect(rapierBundle).toBeDefined();
    expect(rapierBundle?.violation).toBe("none");
    expect(report.bundle?.largestChunk).toMatch(/^main-/);
    expect(report.bundle?.violation).toBe("none");
  });

  it("flags a vendor chunk that exceeds its built-in default budget", () => {
    writeChunk(join(repoRoot, "dist", "assets"), "rapier-AbCd.js", 950);
    writeChunk(join(repoRoot, "dist", "assets"), "main-XyZw.js", 100);
    writeBudget(projectDir, {
      softLargestChunkGzipKb: 200,
      hardLargestChunkGzipKb: 250
    });

    const report = runDoctor(projectDir, repoRoot);

    const rapierBundle = report.vendorBundles.find((v) => v.prefix === "rapier-");
    expect(rapierBundle?.violation).toBe("hard");
    expect(rapierBundle?.hardGzipKb).toBe(DEFAULT_VENDOR_BUDGETS["rapier-"]?.hardGzipKb);
  });

  it("flags a main chunk that exceeds the project's hard budget", () => {
    writeChunk(join(repoRoot, "dist", "assets"), "main-XyZw.js", 300);
    writeBudget(projectDir, {
      softLargestChunkGzipKb: 200,
      hardLargestChunkGzipKb: 250
    });

    const report = runDoctor(projectDir, repoRoot);
    expect(report.bundle?.violation).toBe("hard");
  });

  it("respects per-project vendor overrides", () => {
    writeChunk(join(repoRoot, "dist", "assets"), "rapier-AbCd.js", 700);
    writeChunk(join(repoRoot, "dist", "assets"), "main-XyZw.js", 100);
    writeBudget(projectDir, {
      softLargestChunkGzipKb: 200,
      hardLargestChunkGzipKb: 250,
      vendors: { "rapier-": { hardGzipKb: 600 } }
    });

    const report = runDoctor(projectDir, repoRoot);
    const rapierBundle = report.vendorBundles.find((v) => v.prefix === "rapier-");
    expect(rapierBundle?.violation).toBe("hard");
    expect(rapierBundle?.hardGzipKb).toBe(600);
  });
});
