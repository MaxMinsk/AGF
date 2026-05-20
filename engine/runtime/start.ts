import { applyCommand } from "../core/commands/command-queue";
import type { EngineCommand } from "../core/commands/types";
import type { SceneInput } from "../core/ecs/types";
import { World } from "../core/ecs/world";
import { expandScenePrefabs, type PrefabDefinition } from "../core/scene/expand-prefabs";
import { advanceFixedStep } from "../core/loop/fixed-step";
import type { TimeContext } from "../core/loop/types";
import type { SystemScheduler } from "../core/systems/scheduler";
import type { ThreeRenderer } from "../render/three-renderer";
import type { AssetRegistry } from "./asset-registry";
import { createDevOverlay, type DevOverlayHandle } from "./dev-overlay";
import { createHud, type HudHandle } from "./ui/hud";
import { createAudioBus } from "./audio/audio-bus";
import { createFrameSpikeGate } from "./frame-spike-gate";
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
  /** S52 POLISH-shadows-bench-sky: vertical gradient skybox; overrides `background` when present. */
  skyGradient?: { top: string; bottom: string };
  /** M21-color: output color pipeline. Forwarded to the renderer adapter. */
  color?: {
    toneMapping?: "none" | "linear" | "reinhard" | "cineon" | "aces-filmic" | "agx";
    exposure?: number;
    transmissionResolutionScale?: number;
  };
  /** M21-shadow-algorithm: shadow-map filtering type. Defaults to PCF. */
  shadowAlgorithm?: "pcf" | "vsm" | "pcss";
  /**
   * S61 RENDER-mode. `"webgl"` (default) creates a `WebGLRenderer`;
   * `"webgpu"` creates `WebGPURenderer` from `three/webgpu`. The runtime
   * awaits `adapter.init()` before the first frame either way (no-op on
   * webgl, async on webgpu).
   */
  rendererMode?: "webgl" | "webgpu";
  /**
   * S50 auto-batch: when true, BatchingSystem treats every entity with a
   * built-in primitive mesh as Batchable without an explicit tag. Per-
   * entity opt-out via `Batchable: { enabled: false }`. Defaults to false.
   */
  autoBatchPrimitives?: boolean;
  /**
   * S51 default bucket path. `"instanced"` (default) uses InstancedMesh
   * per (mesh + material + shadow + group). `"batched"` uses BatchedMesh
   * (per-instance frustum culling) per (material + shadow + group).
   */
  batchingPath?: "instanced" | "batched" | "batched-bvh";
  /**
   * S54 RUNTIME-idle-rendering. `"always"` (default) calls renderer.render()
   * every animation frame. `"on-demand"` skips the call when the world's
   * mutation counter is unchanged from the previous frame. First frame +
   * every resize always render; toggling the mode at runtime is not
   * supported (decided once at boot).
   */
  idleMode?: "always" | "on-demand";
  /**
   * S54 RUNTIME-progressive-loading: list of asset refs (e.g.
   * `runtime/materials/hero.material.json`, `runtime/models/hero.glb`)
   * that must finish loading before `rendererReady` resolves. Every other
   * asset stays on the existing placeholder-then-swap path. Empty / omitted
   * → no critical gate, identical to S53 behaviour.
   */
  criticalAssets?: ReadonlyArray<string>;
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
  /** S86 AGF-FRAME-TIMING-SPIKE-DIAGNOSTIC. Single-frame total-ms threshold above which the runtime emits an AGF_FRAME_SPIKE warning. Default 50 ms. Set to 0 to disable the gate. */
  spikeMs?: number;
  /**
   * S88 AGF-PARTICLE-PREWARM-SYSTEM. Preset names whose ParticleEmitter
   * shaders the engine should warm up on boot — one offscreen pool per
   * preset is acquired then released after a few frames so a real
   * gameplay emit doesn't pay the shader-compile cost. Defaults to
   * empty (no warmup).
   */
  particlePreWarmPresets?: ReadonlyArray<string>;
  /** Minimum gap (ms) between consecutive AGF_FRAME_SPIKE emissions. Default 1000 ms. */
  spikeCooldownMs?: number;
  /**
   * M3-c-load: optional prefab registry. When set, `scene.instances` are
   * expanded into entities before `World.fromScene`. Unknown prefab refs
   * + duplicate ids surface as `AGF_SCENE_INSTANCE_PREFAB_MISSING` /
   * `AGF_SCENE_INSTANCE_DUPLICATE_ID` diagnostics.
   */
  prefabs?: ReadonlyMap<string, PrefabDefinition>;
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
  /** S81 KABOOM-HUD-RUNTIME: 2D DOM HUD overlay primitive. Lives in `engine/runtime/ui/hud.ts`; project code reaches it through this handle. */
  readonly hud: HudHandle;
  /** S84 AGF-AUDIO-PRIMITIVE: tiny HTMLAudio-backed SFX surface. `undefined` in SSR / no-DOM contexts. */
  readonly audio: import("./audio/audio-bus").AudioBus | undefined;
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
  /**
   * S89 AGF-RUNTIME-DEBUG-SYSTEM-TOGGLE. Flip per-tick debug
   * tracing for a registered system. While enabled, the scheduler
   * emits an info-level `AGF_SYSTEM_TICK { name, tick, phase }`
   * diagnostic on every fixedUpdate/frameUpdate pass. Returns true
   * when the toggle landed, false when no system matches the name.
   */
  setDebugSystem(name: string, enabled: boolean): boolean;
  /**
   * S90 AGF-RUNTIME-TIME-SCALE. Engine-level slow-mo / fast-forward.
   * The loop multiplies the real wallclock `dt` by this scale before
   * any system tick — fixed-step accumulator scales identically so
   * deterministic systems run on the same simulated clock at a
   * different tempo. Clamped to [0.05, 4]; values outside the range
   * are coerced + the clamped value is returned. Default 1.
   */
  setTimeScale(scale: number): number;
  /** S90 AGF-RUNTIME-TIME-SCALE. Current time-scale value. */
  getTimeScale(): number;
  stop(): void;
};

