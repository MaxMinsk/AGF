import { defineConfig, type Plugin } from "vite";
import { cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(fileURLToPath(import.meta.url));

/**
 * Projects whose runtime assets (materials, models, etc.) must be reachable
 * by `fetch()` in a production build. Keep in sync with the project switcher
 * in `src/main.ts`.
 */
const EXAMPLE_PROJECTS = ["hello-3d", "beacon-world"];

function copyExampleAssets(): Plugin {
  return {
    name: "agf-copy-example-assets",
    apply: "build",
    async closeBundle() {
      for (const projectId of EXAMPLE_PROJECTS) {
        const sourceDir = resolve(repoRoot, "examples", projectId, "assets");
        const destDir = resolve(repoRoot, "dist", "examples", projectId, "assets");
        if (!existsSync(sourceDir)) {
          continue;
        }
        await cp(sourceDir, destDir, {
          recursive: true,
          filter: (src) => !src.endsWith("/.gitkeep") && !src.endsWith("\\.gitkeep")
        });
      }
    }
  };
}

export default defineConfig({
  plugins: [copyExampleAssets()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true
  }
});
