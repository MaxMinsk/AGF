import "./styles.css";

import { createApp, type AppHandle, type ProjectMeta } from "./app";
import { diffScenes } from "../engine/core/commands/scene-diff";
import type { ProjectBootstrap } from "../engine/runtime/project-bootstrap";
import type { EngineCommand } from "../engine/core/commands/types";
import type { SceneInput } from "../engine/core/ecs/types";
import type { PrefabDefinition } from "../engine/core/scene/expand-prefabs";
import type { WorldSnapshot } from "../engine/runtime/inspect";

// M3-c-load: eager-imported prefab manifests for every example project. Vite
// resolves `import.meta.glob` at build time, so projects without any
// `prefabs/` directory simply produce no matching keys.
const ALL_PROJECT_PREFABS = import.meta.glob<{ default: PrefabDefinition }>(
  "../examples/*/prefabs/*.prefab.json",
  { eager: true }
);

function loadPrefabsForProject(projectId: string): ReadonlyMap<string, PrefabDefinition> {
  const registry = new Map<string, PrefabDefinition>();
  const prefix = `../examples/${projectId}/prefabs/`;
  for (const [path, mod] of Object.entries(ALL_PROJECT_PREFABS)) {
    if (!path.startsWith(prefix)) continue;
    const def = mod.default;
    registry.set(def.id, def);
  }
  return registry;
}

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
       * Subscribe to live diagnostic emissions. Used by the dev-bridge SSE
       * stream to fan diagnostics out to subscribed agents.
       */
      subscribeDiagnostics(
        listener: (diagnostic: {
          readonly id: number;
          readonly emittedAtSeconds: number;
          readonly severity: "info" | "warning" | "error";
          readonly code: string;
          readonly source: string;
          readonly message: string;
        }) => void
      ): () => void;
      /**
       * Serialises the diagnostics snapshot to JSON and best-effort copies it
       * to the OS clipboard. Returns the JSON string either way.
       */
      copyDiagnostics(): Promise<string>;
      /** Persistence v0 — requires project.persistence.components on the project. */
      save(): Promise<unknown>;
      load(): Promise<unknown>;
      clearSave(): Promise<void>;
      /** Recording v0 — used by the dev-bridge /__agf/recording/* routes. */
      startRecording(): unknown;
      stopRecording(): unknown;
      /** Trigger an asset HMR reload from the dev bridge. */
      reloadAsset(ref: string): void;
      /**
       * Snapshot of Three.js renderer resource counters. Useful for HMR
       * leak tests: take a baseline, reload assets N times, assert the
       * counts stay bounded.
       */
      /**
       * RUNTIME-renderer-ready: resolves once the first successful
       * frame draw completes. `await window.__agf.rendererReady` before
       * taking screenshots or probing `rendererInfo()` to avoid
       * racing the boot sequence.
       */
      rendererReady: Promise<void>;
      /**
       * M17-instance-picking: cast a ray from normalised screen
       * coords (x, y in [-1, 1], y up). Returns the first picked
       * entity + hit point/distance, or undefined for empty rays.
       * Useful for click-to-select, hover overlays, etc.
       */
      pick(spec: { x: number; y: number }):
        | { readonly entityId: string; readonly point: readonly [number, number, number]; readonly distance: number }
        | undefined;
      rendererInfo(): {
        readonly geometries: number;
        readonly textures: number;
        readonly programs: number;
        readonly drawCalls: number;
        readonly triangles: number;
        readonly meshes: number;
        readonly lights: number;
        readonly shadowCasters: number;
        readonly buckets: number;
        readonly bucketInstances: number;
        readonly batchedBuckets: number;
        readonly batchedBucketInstances: number;
        readonly handleLeak: number;
        /** S54 RUNTIME-gpu-timing: GPU-side frame ms when `EXT_disjoint_timer_query_webgl2` is supported; undefined otherwise. */
        readonly gpuMs?: number;
      };
      /**
       * M21-frame-timing — window-averaged per-phase tick timings in
       * milliseconds. `samples` is the frame count the window was
       * averaged over (0 until the first window closes).
       */
      frameTiming(): {
        readonly fixedUpdateMs: number;
        readonly frameUpdateMs: number;
        readonly renderMs: number;
        readonly totalFrameMs: number;
        readonly samples: number;
      };
      /**
       * M21-shadow-static — manual shadow-map controls. `invalidateShadowMap()`
       * forces one re-render on the next frame; useful when `project.render.shadows.autoUpdate`
       * is false and a static caster has moved.
       */
      renderer: {
        invalidateShadowMap(): void;
        setShadowMapAutoUpdate(enabled: boolean): void;
      };
      /**
       * Physics query + debug controls. Undefined when the active
       * project did not opt into `physics.enabled`.
       */
      physics?: {
        setDebugOverlay(enabled: boolean): void;
        isDebugOverlayEnabled(): boolean;
        raycast(spec: {
          origin: ReadonlyArray<number>;
          direction: ReadonlyArray<number>;
          maxDistance: number;
        }):
          | {
              readonly entityId: string;
              readonly distance: number;
              readonly point: readonly [number, number, number];
              readonly normal: readonly [number, number, number];
            }
          | undefined;
      };
      /**
       * M23-tuner — agent-spawnable sliders bound to component fields.
       * See `engine/runtime/dev-tuner.ts` and `docs/agent/dev-tuner.md`.
       */
      dev?: {
        readonly tuner: {
          add(spec: {
            name: string;
            target: { entityId: string; component: string; path?: string };
            min: number;
            max: number;
            step?: number;
            value?: number;
            label?: string;
          }): void;
          remove(name: string): void;
          removeAll(): void;
          list(): ReadonlyArray<{
            readonly name: string;
            readonly target: { entityId: string; component: string; path?: string };
            readonly value: number;
          }>;
        };
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
  },
  "batch-bench": async () => {
    const [projectJson, sceneJson, bootstrap] = await Promise.all([
      import("../examples/batch-bench/project.json"),
      import("../examples/batch-bench/scenes/start.scene.json"),
      import("../examples/batch-bench/bootstrap")
    ]);
    return {
      project: projectJson.default as ProjectMeta,
      scene: sceneJson.default as unknown as SceneInput,
      bootstrap: bootstrap.batchBenchBootstrap
    };
  },
  "physics-bench": async () => {
    const [projectJson, sceneJson, bootstrap] = await Promise.all([
      import("../examples/physics-bench/project.json"),
      import("../examples/physics-bench/scenes/start.scene.json"),
      import("../examples/physics-bench/bootstrap")
    ]);
    return {
      project: projectJson.default as ProjectMeta,
      scene: sceneJson.default as unknown as SceneInput,
      bootstrap: bootstrap.physicsBenchBootstrap
    };
  },
  "shadows-bench": async () => {
    const [projectJson, sceneJson, bootstrap] = await Promise.all([
      import("../examples/shadows-bench/project.json"),
      import("../examples/shadows-bench/scenes/start.scene.json"),
      import("../examples/shadows-bench/bootstrap")
    ]);
    return {
      project: projectJson.default as ProjectMeta,
      scene: sceneJson.default as unknown as SceneInput,
      bootstrap: bootstrap.shadowsBenchBootstrap
    };
  },
  "material-bench": async () => {
    const [projectJson, sceneJson, bootstrap] = await Promise.all([
      import("../examples/material-bench/project.json"),
      import("../examples/material-bench/scenes/start.scene.json"),
      import("../examples/material-bench/bootstrap")
    ]);
    return {
      project: projectJson.default as ProjectMeta,
      scene: sceneJson.default as unknown as SceneInput,
      bootstrap: bootstrap.materialBenchBootstrap
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
  const projectPrefabs = loadPrefabsForProject(selectedId);
  const appOptions: Parameters<typeof createApp>[5] = {
    ...baseAppOptions,
    bootstrap: loaded.bootstrap
  };
  if (projectPrefabs.size > 0) {
    appOptions.prefabs = projectPrefabs;
  }

  let app: AppHandle = await createApp(
    root,
    loaded.project,
    currentScene,
    selectedId,
    availableProjectIds,
    appOptions
  );

  if (import.meta.env.DEV) {
    const { createDevTuner } = await import("../engine/runtime/dev-tuner");
    const tuner = createDevTuner({
      world: app.world,
      applyCommands: (commands) => app.applyCommands(commands)
    });
    window.__agf = {
      snapshot: () => app.snapshot(),
      applyCommands: (commands) => app.applyCommands(commands),
      resetRound: () => app.resetRound(),
      diagnostics: () => app.diagnostics(),
      clearDiagnostics: () => app.clearDiagnostics(),
      subscribeDiagnostics: (listener) => app.subscribeDiagnostics(listener),
      copyDiagnostics: () => app.copyDiagnostics(),
      save: () => app.save(),
      load: () => app.load(),
      clearSave: () => app.clearSave(),
      startRecording: () => app.startRecording(),
      stopRecording: () => app.stopRecording(),
      reloadAsset: (ref) => app.reloadAsset(ref),
      rendererReady: app.rendererReady,
      pick: (spec) => app.pick(spec),
      rendererInfo: () => app.rendererInfo(),
      frameTiming: () => app.frameTiming(),
      renderer: app.renderer,
      ...(app.physics !== undefined ? { physics: app.physics } : {}),
      reloadCount: 0,
      reloadEvents: [],
      dev: { tuner }
    };
    // M24-debug: `?physicsDebug=1` boots the project with the collider
    // overlay already on. Programmatic toggling via __agf.physics.* keeps
    // working either way.
    const requestedPhysicsDebug = params.get("physicsDebug");
    if (
      app.physics !== undefined &&
      (requestedPhysicsDebug === "1" || requestedPhysicsDebug === "true")
    ) {
      app.physics.setDebugOverlay(true);
    }
    // Open the dev-bridge WS so an agent can curl /__agf/* against the dev
    // server without ever touching DevTools. Production builds drop this.
    const { mountPageBridge } = await import("../engine/dev/page-bridge");
    const activeProfile =
      requestedProfile ?? (requestedNetworked === "1" ? "connected" : "static");
    const bridgeOptions: Parameters<typeof mountPageBridge>[0] = {
      projectId: selectedId,
      profile: activeProfile
    };
    if (requestedPlayerId !== null && requestedPlayerId.length > 0) {
      bridgeOptions.playerId = requestedPlayerId;
    }
    mountPageBridge(bridgeOptions);
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