const MIN_TIME_SCALE = 0.05;
const MAX_TIME_SCALE = 4;
export function clampTimeScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  if (value < MIN_TIME_SCALE) return MIN_TIME_SCALE;
  if (value > MAX_TIME_SCALE) return MAX_TIME_SCALE;
  return value;
}

const DEFAULT_FIXED_DT = 1 / 60;
const METRICS_WINDOW_SECONDS = 0.5;

// S54 RUNTIME-progressive-loading: returns true once every critical asset
// has reached `applied` or `failed` — anything still `pending` blocks the
// `rendererReady` promise so dev-bridge / tests don't race the loader.
// Walks AppliedMaterialRef + AppliedGeometryRef each call; cheap for the
// handful of refs an agent will ever flag critical.
export function criticalAssetsReady(
  world: World,
  criticalAssets: ReadonlyArray<string>
): boolean {
  if (criticalAssets.length === 0) return true;
  const pending = new Set(criticalAssets);
  // agf-allow: world.query — diagnostic gate, fires once per frame only
  // until rendererReady resolves.
  for (const id of world.query(["AppliedMaterialRef"])) {
    const applied = world.getComponent<{ ref: string; status: string }>(id, "AppliedMaterialRef");
    if (applied === undefined) continue;
    if (applied.status === "pending") continue;
    pending.delete(applied.ref);
  }
  for (const id of world.query(["AppliedGeometryRef"])) {
    const applied = world.getComponent<{ ref: string; status: string }>(id, "AppliedGeometryRef");
    if (applied === undefined) continue;
    if (applied.status === "pending") continue;
    pending.delete(applied.ref);
  }
  return pending.size === 0;
}

