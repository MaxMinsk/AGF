import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const engineDir = resolve(repoRoot, "engine");

function* walkTs(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walkTs(full);
    } else if (stat.isFile() && full.endsWith(".ts")) {
      yield full;
    }
  }
}

describe("renderer import boundary", () => {
  it("only files under engine/render/ may import the `three` package", () => {
    const violations: string[] = [];
    for (const file of walkTs(engineDir)) {
      const isRender = file.includes(`${engineDir}/render/`);
      if (isRender) {
        continue;
      }
      const source = readFileSync(file, "utf8");
      if (/from\s+["']three["']/.test(source) || /import\(\s*["']three["']\s*\)/.test(source)) {
        violations.push(file.replace(`${repoRoot}/`, ""));
      }
    }
    expect(violations).toEqual([]);
  });

  // S70 WEBGPU-renderer-import-boundary. The `three/webgpu` entrypoint
  // re-exports the entire TSL / node-material runtime (~145 KB gzipped).
  // It must be reachable only from `engine/render/webgpu/` so the lazy
  // chunk split set up in `vite.config.ts` keeps holding: any other file
  // touching it would either pull the chunk eagerly into a different
  // dependency graph or break the dynamic-import boundary inside
  // `webgpu-module-loader.ts`.
  it("only files under engine/render/webgpu/ may reference `three/webgpu`", () => {
    const webgpuDir = resolve(engineDir, "render/webgpu");
    const violations: string[] = [];
    for (const file of walkTs(engineDir)) {
      const isWebGpuSubdir = file.startsWith(`${webgpuDir}/`) || file === webgpuDir;
      if (isWebGpuSubdir) {
        continue;
      }
      const source = readFileSync(file, "utf8");
      if (
        /from\s+["']three\/webgpu["']/.test(source) ||
        /import\(\s*["']three\/webgpu["']\s*\)/.test(source)
      ) {
        violations.push(file.replace(`${repoRoot}/`, ""));
      }
    }
    expect(violations).toEqual([]);
  });
});
