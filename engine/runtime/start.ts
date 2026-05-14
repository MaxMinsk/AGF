import { applyCommand } from "../core/commands/command-queue";
import type { EngineCommand } from "../core/commands/types";
import type { SceneInput } from "../core/ecs/types";
import { World } from "../core/ecs/world";
import { advanceFixedStep } from "../core/loop/fixed-step";
import type { TimeContext } from "../core/loop/types";
import type { SystemScheduler } from "../core/systems/scheduler";
import type { ThreeRenderer } from "../render/three-renderer";
import type { AssetRegistry } from "./asset-registry";
import { createDevOverlay, type DevOverlayHandle } from "./dev-overlay";
import { createDiagnosticsBus, type DiagnosticsBus } from "./diagnostics/diagnostics-bus";
import { snapshotWorld, type WorldSnapshot } from "./inspect";
import { createRecorder, type Recording, type RecorderHandle } from "./recording/recorder";
import type { LocalStore } from "./persistence/local-store";
import {
  clearWorldSave,
  loadWorld,
  saveWorld,
  type SaveBlob,
  type SaveContext
} from "./persistence/save-load";

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
  /** Optional asset registry used by the renderer to resolve material/glb references. */
  assetRegistry?: AssetRegistry;
  /** Optional diagnostics bus shared across runtime systems. */
  diagnostics?: DiagnosticsBus;
  /**
   * Optional persistence config. When set, `RuntimeHandle.save/load/clearSave`
   * are wired to write through `store` using `context` (projectId + profile +
   * allowlist). Absent → save/load throw to make the missing wiring loud.
   */
  persistence?: {
    store: LocalStore;
    context: SaveContext;
    /** Save slot name. Defaults to "default". */
    slot?: string;
  };
};

export type RuntimeHandle = {
  readonly world: World;
  readonly renderer: ThreeRenderer;
  readonly time: Readonly<TimeContext>;
  readonly diagnostics: DiagnosticsBus;
  applyCommands(commands: ReadonlyArray<EngineCommand>): void;
  snapshot(): WorldSnapshot;
  /** Drop the cached load + renderer binding for an asset ref. Used by HMR. */
  invalidateAsset(ref: string): void;
  /**
   * Start capturing every applied command (and the current scene) so the
   * resulting `.replay.json` can drive a headless `engine replay` run.
   * Returns the active recorder so the caller can flush it at any time.
   */
  startRecording(projectId?: string): RecorderHandle;
  /** Finalise the active recording with a final snapshot. */
  stopRecording(): Recording | undefined;
  /**
   * Persistence v0. Requires `RuntimeOptions.persistence` at construction;
   * otherwise throws. Save = dump allowlisted components for every entity.
   * Load = re-apply allowlisted components to entities that already exist.
   * clearSave = drop the stored blob for this project/profile/slot.
   */
  save(): Promise<SaveBlob>;
  load(): Promise<{ blob: SaveBlob | undefined; restoredEntities: string[] }>;
  clearSave(): Promise<void>;
  stop(): void;
};

const DEFAULT_FIXED_DT = 1 / 60;
const METRICS_WINDOW_SECONDS = 0.5;

export async function startRuntime(options: RuntimeOptions): Promise<RuntimeHandle> {
  const world = World.fromScene(options.scene);
  const diagnostics = options.diagnostics ?? createDiagnosticsBus();
  const { ThreeRenderer } = await import("../render/three-renderer");
  const renderer = new ThreeRenderer(world, options.canvas, options.background, options.assetRegistry);

  const fixedDt = options.fixedDt ?? DEFAULT_FIXED_DT;
  const fixedUpdate = options.fixedUpdate;
  const scheduler = options.scheduler;
  const maxFixedStepsPerFrame = options.maxFixedStepsPerFrame;

  // Auto-register the M21-b TransformResolveSystem as the last frameUpdate
  // so it runs after any gameplay system that mutates Transform. Registration
  // is idempotent: callers that have already added it are not duplicated.
  if (scheduler !== undefined) {
    const { createTransformResolveSystem } = await import("../render/systems/transform-resolve-system");
    const ts = createTransformResolveSystem();
    if (!scheduler.has(ts.name)) {
      scheduler.register(ts);
    }
  }

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

    if (scheduler !== undefined) {
      scheduler.runFrame({ time, world });
    }

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

  let recorder: RecorderHandle | undefined;

  return {
    world,
    renderer,
    time,
    diagnostics,
    invalidateAsset(ref: string): void {
      options.assetRegistry?.invalidate(ref);
      renderer.forgetAssetBinding(ref);
    },
    applyCommands(commands: ReadonlyArray<EngineCommand>): void {
      for (const command of commands) {
        applyCommand(world, command);
      }
      recorder?.captureMany(commands);
    },
    snapshot(): WorldSnapshot {
      return snapshotWorld(world, time);
    },
    startRecording(projectId?: string): RecorderHandle {
      const recorderOptions: Parameters<typeof createRecorder>[0] = { scene: options.scene };
      if (projectId !== undefined) {
        recorderOptions.projectId = projectId;
      }
      recorder = createRecorder(recorderOptions);
      return recorder;
    },
    stopRecording(): Recording | undefined {
      if (recorder === undefined) {
        return undefined;
      }
      recorder.setFinalSnapshot(snapshotWorld(world, time));
      const out = recorder.toRecording();
      recorder = undefined;
      return out;
    },
    async save(): Promise<SaveBlob> {
      const config = requirePersistence(options.persistence);
      const key = persistenceKey(config);
      return saveWorld(world, config.store, key, config.context);
    },
    async load(): Promise<{ blob: SaveBlob | undefined; restoredEntities: string[] }> {
      const config = requirePersistence(options.persistence);
      const key = persistenceKey(config);
      return loadWorld(world, config.store, key, config.context);
    },
    async clearSave(): Promise<void> {
      const config = requirePersistence(options.persistence);
      await clearWorldSave(config.store, persistenceKey(config));
    },
    stop(): void {
      stopped = true;
      window.cancelAnimationFrame(frameRequestId);
      window.removeEventListener("resize", applyCanvasSize);
      overlay?.dispose();
      renderer.dispose();
    }
  };
}

function requirePersistence(
  persistence: RuntimeOptions["persistence"]
): NonNullable<RuntimeOptions["persistence"]> {
  if (persistence === undefined) {
    throw new Error(
      "RuntimeHandle.save/load/clearSave requires RuntimeOptions.persistence — pass a store + context at startRuntime()."
    );
  }
  return persistence;
}

function persistenceKey(config: NonNullable<RuntimeOptions["persistence"]>): string {
  const slot = config.slot ?? "default";
  return `agf/${config.context.projectId}/${config.context.profile}/${slot}`;
}