export async function startRuntime(options: RuntimeOptions): Promise<RuntimeHandle> {
  const diagnostics = options.diagnostics ?? createDiagnosticsBus();
  // M3-c-load: expand `scene.instances` into flat entities via the prefab
  // registry before building the world. With no instances declared, the
  // expansion is a no-op clone; with instances and no registry, we still
  // expand against an empty registry so every reference surfaces as a
  // diagnostic instead of silently dropping the entity.
  const flatScene = (() => {
    if (
      options.scene.instances === undefined ||
      options.scene.instances.length === 0
    ) {
      return options.scene;
    }
    const registry = options.prefabs ?? new Map<string, PrefabDefinition>();
    const expansion = expandScenePrefabs(options.scene, registry);
    for (const diagnostic of expansion.diagnostics) {
      diagnostics.emit({
        severity: diagnostic.severity,
        code: diagnostic.code,
        source: "scene-loader",
        message: diagnostic.message,
        details: { instanceIndex: diagnostic.instanceIndex }
      });
    }
    return expansion.scene;
  })();
  const world = World.fromScene(flatScene);
  const { ThreeRenderer } = await import("../render/three-renderer");
  // M21-context-loss: route WebGL context events into the diagnostics
  // bus so agents + tests can observe them. Three.js auto-rebuilds GPU
  // resources on restore, so no further runtime action is needed today.
  // S61 WEBGPU-init-async. WebGPU mode needs the GPUAdapter / GPUDevice
  // request to settle before the first frame can draw. Awaiting here keeps
  // the rest of the start sequence synchronous — the WebGL path returns
  // immediately because its `init()` resolves synchronously.
  const renderer = new ThreeRenderer(
    world,
    options.canvas,
    options.background,
    options.assetRegistry,
    {
      ...(options.color !== undefined ? { color: options.color } : {}),
      ...(options.shadowAlgorithm !== undefined ? { shadowAlgorithm: options.shadowAlgorithm } : {}),
      ...(options.skyGradient !== undefined ? { skyGradient: options.skyGradient } : {}),
      ...(options.rendererMode !== undefined ? { mode: options.rendererMode } : {}),
      // S84 AGF-LOG-RENDERER-DIAGNOSTICS-WIRE — thread the runtime bus so the
      // adapter can emit structured `AGF_RENDER_*` events instead of console.warn.
      diagnostics,
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
  await renderer.adapter.init();

  // M21-env-generated + M21-env-hdr + M21-env-cube: apply image-based-
  // lighting environment for PBR materials. Default = "generated"
  // (RoomEnvironment + PMREM). Scenes can opt into `{ kind: "none" }`
  // for fully unlit, `{ kind: "hdr", url, intensity? }` for an
  // equirectangular HDR sky, or `{ kind: "cube", faces, intensity? }`
  // for a 6-face cubemap. Both HDR and cube go through PMREMGenerator
  // so they supply IBL, not just a skybox.
  const envSpec = flatScene.environment;
  // Environment URLs in scenes are project-relative (same shape as
  // material refs). Resolve through the asset registry so they hit the
  // project's assetRoot — RGBELoader / CubeTextureLoader would
  // otherwise resolve against the document URL.
  const resolveEnvUrl = (ref: string): string =>
    options.assetRegistry !== undefined ? options.assetRegistry.urlFor(ref) : ref;
  if (envSpec?.kind === "hdr") {
    renderer.adapter.setEnvironment({
      kind: "hdr",
      url: resolveEnvUrl(envSpec.url),
      ...(envSpec.intensity !== undefined ? { intensity: envSpec.intensity } : {}),
      ...(envSpec.asBackground !== undefined ? { asBackground: envSpec.asBackground } : {}),
      ...(envSpec.backgroundBlurriness !== undefined
        ? { backgroundBlurriness: envSpec.backgroundBlurriness }
        : {}),
      ...(envSpec.groundedSkybox !== undefined ? { groundedSkybox: envSpec.groundedSkybox } : {})
    });
  } else if (envSpec?.kind === "cube") {
    const [f0, f1, f2, f3, f4, f5] = envSpec.faces;
    const resolvedFaces: readonly [string, string, string, string, string, string] = [
      resolveEnvUrl(f0),
      resolveEnvUrl(f1),
      resolveEnvUrl(f2),
      resolveEnvUrl(f3),
      resolveEnvUrl(f4),
      resolveEnvUrl(f5)
    ];
    renderer.adapter.setEnvironment({
      kind: "cube",
      faces: resolvedFaces,
      ...(envSpec.intensity !== undefined ? { intensity: envSpec.intensity } : {}),
      ...(envSpec.asBackground !== undefined ? { asBackground: envSpec.asBackground } : {}),
      ...(envSpec.backgroundBlurriness !== undefined
        ? { backgroundBlurriness: envSpec.backgroundBlurriness }
        : {}),
      ...(envSpec.groundedSkybox !== undefined ? { groundedSkybox: envSpec.groundedSkybox } : {})
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
    const particles = createParticleEmitterSystem({
      adapter: renderer.adapter,
      ...(options.particlePreWarmPresets !== undefined ? { preWarmPresets: options.particlePreWarmPresets } : {})
    });
    if (!scheduler.has(particles.name)) scheduler.register(particles);
    const cs = createCameraSyncSystem();
    if (!scheduler.has(cs.name)) scheduler.register(cs);
    // M17-lod: runs AFTER CameraSyncSystem (needs ActiveCamera) and
    // BEFORE MeshLifecycleSystem (writes MeshRenderer that
    // MeshLifecycleSystem picks up the same frame).
    const { createLodSelectionSystem } = await import("../render/systems/lod-selection-system");
    const lod = createLodSelectionSystem();
    if (!scheduler.has(lod.name)) scheduler.register(lod);
    // S50: BatchingSystem runs BEFORE MeshLifecycleSystem so that on each
    // frame the bucket reservation + BatchedMeshHandle write happen
    // first. MeshLifecycle then sees `BatchedMeshHandle` on auto-batched
    // entities and skips them — no double-rendering as a single Mesh.
    const { createBatchingSystem } = await import("../render/systems/batching-system");
    const batchingOptions: Parameters<typeof createBatchingSystem>[1] = {};
    if (options.autoBatchPrimitives === true) batchingOptions.autoIncludePrimitives = true;
    if (options.batchingPath !== undefined) batchingOptions.defaultPath = options.batchingPath;
    const bs = createBatchingSystem(
      {
        adapter: renderer.adapter,
        diagnostics,
        ...(options.assetRegistry !== undefined ? { assetRegistry: options.assetRegistry } : {})
      },
      batchingOptions
    );
    if (!scheduler.has(bs.name)) scheduler.register(bs);
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

    // S52 M21-shadow-static-caster-tag: dormant unless the scene
    // marks at least one entity as `ShadowCaster { dynamic: true }`.
    // Runs LAST so LocalToWorld is fresh from TransformResolveSystem.
    const { createDynamicShadowSystem } = await import("../render/systems/dynamic-shadow-system");
    const dss = createDynamicShadowSystem({ adapter: renderer.adapter });
    if (!scheduler.has(dss.name)) scheduler.register(dss);

    // S57 REFLECTION-cube-probe: each frame, render the scene into the
    // probe's CubeRenderTarget + bind the resulting texture as envMap
    // on every entity tagged `EnvmapBinding { probe }`. Dormant when no
    // scene declares a `ReflectionProbe`.
    const { createReflectionProbeSystem } = await import("../render/systems/reflection-probe-system");
    const rps = createReflectionProbeSystem({
      adapter: renderer.adapter,
      registry: renderer.meshRegistry()
    });
    if (!scheduler.has(rps.name)) scheduler.register(rps);

    // S59 REFLECTION-planar: drives every `PlanarMirror` entity by
    // acquiring + transform-syncing a three.js `Reflector` mesh per
    // probe. Reflector renders the scene through its plane internally
    // on every WebGLRenderer.render() call.
    const { createPlanarMirrorSystem } = await import("../render/systems/planar-mirror-system");
    const pms = createPlanarMirrorSystem({ adapter: renderer.adapter });
    if (!scheduler.has(pms.name)) scheduler.register(pms);
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
  // S90 AGF-RUNTIME-TIME-SCALE. Mutable engine-level time-scale.
  // Multiplied into the per-tick dt before any system runs.
  let timeScale = 1;
  let frameRequestId = 0;
  let stopped = false;

  const overlay: DevOverlayHandle | undefined = options.devOverlay === true
    ? createDevOverlay(options.devOverlayParent ?? options.canvas.parentElement ?? document.body)
    : undefined;

  // S81 KABOOM-HUD-RUNTIME. The HUD root sits next to the canvas just
  // like the dev overlay so its slots overlay the canvas viewport. A
  // single root is mounted unconditionally — projects opt out simply
  // by not calling `runtime.hud.add` (DOM cost is one empty <div>).
  const hud: HudHandle = createHud(options.canvas.parentElement ?? document.body);
  // S84 AGF-AUDIO-PRIMITIVE. Project code reaches the bus via
  // `runtime.audio`. Returns undefined on no-DOM hosts, in which
  // case projects branch with `runtime.audio?.play(...)`.
  const audio = createAudioBus(options.canvas.parentElement ?? document.body);

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
  // S86 AGF-FRAME-TIMING-SPIKE-DIAGNOSTIC + S87 AGF-FRAME-SPIKE-UNIT-TEST.
  // Defaults: 50 ms threshold, 1 s cooldown. spikeMs=0 disables.
  const spikeGate = createFrameSpikeGate({
    spikeMs: options.spikeMs ?? 50,
    cooldownMs: options.spikeCooldownMs ?? 1000
  });
  const spikeMs = options.spikeMs ?? 50;

  let lastFrameTiming: FrameTiming = {
    fixedUpdateMs: 0,
    frameUpdateMs: 0,
    renderMs: 0,
    totalFrameMs: 0,
    samples: 0
  };

  const idleMode: "always" | "on-demand" = options.idleMode ?? "always";
  const criticalAssets: ReadonlyArray<string> = options.criticalAssets ?? [];
  let lastRenderedMutation = -1;
  // The resize handler bumps this so the next frame re-renders even when
  // the world hasn't changed (viewport may have, e.g. window resize).
  let forceRenderNextFrame = false;

  // S60 WEBGL-stutter-investigation. Cache the last applied buffer size so
  // the per-frame `applyCanvasSize()` call short-circuits when the canvas
  // hasn't changed. Before this, every frame called `renderer.resize()` +
  // `composer.setSize()` + `camera.updateProjectionMatrix()` even on a
  // perfectly static layout, which interleaves with the compositor and
  // produces ~3 % of frames missing the 60 Hz vsync window on a scene that
  // otherwise consumes <0.5 ms of JS per frame.
  let lastCanvasWidth = 0;
  let lastCanvasHeight = 0;
  const applyCanvasSize = (): void => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const bounds = options.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(bounds.width * ratio));
    const height = Math.max(1, Math.floor(bounds.height * ratio));
    if (width === lastCanvasWidth && height === lastCanvasHeight) return;
    lastCanvasWidth = width;
    lastCanvasHeight = height;
    renderer.resize(width, height);
    forceRenderNextFrame = true;
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
    // S90 AGF-RUNTIME-TIME-SCALE. The wallclock dt drives the loop;
    // multiplying by timeScale (default 1) here scales everything
    // downstream — the fixed-step accumulator + per-frame dt — so a
    // 0.5 scale is half-speed for every system, including deterministic
    // fixed-step ones.
    const wallDt = timestampSeconds - lastTimestamp;
    const frameDt = wallDt * timeScale;
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

    // S54 RUNTIME-idle-rendering. In `on-demand` mode the runtime skips
    // `renderer.render()` for frames where no ECS mutation fired. First
    // frame after boot + every window resize + every frame any system
    // wrote ECS state always render.
    const currentMutation = world.mutationCounter();
    const idleSkip =
      idleMode === "on-demand" &&
      !forceRenderNextFrame &&
      rendererReadyResolve === undefined &&
      currentMutation === lastRenderedMutation;
    let drew = false;
    if (!idleSkip) {
      drew = renderer.render();
      if (drew) {
        lastRenderedMutation = currentMutation;
        forceRenderNextFrame = false;
      }
    }
    if (drew && rendererReadyResolve !== undefined && criticalAssetsReady(world, criticalAssets)) {
      rendererReadyResolve();
      rendererReadyResolve = undefined;
    }

    const tickEnd = performance.now();
    const tickTotalMs = tickEnd - tickStart;
    renderAccumMs += tickEnd - renderPhaseStart;
    totalAccumMs += tickTotalMs;

    // S86 AGF-FRAME-TIMING-SPIKE-DIAGNOSTIC + S87 AGF-FRAME-SPIKE-UNIT-TEST.
    if (spikeGate.observe(tickTotalMs, tickEnd)) {
      diagnostics.emit({
        severity: "warning",
        code: "AGF_FRAME_SPIKE",
        source: "runtime",
        message: `Frame budget exceeded — total ${tickTotalMs.toFixed(1)} ms (threshold ${spikeMs} ms).`,
        details: { totalMs: tickTotalMs, threshold: spikeMs }
      });
    }

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

  // S83 AGF-LOG-LIFECYCLE-TRACES.
  diagnostics.emit({
    severity: "info",
    code: "AGF_RUNTIME_STARTED",
    source: "runtime",
    message: "runtime started",
    details: { systemCount: scheduler?.size() ?? 0 }
  });

  return {
    world,
    renderer,
    time,
    diagnostics,
    rendererReady,
    hud,
    audio,
    invalidateAsset(ref: string): void {
      options.assetRegistry?.invalidate(ref);
      if (materialBindingSystem !== undefined) {
        materialBindingSystem.forgetAssetBinding(world, ref);
      } else {
        renderer.forgetAssetBinding(ref);
      }
    },
    setDebugSystem(name: string, enabled: boolean): boolean {
      if (scheduler === undefined) return false;
      return scheduler.setDebugSystem(name, enabled);
    },
    setTimeScale(scale: number): number {
      timeScale = clampTimeScale(scale);
      return timeScale;
    },
    getTimeScale(): number {
      return timeScale;
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
      // Record the expanded scene — replay should rehydrate the same flat
      // entity set without re-running prefab expansion.
      const recorderOptions: Parameters<typeof createRecorder>[0] = { scene: flatScene };
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
      hud.dispose();
      audio?.dispose();
      renderer.dispose();
      // S83 AGF-LOG-LIFECYCLE-TRACES. Emit before tearing down so the
      // diagnostics buffer still captures the event for a final read.
      diagnostics.emit({
        severity: "info",
        code: "AGF_RUNTIME_STOPPED",
        source: "runtime",
        message: "runtime stopped"
      });
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
