import "./styles.css";

import { createApp, type AppHandle, type ProjectMeta } from "./app";
import { diffScenes } from "../engine/core/commands/scene-diff";
import type { ProjectBootstrap } from "../engine/runtime/project-bootstrap";
import type { EngineCommand } from "../engine/core/commands/types";
import type { SceneInput } from "../engine/core/ecs/types";
import type { WorldSnapshot } from "../engine/runtime/inspect";

declare global {
  interface Window {
    __agf?: {
      snapshot(): WorldSnapshot;
      applyCommands(commands: ReadonlyArray<EngineCommand>): void;
      /**
       * Project-local action. For Beacon World, re-arms all beacons, respawns
       * all consumed pickups and resets `RoundState` to active. Returns the
       * number of mutations applied. Equivalent to pressing `KeyR` in the
       * browser. For non-Beacon projects, returns 0.
       */
      resetRound(): number;
      /** Last asset ref the dev-time HMR pipeline reloaded into the running scene. Undefined until the first reload. */
      lastReloadedAsset?: string;
      /** Monotonic counter that increments every time `lastReloadedAsset` is updated. Useful for tests that need to wait for "another" reload. */
      reloadCount: number;
      /**
       * Append-only log of every HMR reload. Tests should poll this for the
       * ref they expect to see instead of reading `lastReloadedAsset`, which
       * can be overwritten between observation and assertion when multiple
       * HMR events fire in parallel.
       */
      reloadEvents: Array<{ ref: string; count: number }>;
      /**
       * Snapshot of the runtime diagnostics bus. Each entry has `severity`,
       * `code`, `source`, `message` and optional context fields. Tests can
       * assert no warnings/errors after startup; agents can read live state.
       */
      diagnostics(): ReadonlyArray<{
        readonly id: number;
        readonly emittedAtSeconds: number;
        readonly severity: "info" | "warning" | "error";
        readonly code: string;
        readonly source: string;
        readonly message: string;
        readonly entityId?: string;
        readonly component?: string;
        readonly assetRef?: string;
        readonly details?: Record<string, unknown>;
      }>;
      /** Drop retained diagnostics. Subscribers stay alive. */
      clearDiagnostics(): void;
      /**
       * Serialises the diagnostics snapshot to JSON and best-effort copies it
       * to the OS clipboard. Returns the JSON string either way.
       */
      copyDiagnostics(): Promise<string>;
      /** Persistence v0 — requires project.persistence.components on the project. */
      save(): Promise<unknown>;
      load(): Promise<unknown>;
      clearSave(): Promise<void>;
      /**
       * Snapshot of Three.js renderer resource counters. Useful for HMR
       * leak tests: take a baseline, reload assets N times, assert the
       * counts stay bounded.
       */
      rendererInfo(): {
        readonly geometries: number;
        readonly textures: number;
        readonly programs: number;
        readonly drawCalls: number;
        readonly triangles: number;
        readonly meshes: number;
      };
    };
  }
}

type LoadedProject = {
  project: ProjectMeta;
  scene: SceneInput;
  bootstrap: ProjectBootstrap;
};

/**
 * Registry of dynamic-import loaders, one per example project. Vite splits
 * each project into its own chunk so the production bundle only ships the
 * active project's systems / bootstrap / data.
 */
const projectLoaders: Record<string, () => Promise<LoadedProject>> = {
  "hello-3d": async () => {
    const [projectJson, sceneJson, bootstrap] = await Promise.all([
      import("../examples/hello-3d/project.json"),
      import("../examples/hello-3d/scenes/start.scene.json"),
      import("../examples/hello-3d/bootstrap")
    ]);
    return {
      project: projectJson.default as ProjectMeta,
      scene: sceneJson.default as unknown as SceneInput,
      bootstrap: bootstrap.hello3DBootstrap
    };
  },
  "beacon-world": async () => {
    const [projectJson, sceneJson, bootstrap] = await Promise.all([
      import("../examples/beacon-world/project.json"),
      import("../examples/beacon-world/scenes/start.scene.json"),
      import("../examples/beacon-world/bootstrap")
    ]);
    return {
      project: projectJson.default as ProjectMeta,
      scene: sceneJson.default as unknown as SceneInput,
      bootstrap: bootstrap.beaconWorldBootstrap
    };
  }
};

const availableProjectIds = Object.keys(projectLoaders);
const defaultProjectId = "hello-3d";

