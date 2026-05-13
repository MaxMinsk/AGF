import "./styles.css";
import projectData from "../examples/hello-3d/project.json";
import sceneData from "../examples/hello-3d/scenes/start.scene.json";
import { createApp, type AppHandle, type ProjectMeta } from "./app";
import type { SceneInput } from "../engine/core/ecs/types";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root element.");
}

const project = projectData as ProjectMeta;
const scene = sceneData as unknown as SceneInput;

let app: AppHandle = createApp(root, project, scene);

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
    app = nextCreateApp(root, project, scene);
  });
}
