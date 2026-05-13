import "./styles.css";

import helloProjectData from "../examples/hello-3d/project.json";
import helloSceneData from "../examples/hello-3d/scenes/start.scene.json";
import beaconProjectData from "../examples/beacon-world/project.json";
import beaconSceneData from "../examples/beacon-world/scenes/start.scene.json";

import { createApp, type AppHandle, type ProjectMeta } from "./app";
import { diffScenes } from "../engine/core/commands/scene-diff";
import type { EngineCommand } from "../engine/core/commands/types";
import type { SceneInput } from "../engine/core/ecs/types";
import type { WorldSnapshot } from "../engine/runtime/inspect";

declare global {
  interface Window {
    __agf?: {
      snapshot(): WorldSnapshot;
      applyCommands(commands: ReadonlyArray<EngineCommand>): void;
      /** Last asset ref the dev-time HMR pipeline reloaded into the running scene. Undefined until the first reload. */
      lastReloadedAsset?: string;
      /** Monotonic counter that increments every time `lastReloadedAsset` is updated. Useful for tests that need to wait for "another" reload. */
      reloadCount: number;
    };
  }
}

type ProjectOption = {
  id: string;
  project: ProjectMeta;
  scene: SceneInput;
};

const projectOptions: Record<string, ProjectOption> = {
  "hello-3d": {
    id: "hello-3d",
    project: helloProjectData as ProjectMeta,
    scene: helloSceneData as unknown as SceneInput
  },
  "beacon-world": {
    id: "beacon-world",
    project: beaconProjectData as ProjectMeta,
    scene: beaconSceneData as unknown as SceneInput
  }
};

const availableProjectIds = Object.keys(projectOptions);
const defaultProjectId = "hello-3d";

const params = new URLSearchParams(window.location.search);
const requested = params.get("project");
const selectedId =
  requested !== null && Object.prototype.hasOwnProperty.call(projectOptions, requested)
    ? requested
    : defaultProjectId;
const selected = projectOptions[selectedId] ?? projectOptions[defaultProjectId]!;

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root element.");
}

let currentScene = selected.scene;

const requestedServer = params.get("server");
const requestedPlayerId = params.get("playerId");
const appOptions: Parameters<typeof createApp>[5] = {};
if (requestedServer !== null && requestedServer.length > 0) {
  appOptions.serverUrl = requestedServer;
}
if (requestedPlayerId !== null && requestedPlayerId.length > 0) {
  appOptions.playerId = requestedPlayerId;
}

let app: AppHandle = createApp(
  root,
  selected.project,
  currentScene,
  selected.id,
  availableProjectIds,
  appOptions
);

if (import.meta.env.DEV) {
  window.__agf = {
    snapshot: () => app.snapshot(),
    applyCommands: (commands) => app.applyCommands(commands),
    reloadCount: 0
  };
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
    app = nextCreateApp(
      root,
      selected.project,
      currentScene,
      selected.id,
      availableProjectIds,
      appOptions
    );
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

  if (selected.id === "hello-3d") {
    import.meta.hot.accept("../examples/hello-3d/scenes/start.scene.json", applySceneUpdate);
  } else if (selected.id === "beacon-world") {
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
    if (projectId !== selected.id) {
      return;
    }
    app.reloadAsset(ref);
    if (window.__agf !== undefined) {
      window.__agf.lastReloadedAsset = ref;
      window.__agf.reloadCount += 1;
    }
    console.info(`[agf] hot-reloaded asset ${ref}`);
  });
}
