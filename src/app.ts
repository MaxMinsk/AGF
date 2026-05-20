import { startRuntime, type RuntimeHandle, type RuntimeOptions } from "../engine/runtime/start";
import { SystemScheduler } from "../engine/core/systems/scheduler";
import { createSpinSystem } from "../engine/core/systems/spin-system";
import { AssetRegistry } from "../engine/runtime/asset-registry";
import { createMaterialLoader } from "../engine/runtime/asset-loaders/material-loader";
import { createTextureLoader } from "../engine/render/texture-loader";
import { createPlayerInputSystem } from "../engine/runtime/player-input-system";
import { createGlbLoader } from "../engine/render/glb-loader";
import {
  startWsNetworkAdapter,
  type WsNetworkAdapterHandle
} from "../engine/runtime/network/ws-network-adapter";
import type {
  ProjectBootstrap,
  ProjectUiHandle
} from "../engine/runtime/project-bootstrap";
import type { EngineCommand } from "../engine/core/commands/types";
import type { SceneInput } from "../engine/core/ecs/types";
import type { WorldSnapshot } from "../engine/runtime/inspect";
import { createDiagnosticsBus } from "../engine/runtime/diagnostics/diagnostics-bus";
import { mountDiagnosticsOverlay, type DiagnosticsOverlayHandle } from "../engine/runtime/diagnostics/diagnostics-overlay";
import {
  createIndexedDbStore,
  createMemoryStore,
  type LocalStore
} from "../engine/runtime/persistence/local-store";
import type { SaveBlob } from "../engine/runtime/persistence/save-load";

export type ProjectMeta = {
  name: string;
  render?: {
    /** S61 RENDER-mode. `webgl` (default) → `WebGLRenderer`; `webgpu` → `WebGPURenderer` from `three/webgpu`. */
    mode?: "webgl" | "webgpu";
    background?: string;
    skyGradient?: { top: string; bottom: string };
    /**
     * M21-color: output color pipeline. Defaults: toneMapping
     * "aces-filmic", exposure 1.
     */
    color?: {
      toneMapping?: "none" | "linear" | "reinhard" | "cineon" | "aces-filmic" | "agx";
      exposure?: number;
      transmissionResolutionScale?: number;
    };
    /**
     * M21-post-pipeline: ordered post-processing chain. The adapter
     * always appends an OutputPass for tonemap + sRGB conversion.
     */
    post?: ReadonlyArray<
      | { kind: "bloom"; strength?: number; radius?: number; threshold?: number }
      | { kind: "fxaa" }
      | { kind: "ssao"; radius?: number; intensity?: number; kernelSize?: number }
      | { kind: "color-lut"; file: string; intensity?: number }
    >;
    /**
     * M21-shadow-csm: opt in to cascade shadow maps. When enabled, the
     * adapter constructs a CSM instance against the active camera and
     * routes every renderer-managed material through `setupMaterial`.
     */
    shadows?: {
      /** M21-shadow-static: disable per-frame shadow re-rendering for static scenes. */
      autoUpdate?: boolean;
      /** M21-shadow-algorithm: pick PCF (default) vs VSM vs PCSS filtering. */
      algorithm?: "pcf" | "vsm" | "pcss";
      csm?: {
        enabled?: boolean;
        cascades?: number;
        maxFar?: number;
        mode?: "practical" | "uniform" | "logarithmic";
        shadowMapSize?: number;
        shadowBias?: number;
        shadowNormalBias?: number;
        lightDirection?: ReadonlyArray<number>;
        lightIntensity?: number;
      };
    };
    batching?: {
      /** S50 auto-batch: include every primitive-mesh entity in the batcher by default. */
      auto?: boolean;
      /** S51 bucket path default: `instanced` (default) or `batched`. */
      path?: "instanced" | "batched" | "batched-bvh";
    };
    /** S54 RUNTIME-idle-rendering: `on-demand` skips renderer.render() on frames where no ECS mutation fired. Default `always`. */
    idleMode?: "always" | "on-demand";
    /** S54 RUNTIME-progressive-loading: asset refs that must finish loading before `rendererReady` resolves. */
    criticalAssets?: ReadonlyArray<string>;
    /** S88 AGF-PARTICLE-PREWARM-SYSTEM: preset names whose ParticleEmitter shader should be compiled on boot. */
    particlePreWarmPresets?: ReadonlyArray<string>;
  };
  /**
   * Profile names this project supports, mirroring `project.json.profiles`.
   * The runtime picks one active profile (defaults to `profiles[0]`) and gates
   * system registration on it.
   */
  profiles?: ReadonlyArray<string>;
  /**
   * Optional persistence config. When present, the app constructs an
   * IndexedDB-backed store (or memory fallback) and wires runtime.save/load.
   */
  persistence?: {
    components: ReadonlyArray<string>;
    slot?: string;
  };
  /**
   * Optional Rapier3D physics config (M24). `enabled: true` triggers the
   * lazy WASM import + PhysicsSyncSystem registration on the scheduler.
   * Projects that omit this field pay zero physics bundle cost.
   */
  physics?: {
    enabled?: boolean;
    gravity?: ReadonlyArray<number>;
    fixedDt?: number;
  };
};

