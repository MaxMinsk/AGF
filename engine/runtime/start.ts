import type { SceneInput } from "../core/ecs/types";
import { World } from "../core/ecs/world";
import { advanceFixedStep } from "../core/loop/fixed-step";
import type { TimeContext } from "../core/loop/types";
import type { SystemScheduler } from "../core/systems/scheduler";
import { ThreeRenderer } from "../render/three-renderer";
import { createDevOverlay, type DevOverlayHandle } from "./dev-overlay";

export type FixedUpdateFn = (time: TimeContext, world: World) => void;

export type RuntimeOptions = {
  canvas: HTMLCanvasElement;
  scene: SceneInput;
  background?: string;
  /** Seconds per fixed step. Defaults to 1/60. */
  fixedDt?: number;
  fixedUpdate?: FixedUpdateFn;
  /** Optional scheduler whose systems run once per fixed step, before fixedUpdate. */
  scheduler?: SystemScheduler;
  /** Maximum fixed steps to run per render frame before dropping surplus time. */
  maxFixedStepsPerFrame?: number;
  /** Mounts the dev FPS overlay next to the canvas. */
  devOverlay?: boolean;
  /** Where to mount the dev overlay; defaults to canvas.parentElement. */
  devOverlayParent?: HTMLElement;
};

export type RuntimeHandle = {
  readonly world: World;
  readonly renderer: ThreeRenderer;
  readonly time: Readonly<TimeContext>;
  stop(): void;
};

const DEFAULT_FIXED_DT = 1 / 60;
const METRICS_WINDOW_SECONDS = 0.5;

export function startRuntime(options: RuntimeOptions): RuntimeHandle {
  const world = World.fromScene(options.scene);
  const renderer = new ThreeRenderer(world, options.canvas, options.background);

  const fixedDt = options.fixedDt ?? DEFAULT_FIXED_DT;
  const fixedUpdate = options.fixedUpdate;
  const scheduler = options.scheduler;
  const maxFixedStepsPerFrame = options.maxFixedStepsPerFrame;

  const time: TimeContext = {
    elapsed: 0,
    dt: 0,
    fixedDt,
    frameCount: 0,
    fixedStepCount: 0
  };

  let accumulator = 0;
  let lastTimestamp = -1;
  let frameRequestId = 0;
  let stopped = false;

  const overlay: DevOverlayHandle | undefined = options.devOverlay === true
    ? createDevOverlay(options.devOverlayParent ?? options.canvas.parentElement ?? document.body)
    : undefined;

  let metricsWindowStart = 0;
  let framesInWindow = 0;
  let fixedStepsInWindow = 0;

  const applyCanvasSize = (): void => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const bounds = options.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(bounds.width * ratio));
    const height = Math.max(1, Math.floor(bounds.height * ratio));
    renderer.resize(width, height);
  };

  const tick = (timestampMs: number): void => {
    if (stopped) {
      return;
    }

    const timestampSeconds = timestampMs / 1000;
    if (lastTimestamp < 0) {
      lastTimestamp = timestampSeconds;
      metricsWindowStart = timestampSeconds;
    }
    const frameDt = timestampSeconds - lastTimestamp;
    lastTimestamp = timestampSeconds;

    applyCanvasSize();

    const stepResult = advanceFixedStep(accumulator, frameDt, fixedDt, maxFixedStepsPerFrame);
    accumulator = stepResult.accumulator;

    if (stepResult.steps > 0 && (scheduler !== undefined || fixedUpdate !== undefined)) {
      const fixedTime: TimeContext = {
        elapsed: time.elapsed,
        dt: fixedDt,
        fixedDt,
        frameCount: time.frameCount,
        fixedStepCount: time.fixedStepCount
      };
      for (let step = 0; step < stepResult.steps; step += 1) {
        fixedTime.elapsed += fixedDt;
        fixedTime.fixedStepCount += 1;
        if (scheduler !== undefined) {
          scheduler.runFixedStep({ time: fixedTime, world });
        }
        if (fixedUpdate !== undefined) {
          fixedUpdate(fixedTime, world);
        }
      }
      time.elapsed = fixedTime.elapsed;
      time.fixedStepCount = fixedTime.fixedStepCount;
    } else {
      time.elapsed += frameDt;
    }

    time.dt = frameDt;
    time.frameCount += 1;

    renderer.render();

    framesInWindow += 1;
    fixedStepsInWindow += stepResult.steps;
    const windowElapsed = timestampSeconds - metricsWindowStart;
    if (overlay !== undefined && windowElapsed >= METRICS_WINDOW_SECONDS) {
      overlay.update({
        fps: framesInWindow / windowElapsed,
        fixedStepsPerSecond: fixedStepsInWindow / windowElapsed,
        entityCount: world.entityCount()
      });
      framesInWindow = 0;
      fixedStepsInWindow = 0;
      metricsWindowStart = timestampSeconds;
    }

    frameRequestId = window.requestAnimationFrame(tick);
  };

  window.addEventListener("resize", applyCanvasSize);
  applyCanvasSize();
  frameRequestId = window.requestAnimationFrame(tick);

  return {
    world,
    renderer,
    time,
    stop(): void {
      stopped = true;
      window.cancelAnimationFrame(frameRequestId);
      window.removeEventListener("resize", applyCanvasSize);
      overlay?.dispose();
      renderer.dispose();
    }
  };
}
