import "./styles.css";
import { createApp, type AppHandle } from "./app";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root element.");
}

let app: AppHandle = createApp(root);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    app.dispose();
  });

  import.meta.hot.accept("./app", (module) => {
    const nextCreateApp = module?.["createApp"];

    if (!nextCreateApp) {
      return;
    }

    app.dispose();
    app = nextCreateApp(root);
  });
}