export type AppOptions = {
  /** WebSocket URL of a node-world-server style backend, e.g. `ws://localhost:8787`. */
  serverUrl?: string;
  /** Player id used in the outbound `player.join`. Defaults to a stable random id. */
  playerId?: string;
  /**
   * When true AND `serverUrl` is set, the local PlayerControlled drone stops
   * moving locally; PlayerInputSystem forwards normalised directions through
   * `intent.move`. The server's `player.<playerId>` entity appears in the
   * snapshot as a separate authoritative entity.
   */
  networked?: boolean;
  /**
   * Active profile selected at boot. Must be present in `project.profiles`.
   * Defaults to `project.profiles[0]` or `"static"`.
   */
  activeProfile?: string;
  /**
   * Project-specific bootstrap that registers systems, mounts UI, handles
   * restart, etc. Each example project ships its own bootstrap; the root app
   * does not import from `examples/`.
   */
  bootstrap?: ProjectBootstrap;
  /**
   * M3-c-load: prefab registry the runtime uses to expand scene `instances`.
   * Keyed by prefab id. Pass `undefined` (or omit) for projects without
   * prefab files — scenes that still declare `instances` will surface
   * `AGF_SCENE_INSTANCE_PREFAB_MISSING` diagnostics.
   */
  prefabs?: ReadonlyMap<string, import("../engine/core/scene/expand-prefabs").PrefabDefinition>;
};

