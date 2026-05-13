import { defineConfig, type Plugin } from "vite";
import { cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
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

/**
 * Dev-only plugin: when an asset under `examples/<projectId>/assets/` changes,
 * push a custom HMR event so the client can drop the AssetRegistry cache and
 * re-apply the asset without a full page reload.
 */
function assetHotReload(): Plugin {
  return {
    name: "agf-asset-hot-reload",
    apply: "serve",
    configureServer(server) {
      const matchAssetPath = /^examples\/([^/]+)\/assets\/(.*)$/;
      server.watcher.on("change", (changedPath) => {
        const relPath = relative(repoRoot, changedPath).split("\\").join("/");
        const match = matchAssetPath.exec(relPath);
        if (match === null) {
          return;
        }
        const projectId = match[1];
        const ref = match[2];
        if (projectId === undefined || ref === undefined) {
          return;
        }
        server.ws.send({
          type: "custom",
          event: "agf:asset-changed",
          data: { projectId, ref }
        });
      });
    }
  };
}

export default defineConfig({
  plugins: [copyExampleAssets(), assetHotReload()],
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
