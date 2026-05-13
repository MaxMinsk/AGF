import type { SceneInput } from "../core/ecs/types";
import { World } from "../core/ecs/world";
import { ThreeRenderer } from "../render/three-renderer";

export type RuntimeOptions = {
  canvas: HTMLCanvasElement;
  scene: SceneInput;
  background?: string;
};

export type RuntimeHandle = {
  readonly world: World;
  readonly renderer: ThreeRenderer;
  stop(): void;
};

export function startRuntime(options: RuntimeOptions): RuntimeHandle {
  const world = World.fromScene(options.scene);
  const renderer = new ThreeRenderer(world, options.canvas, options.background);

  let frame = 0;
  let stopped = false;

  const applyCanvasSize = (): void => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const bounds = options.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(bounds.width * ratio));
    const height = Math.max(1, Math.floor(bounds.height * ratio));
    renderer.resize(width, height);
  };

  const tick = (): void => {
    if (stopped) {
      return;
    }
    applyCanvasSize();
    renderer.render();
    frame = window.requestAnimationFrame(tick);
  };

  window.addEventListener("resize", applyCanvasSize);
  applyCanvasSize();
  frame = window.requestAnimationFrame(tick);

  return {
    world,
    renderer,
    stop(): void {
      stopped = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", applyCanvasSize);
      renderer.dispose();
    }
  };
}