export type AppHandle = {
  readonly canvas: HTMLCanvasElement;
  /** The live ECS World — exposed so dev surfaces (M23-tuner) can read/write components without going through `applyCommands` for read-only path resolution. Writes must still use `applyCommands` to preserve replication/snapshot/HMR invariants. */
  readonly world: import("../engine/core/ecs/world").World;
  applyCommands(commands: ReadonlyArray<EngineCommand>): void;
  snapshot(): WorldSnapshot;
  reloadAsset(ref: string): void;
  /** Active WS adapter, if `?server=` was provided. Useful for tests. */
  readonly network: WsNetworkAdapterHandle | undefined;
  /**
   * Delegates to the active bootstrap's `resetRound`, if it implements one.
   * Returns the number of mutations applied (`0` for projects without a
   * round concept).
   */
  resetRound(): number;
  /** Snapshot of the runtime diagnostics bus. */
  diagnostics(): ReadonlyArray<import("../engine/runtime/diagnostics/diagnostics-bus").RuntimeDiagnostic>;
  /**
   * Subscribe to live diagnostic emissions. Used by the dev-bridge SSE
   * stream (`GET /__agf/events`) to fan diagnostics out to subscribed agents.
   */
  subscribeDiagnostics(
    listener: (
      diagnostic: import("../engine/runtime/diagnostics/diagnostics-bus").RuntimeDiagnostic
    ) => void
  ): () => void;
  /** Drop retained diagnostics. */
  clearDiagnostics(): void;
  /**
   * Returns the current diagnostics snapshot serialised as JSON and, if the
   * Clipboard API is available, copies it to the OS clipboard. Useful for
   * agents and reviewers grabbing runtime state without opening DevTools.
   */
  copyDiagnostics(): Promise<string>;
  /** Persistence v0 — requires project.persistence.components on the project. */
  save(): Promise<SaveBlob>;
  load(): Promise<{ blob: SaveBlob | undefined; restoredEntities: string[] }>;
  clearSave(): Promise<void>;
  /** Recording controls (Sprint 28). Used by the dev-bridge /__agf/recording/* routes. */
  startRecording(): { started: true };
  stopRecording(): unknown;
  /** Three.js renderer resource counters (for HMR leak tests) + the M21-g handleLeak invariant + light counts. */
  rendererInspect(): {
    info: Record<string, unknown>;
    handles: { count: number; entityIds: string[] };
  };
  /** S86 AGF-ASSET-INVENTORY-PROBE. */
  assetInventory(): ReadonlyArray<{ ref: string; status: "loaded" | "pending" | "failed" }>;
  /** S88 AGF-POOL-INVENTORY-PROBE. */
  poolInventory(): ReadonlyArray<{ name: "instanced" | "batched" | "particle"; live: number; peak: number }>;
  /** S90 AGF-DEV-BRIDGE-TIME-SCALE. */
  getTimeScale(): number;
  setTimeScale(scale: number): number;
  rendererInfo(): {
    geometries: number;
    textures: number;
    programs: number;
    drawCalls: number;
    triangles: number;
    meshes: number;
    lights: number;
    shadowCasters: number;
    buckets: number;
    bucketInstances: number;
    batchedBuckets: number;
    batchedBucketInstances: number;
    handleLeak: number;
    /** S54 RUNTIME-gpu-timing: GPU-side frame ms when `EXT_disjoint_timer_query_webgl2` is available; `undefined` otherwise. */
    gpuMs?: number;
    /** S59 PERF-renderer-info: count of live `ReflectionProbe` cube cams. */
    reflectionProbes: number;
    /** S59 PERF-renderer-info: total PMREM regen ms across all probes this frame. Zero unless a probe opted into `prefilter: "pmrem"`. */
    prefilterMs: number;
    /** S59 REFLECTION-planar: count of live `PlanarMirror` Reflector meshes. */
    planarMirrors: number;
    /** S60 PERF-renderer-info-renderer-kind: which renderer the adapter is backed by. Always `"webgl"` today; flips once `WebGpuRenderAdapter` ships. */
    renderer: "webgl" | "webgpu";
  };
  /** M21-shadow-static: manual shadow-map controls (no-op when autoUpdate is true, which is the default). */
  renderer: {
    invalidateShadowMap(): void;
    setShadowMapAutoUpdate(enabled: boolean): void;
  };
  /** S091 AGF-RENDER-DEBUG-MODE-AGENT. */
  getRenderDebugMode(): "off" | "wireframe" | "unlit-white" | "normals" | "uv";
  setRenderDebugMode(mode: "off" | "wireframe" | "unlit-white" | "normals" | "uv"):
    "off" | "wireframe" | "unlit-white" | "normals" | "uv";
  /**
   * RUNTIME-renderer-ready: resolves once the renderer has drawn its
   * first frame (active camera acquired). Tests + dev-bridge clients
   * `await` this before taking screenshots / probing rendererInfo.
   */
  readonly rendererReady: Promise<void>;
  /**
   * M17-instance-picking: cast a ray from normalised screen coords
   * (x, y in [-1, 1], y up). Returns the first picked entity, hit
   * point, and distance — or undefined when nothing was hit.
   */
  pick(spec: { x: number; y: number }):
    | { readonly entityId: string; readonly point: readonly [number, number, number]; readonly distance: number }
    | undefined;
  /** S66 WEBGPU-shadermaterial-audit (temp debug hook) — returns a `{ [className]: count }` map of every material instance the next render frame will touch. */
  __auditMaterials(): Record<string, number>;
  /** M21-frame-timing — window-averaged per-phase tick timings in milliseconds. */
  frameTiming(): {
    fixedUpdateMs: number;
    frameUpdateMs: number;
    renderMs: number;
    totalFrameMs: number;
    samples: number;
  };
  /**
   * Physics query + debug controls. `undefined` when the active project
   * did not declare `physics.enabled: true`.
   */
  physics?: {
    /** Toggle the LineSegments overlay produced by Rapier's debugRender. (M24-debug) */
    setDebugOverlay(enabled: boolean): void;
    /** Current state of the overlay. */
    isDebugOverlayEnabled(): boolean;
    /**
     * M24-raycast: cast a ray and return the first entity hit, with
     * point + normal + distance. Returns undefined if nothing is hit
     * within `maxDistance`. `direction` should be unit-length.
     */
    raycast(spec: {
      origin: ReadonlyArray<number>;
      direction: ReadonlyArray<number>;
      maxDistance: number;
    }):
      | {
          readonly entityId: string;
          readonly distance: number;
          readonly point: readonly [number, number, number];
          readonly normal: readonly [number, number, number];
        }
      | undefined;
  };
  dispose(): void;
};

