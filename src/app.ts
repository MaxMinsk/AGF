import { startRuntime, type RuntimeHandle, type RuntimeOptions } from "../engine/runtime/start";
import { SystemScheduler } from "../engine/core/systems/scheduler";
import { createSpinSystem } from "../engine/core/systems/spin-system";
import type { EngineCommand } from "../engine/core/commands/types";
import type { SceneInput } from "../engine/core/ecs/types";

export type ProjectMeta = {
  name: string;
  render?: { background?: string };
};

export type AppHandle = {
  readonly canvas: HTMLCanvasElement;
  applyCommands(commands: ReadonlyArray<EngineCommand>): void;
  dispose(): void;
};

export function createApp(root: HTMLElement, project: ProjectMeta, scene: SceneInput): AppHandle {
  root.textContent = "";

  const shell = document.createElement("main");
  shell.className = "app-shell";

  const canvas = document.createElement("canvas");
  canvas.className = "engine-canvas";
  canvas.setAttribute("data-testid", "engine-canvas");

  const status = document.createElement("section");
  status.className = "status-panel";
  status.setAttribute("aria-label", "Engine status");
  status.innerHTML = `
    <h1 class="status-title">${project.name}</h1>
    <p class="status-copy">Three.js renderer running. Scene is loaded from JSON through the pragmatic ECS. Edit the scene file to hot-reload.</p>
  `;

  shell.append(canvas, status);
  root.append(shell);

  const scheduler = new SystemScheduler();
  scheduler.register(createSpinSystem());

  const runtimeOptions: RuntimeOptions = { canvas, scene, scheduler };
  const background = project.render?.background;
  if (background !== undefined) {
    runtimeOptions.background = background;
  }
  if (import.meta.env.DEV) {
    runtimeOptions.devOverlay = true;
    runtimeOptions.devOverlayParent = shell;
  }

  const runtime: RuntimeHandle = startRuntime(runtimeOptions);

  return {
    canvas,
    applyCommands(commands): void {
      runtime.applyCommands(commands);
    },
    dispose(): void {
      runtime.stop();
      root.textContent = "";
    }
  };
}