const params = new URLSearchParams(window.location.search);
const requested = params.get("project");
const selectedId =
  requested !== null && Object.prototype.hasOwnProperty.call(projectLoaders, requested)
    ? requested
    : defaultProjectId;

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root element.");
}

const requestedServer = params.get("server");
const requestedPlayerId = params.get("playerId");
const requestedNetworked = params.get("networked");
const requestedProfile = params.get("profile");

const baseAppOptions: Parameters<typeof createApp>[5] = {};
if (requestedServer !== null && requestedServer.length > 0) {
  baseAppOptions.serverUrl = requestedServer;
}
if (requestedPlayerId !== null && requestedPlayerId.length > 0) {
  baseAppOptions.playerId = requestedPlayerId;
}
if (requestedNetworked === "1" || requestedNetworked === "true") {
  baseAppOptions.networked = true;
}
if (requestedProfile !== null && requestedProfile.length > 0) {
  baseAppOptions.activeProfile = requestedProfile;
}

void (async (): Promise<void> => {
  const loader = projectLoaders[selectedId] ?? projectLoaders[defaultProjectId];
  if (loader === undefined) {
    throw new Error(`No loader registered for project "${selectedId}".`);
  }
  const loaded = await loader();

  let currentScene = loaded.scene;
  const appOptions: Parameters<typeof createApp>[5] = {
    ...baseAppOptions,
    bootstrap: loaded.bootstrap
  };

  let app: AppHandle = await createApp(
    root,
    loaded.project,
    currentScene,
    selectedId,
    availableProjectIds,
    appOptions
  );

  if (import.meta.env.DEV) {
    window.__agf = {
      snapshot: () => app.snapshot(),
      applyCommands: (commands) => app.applyCommands(commands),
      resetRound: () => app.resetRound(),
      diagnostics: () => app.diagnostics(),
      clearDiagnostics: () => app.clearDiagnostics(),
      copyDiagnostics: () => app.copyDiagnostics(),
      save: () => app.save(),
      load: () => app.load(),
      clearSave: () => app.clearSave(),
      rendererInfo: () => app.rendererInfo(),
      reloadCount: 0,
      reloadEvents: []
    };
    // Open the dev-bridge WS so an agent can curl /__agf/* against the dev
    // server without ever touching DevTools. Production builds drop this.
    const { mountPageBridge } = await import("../engine/dev/page-bridge");
    const activeProfile =
      requestedProfile ?? (requestedNetworked === "1" ? "connected" : "static");
    mountPageBridge({ projectId: selectedId, profile: activeProfile });
  }

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      app.dispose();
    });

    import.meta.hot.accept("./app", (module) => {
      const nextCreateApp = module?.["createApp"];
      if (typeof nextCreateApp !== "function") {
        return;
      }
      app.dispose();
      void (async (): Promise<void> => {
        app = await nextCreateApp(
          root,
          loaded.project,
          currentScene,
          selectedId,
          availableProjectIds,
          appOptions
        );
      })();
    });

    const applySceneUpdate = (module: unknown): void => {
      if (module === undefined) {
        return;
      }
      const nextScene = ((module as { default?: SceneInput }).default ?? (module as unknown as SceneInput));
      const commands = diffScenes(currentScene, nextScene);
      if (commands.length === 0) {
        return;
      }
      app.applyCommands(commands);
      currentScene = nextScene;
      console.info(`[agf] applied ${commands.length} command(s) from scene hot reload`);
    };

    if (selectedId === "hello-3d") {
      import.meta.hot.accept("../examples/hello-3d/scenes/start.scene.json", applySceneUpdate);
    } else if (selectedId === "beacon-world") {
      import.meta.hot.accept("../examples/beacon-world/scenes/start.scene.json", applySceneUpdate);
    }

    import.meta.hot.on("agf:asset-changed", (payload: unknown) => {
      if (typeof payload !== "object" || payload === null) {
        return;
      }
      const projectId = (payload as { projectId?: unknown }).projectId;
      const ref = (payload as { ref?: unknown }).ref;
      if (typeof projectId !== "string" || typeof ref !== "string") {
        return;
      }
      if (projectId !== selectedId) {
        return;
      }
      app.reloadAsset(ref);
      if (window.__agf !== undefined) {
        window.__agf.lastReloadedAsset = ref;
        window.__agf.reloadCount += 1;
        window.__agf.reloadEvents.push({ ref, count: window.__agf.reloadCount });
      }
      console.info(`[agf] hot-reloaded asset ${ref}`);
    });
  }
})();