export async function createApp(
  root: HTMLElement,
  project: ProjectMeta,
  scene: SceneInput,
  projectId: string,
  availableProjectIds: ReadonlyArray<string> = [projectId],
  options: AppOptions = {}
): Promise<AppHandle> {
  root.textContent = "";

  const shell = document.createElement("main");
  shell.className = "app-shell";

  const canvas = document.createElement("canvas");
  canvas.className = "engine-canvas";
  canvas.setAttribute("data-testid", "engine-canvas");

  const status = document.createElement("section");
  status.className = "status-panel";
  status.setAttribute("aria-label", "Engine status");
  status.setAttribute("data-testid", "status-panel");

  const switcherLinks = availableProjectIds
    .map((id) =>
      id === projectId
        ? `<strong data-testid="project-link-active">${escapeText(id)}</strong>`
        : `<a href="?project=${encodeURIComponent(id)}" data-testid="project-link-${escapeText(id)}">${escapeText(id)}</a>`
    )
    .join(" · ");

  const projectProfiles = project.profiles ?? ["static"];
  const networked = options.networked === true && options.serverUrl !== undefined;
  const playerId = options.playerId ?? (networked ? randomPlayerId() : "local");
  const requestedProfile =
    options.activeProfile !== undefined && projectProfiles.includes(options.activeProfile)
      ? options.activeProfile
      : undefined;
  const activeProfile =
    requestedProfile ??
    (networked && projectProfiles.includes("connected") ? "connected" : projectProfiles[0] ?? "static");

  const bootstrap = options.bootstrap;
  const connectivityHint = bootstrap?.renderConnectivityHint?.({
    serverUrl: options.serverUrl,
    playerId: options.playerId,
    networked
  }) ?? "";

  status.innerHTML = `
    <h1 class="status-title" data-testid="project-name">${escapeText(project.name)}</h1>
    <p class="status-copy">Three.js renderer running. Scene is loaded from JSON through the pragmatic ECS. Edit the scene file to hot-reload.</p>
    <p class="status-copy">Project: <code data-testid="project-id">${escapeText(projectId)}</code> · ${switcherLinks}</p>
    ${connectivityHint}
  `;

  shell.append(canvas, status);
  root.append(shell);

  const diagnostics = createDiagnosticsBus();
  // S88 AGF-LOG-LIFECYCLE-SCHEDULER. Forward the shared diagnostics
  // bus into the scheduler so AGF_SCHEDULER_SYSTEM_REGISTERED /
  // _DEREGISTERED info traces show up in /__agf/diagnostics —
  // reconstructing the live system list from one snapshot no longer
  // needs inspecting the SystemScheduler object.
  const scheduler = new SystemScheduler({ activeProfiles: [activeProfile], diagnostics });
  let network: WsNetworkAdapterHandle | undefined;
  const playerInputSystem = networked
    ? createPlayerInputSystem({
        onIntent: (direction) => network?.sendIntent(direction)
      })
    : createPlayerInputSystem();
  scheduler.register(playerInputSystem);
  scheduler.register(createSpinSystem());

  bootstrap?.registerSystems({
    scheduler,
    playerId,
    networked,
    getNetwork: () => network
  });

  const assetRegistry = new AssetRegistry({
    baseUrl: new URL(`examples/${projectId}/assets/`, window.location.href).href,
    loaders: [createMaterialLoader(), createGlbLoader(), createTextureLoader()],
    diagnostics
  });

  const runtimeOptions: RuntimeOptions = { canvas, scene, scheduler, assetRegistry, diagnostics };
  if (options.prefabs !== undefined) {
    runtimeOptions.prefabs = options.prefabs;
  }
  const background = project.render?.background;
  if (background !== undefined) {
    runtimeOptions.background = background;
  }
  if (project.render?.skyGradient !== undefined) {
    runtimeOptions.skyGradient = project.render.skyGradient;
  }
  if (project.render?.color !== undefined) {
    runtimeOptions.color = project.render.color;
  }
  if (project.render?.shadows?.algorithm !== undefined) {
    runtimeOptions.shadowAlgorithm = project.render.shadows.algorithm;
  }
  // S61 RENDER-mode: opt into WebGPU per project.
  if (project.render?.mode === "webgpu") {
    runtimeOptions.rendererMode = "webgpu";
  }
  // S53 M17-batch-default-on: auto-batch defaults to true. Setting
  // `render.batching.auto: false` explicitly keeps the legacy
  // single-Mesh path; any other value (true, absent) enables.
  runtimeOptions.autoBatchPrimitives = project.render?.batching?.auto !== false;
  if (project.render?.batching?.path !== undefined) {
    runtimeOptions.batchingPath = project.render.batching.path;
  }
  if (project.render?.idleMode !== undefined) {
    runtimeOptions.idleMode = project.render.idleMode;
  }
  if (project.render?.criticalAssets !== undefined && project.render.criticalAssets.length > 0) {
    runtimeOptions.criticalAssets = project.render.criticalAssets;
  }
  // S88 AGF-PARTICLE-PREWARM-SYSTEM: forward project.json#render.particlePreWarmPresets to the runtime.
  if (project.render?.particlePreWarmPresets !== undefined && project.render.particlePreWarmPresets.length > 0) {
    runtimeOptions.particlePreWarmPresets = project.render.particlePreWarmPresets;
  }
  if (import.meta.env.DEV) {
    // S60 stutter investigation. Allow disabling the dev overlay via
    // `?overlay=0` so we can A/B the stutter rate with and without the
    // per-window innerHTML rebuild.
    const overlayOff = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("overlay") === "0";
    if (!overlayOff) {
      runtimeOptions.devOverlay = true;
      runtimeOptions.devOverlayParent = shell;
    }
  }
  if (project.persistence !== undefined && project.persistence.components.length > 0) {
    let store: LocalStore;
    try {
      store = createIndexedDbStore(`agf-${projectId}`);
    } catch {
      // No IndexedDB (jsdom / non-browser context): fall back to memory.
      // Save/load still works, just doesn't survive a page reload.
      store = createMemoryStore();
    }
    const persistence: NonNullable<RuntimeOptions["persistence"]> = {
      store,
      context: {
        projectId,
        profile: activeProfile,
        allowlist: project.persistence.components
      }
    };
    if (project.persistence.slot !== undefined) {
      persistence.slot = project.persistence.slot;
    }
    runtimeOptions.persistence = persistence;
  }

  // M24-sync: lazy-load Rapier and register PhysicsSyncSystem before
  // `startRuntime` ticks. Adapter init is async (WASM); registering after
  // start would race the first fixed step.
  let physicsAdapter: import("../engine/physics/rapier/rapier-adapter").RapierAdapter | undefined;
  let physicsRegistry:
    | import("../engine/physics/rapier/physics-body-registry").PhysicsBodyRegistry
    | undefined;
  const physicsDebugState = { enabled: false };
  if (project.physics?.enabled === true) {
    const { createRapierAdapter } = await import(
      "../engine/physics/rapier/rapier-adapter"
    );
    const { createPhysicsBodyRegistry } = await import(
      "../engine/physics/rapier/physics-body-registry"
    );
    const { createPhysicsSyncSystem } = await import(
      "../engine/physics/rapier/physics-sync-system"
    );
    const gravity = project.physics.gravity;
    physicsAdapter = await createRapierAdapter({
      ...(gravity !== undefined && gravity.length >= 3
        ? { gravity: [gravity[0] ?? 0, gravity[1] ?? -9.81, gravity[2] ?? 0] as const }
        : {}),
      ...(project.physics.fixedDt !== undefined ? { fixedDt: project.physics.fixedDt } : {})
    });
    physicsRegistry = createPhysicsBodyRegistry(physicsAdapter);
    // M24-character: CharacterMovementSystem must run BEFORE
    // PhysicsSyncSystem in the fixed-update phase so its
    // setBodyNextKinematicTranslation queues land before adapter.step().
    const { createCharacterMovementSystem } = await import(
      "../engine/physics/rapier/character-movement-system"
    );
    const characterGravity: readonly [number, number, number] = [
      gravity?.[0] ?? 0,
      gravity?.[1] ?? -9.81,
      gravity?.[2] ?? 0
    ];
    scheduler.register(
      createCharacterMovementSystem({
        registry: physicsRegistry,
        adapter: physicsAdapter,
        gravity: characterGravity
      })
    );
    const physicsSystem = createPhysicsSyncSystem(physicsRegistry, physicsAdapter);
    scheduler.register(physicsSystem);
  }

  const runtime: RuntimeHandle = await startRuntime(runtimeOptions);

  // M21-shadow-static: opt out of per-frame shadow re-rendering for
  // static scenes (the renderer bakes the cascade(s) once + on every
  // explicit invalidateShadowMap()).
  if (project.render?.shadows?.autoUpdate === false) {
    runtime.renderer.adapter.setShadowMapAutoUpdate(false);
  }

  // M21-post-pipeline: opt in to the post-processing chain. Adapter
  // defers composer construction until an active camera exists. S57
  // POST-color-lut needs the AssetRegistry to resolve the LUT path
  // through the project's assetRoot, so we hand the resolver to the
  // adapter before we set the pipeline.
  runtime.renderer.adapter.lutUrlResolver = (ref) => assetRegistry.urlFor(ref);
  if (project.render?.post !== undefined && project.render.post.length > 0) {
    runtime.renderer.adapter.setPostPipeline(project.render.post);
  }

  // M21-shadow-csm: opt in to cascade shadow maps. Build happens lazily
  // once CameraSyncSystem picks an active camera; the adapter handles
  // deferred construction internally.
  const csmConfig = project.render?.shadows?.csm;
  if (csmConfig !== undefined && csmConfig.enabled === true) {
    const direction = csmConfig.lightDirection;
    const csmSpec: import("../engine/render/three-render-adapter").CsmConfig = {};
    if (csmConfig.cascades !== undefined) csmSpec.cascades = csmConfig.cascades;
    if (csmConfig.maxFar !== undefined) csmSpec.maxFar = csmConfig.maxFar;
    if (csmConfig.mode !== undefined) csmSpec.mode = csmConfig.mode;
    if (csmConfig.shadowMapSize !== undefined) csmSpec.shadowMapSize = csmConfig.shadowMapSize;
    if (csmConfig.shadowBias !== undefined) csmSpec.shadowBias = csmConfig.shadowBias;
    if (csmConfig.shadowNormalBias !== undefined) csmSpec.shadowNormalBias = csmConfig.shadowNormalBias;
    if (direction !== undefined && direction.length >= 3) {
      csmSpec.lightDirection = [direction[0] ?? -0.5, direction[1] ?? -1, direction[2] ?? -0.3] as const;
    }
    if (csmConfig.lightIntensity !== undefined) csmSpec.lightIntensity = csmConfig.lightIntensity;
    runtime.renderer.adapter.setCsm(csmSpec);
  }

  // M24-debug: physics debug overlay — registered AFTER startRuntime so
  // the renderer adapter exists. The system reads `physicsDebugState.enabled`
  // each frame, so __agf.physics.setDebugOverlay flips it live.
  if (physicsAdapter !== undefined) {
    const { createPhysicsDebugSystem } = await import(
      "../engine/physics/rapier/physics-debug-system"
    );
    scheduler.register(
      createPhysicsDebugSystem({
        physics: physicsAdapter,
        renderer: runtime.renderer.adapter,
        state: physicsDebugState
      })
    );
  }

  const projectUi: ProjectUiHandle | undefined = bootstrap?.attachUi?.({
    shell,
    runtime,
    playerId,
    networked
  });

  let diagnosticsOverlay: DiagnosticsOverlayHandle | undefined;
  if (import.meta.env.DEV) {
    diagnosticsOverlay = mountDiagnosticsOverlay(shell, diagnostics);
  }

  if (options.serverUrl !== undefined) {
    network = startWsNetworkAdapter({
      url: options.serverUrl,
      playerId,
      diagnostics,
      applyCommands: (commands) => runtime.applyCommands(commands),
      knownEntityIds: () => runtime.snapshot().entities.map((entity) => entity.id),
      reconnect: true
    });
  }

  return {
    canvas,
    world: runtime.world,
    rendererReady: runtime.rendererReady,
    applyCommands(commands): void {
      runtime.applyCommands(commands);
    },
    snapshot(): WorldSnapshot {
      return runtime.snapshot();
    },
    reloadAsset(ref): void {
      runtime.invalidateAsset(ref);
    },
    get network(): WsNetworkAdapterHandle | undefined {
      return network;
    },
    resetRound(): number {
      return bootstrap?.resetRound?.(runtime) ?? 0;
    },
    diagnostics() {
      return runtime.diagnostics.snapshot();
    },
    subscribeDiagnostics(listener) {
      return runtime.diagnostics.subscribe(listener);
    },
    clearDiagnostics(): void {
      runtime.diagnostics.clear();
    },
    async copyDiagnostics(): Promise<string> {
      const json = JSON.stringify(runtime.diagnostics.snapshot(), null, 2);
      const clipboard = (globalThis as { navigator?: { clipboard?: { writeText?: (s: string) => Promise<void> } } })
        .navigator?.clipboard;
      if (clipboard?.writeText !== undefined) {
        try {
          await clipboard.writeText(json);
        } catch {
          // Clipboard access can be denied (focus, permissions). Returning the
          // string still lets callers paste it manually.
        }
      }
      return json;
    },
    rendererInfo() {
      return runtime.renderer.info();
    },
    // S83 AGF-AGENT-RENDERER-PROBE.
    rendererInspect() {
      return runtime.renderer.inspect();
    },
    // S86 AGF-ASSET-INVENTORY-PROBE.
    assetInventory() {
      return assetRegistry?.inventory() ?? [];
    },
    // S88 AGF-POOL-INVENTORY-PROBE.
    poolInventory() {
      return runtime.renderer.pools();
    },
    // S90 AGF-DEV-BRIDGE-TIME-SCALE.
    getTimeScale() {
      return runtime.getTimeScale();
    },
    setTimeScale(scale: number) {
      return runtime.setTimeScale(scale);
    },
    // S091 AGF-RENDER-DEBUG-MODE-AGENT.
    getRenderDebugMode() {
      return runtime.renderer.getDebugMode();
    },
    setRenderDebugMode(mode) {
      return runtime.renderer.setDebugMode(mode);
    },
    // S66 WEBGPU-shadermaterial-audit: temp debug hook for diagnosing
    // which `ShaderMaterial` instances `three/webgpu`'s `PostProcessing`
    // rejects. Returns a `{ [class]: count }` map of every material
    // class participating in the next render frame.
    __auditMaterials(): Record<string, number> {
      return runtime.renderer.adapter.auditMaterialClasses();
    },
    frameTiming() {
      return runtime.frameTiming();
    },
    pick(spec) {
      return runtime.pick(spec);
    },
    renderer: {
      invalidateShadowMap(): void {
        runtime.renderer.adapter.invalidateShadowMap();
      },
      setShadowMapAutoUpdate(enabled: boolean): void {
        runtime.renderer.adapter.setShadowMapAutoUpdate(enabled);
      }
    },
    ...(physicsAdapter !== undefined && physicsRegistry !== undefined
      ? {
          physics: {
            setDebugOverlay(enabled: boolean): void {
              physicsDebugState.enabled = enabled;
            },
            isDebugOverlayEnabled(): boolean {
              return physicsDebugState.enabled;
            },
            raycast(spec) {
              const origin = spec.origin;
              const direction = spec.direction;
              if (origin.length < 3 || direction.length < 3) return undefined;
              const hit = physicsAdapter.castRay(
                [origin[0] ?? 0, origin[1] ?? 0, origin[2] ?? 0],
                [direction[0] ?? 0, direction[1] ?? 0, direction[2] ?? 0],
                spec.maxDistance
              );
              if (hit === undefined) return undefined;
              const entityId = physicsRegistry.entityForCollider(hit.collider);
              if (entityId === undefined) return undefined;
              return {
                entityId,
                distance: hit.distance,
                point: hit.point,
                normal: hit.normal
              };
            }
          }
        }
      : {}),
    async save() {
      return runtime.save();
    },
    async load() {
      return runtime.load();
    },
    async clearSave() {
      return runtime.clearSave();
    },
    startRecording(): { started: true } {
      runtime.startRecording(projectId);
      return { started: true };
    },
    stopRecording(): unknown {
      return runtime.stopRecording();
    },
    dispose(): void {
      diagnosticsOverlay?.dispose();
      projectUi?.dispose();
      network?.dispose();
      runtime.stop();
      playerInputSystem.dispose();
      root.textContent = "";
    }
  };
}

function randomPlayerId(): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `client-${suffix}`;
}

function escapeText(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}
