import "./styles.css";
import projectData from "../examples/hello-3d/project.json";
import sceneData from "../examples/hello-3d/scenes/start.scene.json";
import { createApp, type AppHandle, type ProjectMeta } from "./app";
import { diffScenes } from "../engine/core/commands/scene-diff";
import type { SceneInput } from "../engine/core/ecs/types";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root element.");
}

const project = projectData as ProjectMeta;
let currentScene = sceneData as unknown as SceneInput;

let app: AppHandle = createApp(root, project, currentScene);

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
    app = nextCreateApp(root, project, currentScene);
  });

  import.meta.hot.accept("../examples/hello-3d/scenes/start.scene.json", (module) => {
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
  });
}
