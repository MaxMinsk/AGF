import { defineConfig, type Plugin } from "vite";
import { cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { agfDevBridge } from "./engine/dev/agf-dev-bridge";

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
  plugins: [copyExampleAssets(), assetHotReload(), agfDevBridge()],
  build: {
    rollupOptions: {
      output: {
        // Split heavy dependencies into dedicated chunks so the main app
        // bundle stays small and the big libraries cache independently.
        manualChunks(id: string): string | undefined {
          // S83 AGF-WEBGPU-CHUNK-SPLIT investigation. The S70
          // `three-webgpu` rule below NEVER produced a separate chunk
          // in any production build — every TSL / node-material module
          // ends up folded back into the main `three-*` chunk
          // (~535 KB gzipped).
          //
          // Cause: three.webgpu.js, three.tsl.js, three.webgpu.nodes.js
          // and three.module.js share a large pool of transitive
          // dependencies. Rollup, when asked to put `three.webgpu` in
          // chunk A and `three.module` in chunk B, sees the shared
          // code can only live in one place and hoists everything into
          // the larger chunk. Naming additional WebGPU entrypoints
          // (`three.tsl`, `three.webgpu.nodes`) under the same chunk
          // doesn't help — the shared graph is unsplittable here.
          //
          // A real split would require: (a) refactoring the renderer
          // so the WebGPU adapter is the ONLY edge importing
          // `three/webgpu`, AND (b) making sure the WebGL path doesn't
          // statically import anything from `three.module` that
          // three.webgpu re-exports. That's a refactor scoped past
          // this sprint — keeping the rule below as the eventual hook,
          // but the `three-` budget in scripts/check-bundle-size.mjs
          // stays at 560 KB until the refactor lands.
          if (id.includes("/node_modules/three/")) {
            if (id.includes("three.webgpu") || id.includes("three.tsl")) {
              return "three-webgpu";
            }
            return "three";
          }
          if (id.includes("/node_modules/ajv/") || id.includes("/node_modules/ajv-")) {
            return "ajv";
          }
          return undefined;
        }
      }
    }
  },
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
