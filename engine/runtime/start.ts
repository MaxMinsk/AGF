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
  /** M21-color: output color pipeline. Forwarded to the renderer adapter. */
  color?: {
    toneMapping?: "none" | "linear" | "reinhard" | "cineon" | "aces-filmic" | "agx";
    exposure?: number;
  };
  /** M21-shadow-algorithm: shadow-map filtering type. Defaults to PCF. */
  shadowAlgorithm?: "pcf" | "vsm" | "pcss";
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

/**
 * Window-averaged per-phase tick timings, in milliseconds. Sampled
 * once per metrics window (~500 ms today). Useful for agents to spot
 * "which phase to optimise next" — fixedUpdateMs spike → physics, etc.
 */
export type FrameTiming = {
  fixedUpdateMs: number;
  frameUpdateMs: number;
  renderMs: number;
  totalFrameMs: number;
  /** Frames the averages were computed over. 0 until the first window closes. */
  samples: number;
};

export type RuntimeHandle = {
  readonly world: World;
  readonly renderer: ThreeRenderer;
  readonly time: Readonly<TimeContext>;
  readonly diagnostics: DiagnosticsBus;
  applyCommands(commands: ReadonlyArray<EngineCommand>): void;
  snapshot(): WorldSnapshot;
  /**
   * Resolves after the first frame that actually rendered (active
   * camera acquired + `renderer.adapter.draw()` executed). Use this
   * in tests / dev-bridge clients before taking screenshots or
   * reading rendererInfo to avoid racing the boot sequence.
   */
  readonly rendererReady: Promise<void>;
  /** Window-averaged per-phase timings — see FrameTiming. */
  frameTiming(): FrameTiming;
  /**
   * M17-instance-picking: cast a ray from normalised screen
   * coordinates (`{ x: -1..1, y: -1..1 }`, y up) and return the
   * first picked entity + hit point/distance, or `undefined` if
   * nothing was hit. Resolves through the mesh-handle registry so
   * callers always see entity ids, never Three.js objects.
   */
  pick(spec: { x: number; y: number }): { entityId: string; point: readonly [number, number, number]; distance: number } | undefined;
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
  // M21-context-loss: route WebGL context events into the diagnostics
  // bus so agents + tests can observe them. Three.js auto-rebuilds GPU
  // resources on restore, so no further runtime action is needed today.
  const renderer = new ThreeRenderer(
    world,
    options.canvas,
    options.background,
    options.assetRegistry,
    {
      ...(options.color !== undefined ? { color: options.color } : {}),
      ...(options.shadowAlgorithm !== undefined ? { shadowAlgorithm: options.shadowAlgorithm } : {}),
      onContextLost: () => {
        diagnostics.emit({
          severity: "warning",
          code: "AGF_RENDER_CONTEXT_LOST",
          source: "renderer",
          message: "WebGL context lost. Renderer paused until the browser restores it; gameplay systems continue running."
        });
      },
      onContextRestored: () => {
        diagnostics.emit({
          severity: "info",
          code: "AGF_RENDER_CONTEXT_RESTORED",
          source: "renderer",
          message: "WebGL context restored. Three.js re-uploaded GPU resources; rendering resumes on the next frame."
        });
      }
    }
  );

  // M21-env-generated + M21-env-hdr + M21-env-cube: apply image-based-
  // lighting environment for PBR materials. Default = "generated"
  // (RoomEnvironment + PMREM). Scenes can opt into `{ kind: "none" }`
  // for fully unlit, `{ kind: "hdr", url, intensity? }` for an
  // equirectangular HDR sky, or `{ kind: "cube", faces, intensity? }`
  // for a 6-face cubemap. Both HDR and cube go through PMREMGenerator
  // so they supply IBL, not just a skybox.
  const envSpec = options.scene.environment;
  if (envSpec?.kind === "hdr") {
    renderer.adapter.setEnvironment({
      kind: "hdr",
      url: envSpec.url,
      ...(envSpec.intensity !== undefined ? { intensity: envSpec.intensity } : {})
    });
  } else if (envSpec?.kind === "cube") {
    renderer.adapter.setEnvironment({
      kind: "cube",
      faces: envSpec.faces,
      ...(envSpec.intensity !== undefined ? { intensity: envSpec.intensity } : {})
    });
  } else {
    renderer.adapter.setEnvironment(envSpec?.kind ?? "generated");
  }

  const fixedDt = options.fixedDt ?? DEFAULT_FIXED_DT;
  const fixedUpdate = options.fixedUpdate;
  const scheduler = options.scheduler;
  const maxFixedStepsPerFrame = options.maxFixedStepsPerFrame;

  // Auto-register renderer pipeline Systems at the *end* of the scheduler's
  // order. Both run after any gameplay system that mutates Transform or
  // Camera. Registration is idempotent: callers that have already added one
  // by name are skipped. Order matters: TransformResolveSystem produces
  // LocalToWorld before CameraSyncSystem (and future M21-d..f) read it.
  let materialBindingSystem: import("../render/systems/material-binding-system").MaterialBindingSystemHandle | undefined;
  if (scheduler !== undefined) {
    const { createTransformResolveSystem } = await import("../render/systems/transform-resolve-system");
    const { createCameraSyncSystem } = await import("../render/systems/camera-sync-system");
    const { createMeshLifecycleSystem } = await import("../render/systems/mesh-lifecycle-system");
    const { createMaterialBindingSystem } = await import("../render/systems/material-binding-system");
    const ts = createTransformResolveSystem();
    if (!scheduler.has(ts.name)) scheduler.register(ts);
    // M21-cam-orbit + M21-cam-follow: resolve camera helpers →
    // Transform BEFORE CameraSyncSystem so the active camera sees the
    // freshest pose. Order: orbit first (pure-data), follow second
    // (reads other entities' positions — may chain off an orbit camera).
    const { createOrbitCameraSystem } = await import("../render/systems/orbit-camera-system");
    const orbit = createOrbitCameraSystem();
    if (!scheduler.has(orbit.name)) scheduler.register(orbit);
    const { createFollowCameraSystem } = await import("../render/systems/follow-camera-system");
    const follow = createFollowCameraSystem();
    if (!scheduler.has(follow.name)) scheduler.register(follow);
    // M21-cam-cinematic: scripted camera waypoint playback. Runs in
    // frame-update before CameraSyncSystem so the cinematic writes land
    // on the active camera the same frame.
    const { createCinematicCameraSystem } = await import("../render/systems/cinematic-camera-system");
    const cinematic = createCinematicCameraSystem();
    if (!scheduler.has(cinematic.name)) scheduler.register(cinematic);
    // M19-tween: data-driven tween advance. Runs in fixed-update so the
    // same elapsed values reproduce across `engine replay`.
    const { createTweenSystem } = await import("../core/systems/tween-system");
    const tweens = createTweenSystem();
    if (!scheduler.has(tweens.name)) scheduler.register(tweens);
    // M19-waypoint-mover: generic position-along-path primitive. Sibling
    // of CinematicCamera but writes plain Transform + optionally faces
    // velocity. Runs in fixed-update.
    const { createWaypointMoverSystem } = await import("../core/systems/waypoint-mover-system");
    const waypointMover = createWaypointMoverSystem();
    if (!scheduler.has(waypointMover.name)) scheduler.register(waypointMover);
    // M19-particle-preset: emit + advance particles in a renderer-side
    // pool. Stays in frame-update (visual only, no gameplay impact).
    const { createParticleEmitterSystem } = await import("../render/systems/particle-emitter-system");
    const particles = createParticleEmitterSystem({ adapter: renderer.adapter });
    if (!scheduler.has(particles.name)) scheduler.register(particles);
    const cs = createCameraSyncSystem();
    if (!scheduler.has(cs.name)) scheduler.register(cs);
    // M17-lod: runs AFTER CameraSyncSystem (needs ActiveCamera) and
    // BEFORE MeshLifecycleSystem (writes MeshRenderer that
    // MeshLifecycleSystem picks up the same frame).
    const { createLodSelectionSystem } = await import("../render/systems/lod-selection-system");
    const lod = createLodSelectionSystem();
    if (!scheduler.has(lod.name)) scheduler.register(lod);
    const mls = createMeshLifecycleSystem(renderer.meshRegistry());
    if (!scheduler.has(mls.name)) scheduler.register(mls);
    const deps: Parameters<typeof createMaterialBindingSystem>[0] = {
      adapter: renderer.adapter,
      registry: renderer.meshRegistry(),
      assetRegistry: options.assetRegistry
    };
    materialBindingSystem = createMaterialBindingSystem(deps);
    if (!scheduler.has(materialBindingSystem.name)) {
      scheduler.register(materialBindingSystem);
      renderer.setMaterialBindingExternal(true);
    }
    const { createMeshTransformSyncSystem } = await import("../render/systems/mesh-transform-sync-system");
    const mts = createMeshTransformSyncSystem({
      adapter: renderer.adapter,
      registry: renderer.meshRegistry()
    });
    if (!scheduler.has(mts.name)) {
      scheduler.register(mts);
      renderer.setMeshTransformSyncExternal(true);
    }
    // M21-light-directional-point: own ECS Light entities. Runs after
    // TransformResolveSystem so LocalToWorld is fresh; transform sync of
    // lights happens inside this system (it's cheap — one Vec3 write per
    // light per frame).
    const { createLightLifecycleSystem } = await import("../render/systems/light-lifecycle-system");
    const lls = createLightLifecycleSystem({
      adapter: renderer.adapter,
      registry: renderer.lightRegistryHandle(),
      diagnostics
    });
    if (!scheduler.has(lls.name)) scheduler.register(lls);

    // M17-bucketer: collapse Batchable entities into InstancedMesh
    // buckets. Runs AFTER MeshLifecycleSystem so the registry already
    // ignored Batchable entities, and AFTER TransformResolveSystem so
    // LocalToWorld is available for per-instance matrices.
    const { createBatchingSystem } = await import("../render/systems/batching-system");
    const bs = createBatchingSystem({ adapter: renderer.adapter, diagnostics });
    if (!scheduler.has(bs.name)) scheduler.register(bs);
  }

  const time: TimeContext = {
    elapsed: 0,
    dt: 0,
    fixedDt,
    frameCount: 0,
    fixedStepCount: 0,
    physicsAlpha: 0
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
  // RUNTIME-renderer-ready: resolves once `renderer.render()` performed
  // an actual draw (i.e. CameraSyncSystem picked the active camera and
  // adapter.draw() ran). Tests + dev-bridge clients await this before
  // taking screenshots / reading rendererInfo to avoid racing boot.
  let rendererReadyResolve: (() => void) | undefined;
  const rendererReady = new Promise<void>((resolve) => {
    rendererReadyResolve = resolve;
  });
  let fixedStepsInWindow = 0;
  let fixedAccumMs = 0;
  let frameAccumMs = 0;
  let renderAccumMs = 0;
  let totalAccumMs = 0;
  let lastFrameTiming: FrameTiming = {
    fixedUpdateMs: 0,
    frameUpdateMs: 0,
    renderMs: 0,
    totalFrameMs: 0,
    samples: 0
  };

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

    const tickStart = performance.now();

    const stepResult = advanceFixedStep(accumulator, frameDt, fixedDt, maxFixedStepsPerFrame);
    accumulator = stepResult.accumulator;

    const fixedPhaseStart = performance.now();
    if (stepResult.steps > 0 && (scheduler !== undefined || fixedUpdate !== undefined)) {
      const fixedTime: TimeContext = {
        elapsed: time.elapsed,
        dt: fixedDt,
        fixedDt,
        frameCount: time.frameCount,
        fixedStepCount: time.fixedStepCount,
        physicsAlpha: 0
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
    const framePhaseStart = performance.now();
    fixedAccumMs += framePhaseStart - fixedPhaseStart;

    time.dt = frameDt;
    time.frameCount += 1;
    // M24-interpolation: expose the leftover accumulator fraction so
    // frame-update systems (PhysicsSyncSystem.frameUpdate) can blend
    // between the previous and current physics state.
    time.physicsAlpha = fixedDt > 0 ? Math.min(1, accumulator / fixedDt) : 0;

    if (scheduler !== undefined) {
      scheduler.runFrame({ time, world });
    }

    const renderPhaseStart = performance.now();
    frameAccumMs += renderPhaseStart - framePhaseStart;

    const drew = renderer.render();
    if (drew && rendererReadyResolve !== undefined) {
      rendererReadyResolve();
      rendererReadyResolve = undefined;
    }

    const tickEnd = performance.now();
    renderAccumMs += tickEnd - renderPhaseStart;
    totalAccumMs += tickEnd - tickStart;

    framesInWindow += 1;
    fixedStepsInWindow += stepResult.steps;
    const windowElapsed = timestampSeconds - metricsWindowStart;
    if (windowElapsed >= METRICS_WINDOW_SECONDS) {
      const sampleCount = framesInWindow;
      lastFrameTiming = {
        fixedUpdateMs: fixedAccumMs / sampleCount,
        frameUpdateMs: frameAccumMs / sampleCount,
        renderMs: renderAccumMs / sampleCount,
        totalFrameMs: totalAccumMs / sampleCount,
        samples: sampleCount
      };
      if (overlay !== undefined) {
        overlay.update({
          fps: framesInWindow / windowElapsed,
          fixedStepsPerSecond: fixedStepsInWindow / windowElapsed,
          entityCount: world.entityCount(),
          drawCalls: renderer.info().drawCalls,
          frameTiming: lastFrameTiming
        });
      }
      framesInWindow = 0;
      fixedStepsInWindow = 0;
      fixedAccumMs = 0;
      frameAccumMs = 0;
      renderAccumMs = 0;
      totalAccumMs = 0;
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
    rendererReady,
    invalidateAsset(ref: string): void {
      options.assetRegistry?.invalidate(ref);
      if (materialBindingSystem !== undefined) {
        materialBindingSystem.forgetAssetBinding(world, ref);
      } else {
        renderer.forgetAssetBinding(ref);
      }
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
    frameTiming(): FrameTiming {
      return lastFrameTiming;
    },
    pick(spec) {
      const hit = renderer.adapter.pickAtNdc(spec.x, spec.y);
      if (hit === undefined) return undefined;
      if (hit.kind === "mesh") {
        const entityId = renderer.meshRegistry().entityForHandle(hit.handle);
        if (entityId === undefined) return undefined;
        return { entityId, point: hit.point, distance: hit.distance };
      }
      // M17-instance-picking-buckets: resolve `(bucket, instance)` to
      // the EntityId by scanning entities carrying `BatchedMeshHandle`.
      // Both InstancedMesh and BatchedMesh members write the same
      // component shape `{ bucket, instance }` so one scan covers
      // both kinds. Cold path — picks are click-driven, not per-frame.
      // agf-allow: world.query
      for (const id of world.query(["BatchedMeshHandle"])) {
        const handle = world.getComponent<{ bucket: number; instance: number }>(
          id,
          "BatchedMeshHandle"
        );
        if (handle === undefined) continue;
        if (handle.bucket === hit.bucket && handle.instance === hit.instance) {
          return { entityId: id, point: hit.point, distance: hit.distance };
        }
      }
      return undefined;
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
