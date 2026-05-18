// S85 AGF-LOG-RENDERER-LIFT-WARN-SITES: every renderer-adapter
// warning route now goes through runtime.diagnostics (when wired);
// pre-runtime fallbacks keep the `console.warn` path with inline
// agf-allow:console markers + rationale. Drop the file-level marker
// the S83 audit pass added — line-level audit is sufficient now.
//
// Thin Three.js touchpoint for the renderer pipeline (M21-a).
//
// The adapter is the only file under `engine/render/` allowed to import
// `three` directly aside from the GLB loader. Every "I need to talk to the
// GPU" call from a higher layer (today `ThreeRenderer`, tomorrow the
// per-system split from `M21-b..f`) goes through this surface.
//
// Design notes (mirrors §3 of docs/research/renderer-ecs-split-investigation.md):
//   - Opaque `MeshHandle` / `CameraHandle` — numeric IDs. Callers never see
//     `three.Mesh` or `three.PerspectiveCamera`. Lets us swap implementations
//     (BatchedMesh, InstancedMesh — M17) without changing the public API.
//   - The adapter does *not* query the ECS World. Systems mediate every
//     World → Three.js touch by reading components and calling adapter
//     methods.
//   - Material patches are field-shaped (`{ color?, roughness?, ... }`) so
//     the same call covers both inline `MeshRenderer.color` and async
//     manifest application. M21-mat-* extends this to non-Standard kinds.
//
// What stays opaque on purpose: the `Scene` graph root, the `WebGLRenderer`
// device, the ambient + directional fallback lights. These are the
// legitimate "third-party API demanding an opaque cache" deviation
// documented in CLAUDE.md.

import {
  AmbientLight,
  BatchedMesh,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  EquirectangularReflectionMapping,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  type Light,
  LineBasicMaterial,
  LineSegments,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  ShadowMaterial,
  CubeCamera,
  WebGLCubeRenderTarget,
  HalfFloatType,
  type Object3D,
  ACESFilmicToneMapping,
  AdditiveBlending,
  LinearMipmapLinearFilter,
  LinearToneMapping,
  NoToneMapping,
  ReinhardToneMapping,
  CineonToneMapping,
  AgXToneMapping,
  type ToneMapping,
  BasicShadowMap,
  PCFShadowMap,
  PCFSoftShadowMap,
  VSMShadowMap,
  type ShadowMapType,
  OrthographicCamera,
  PerspectiveCamera,
  PMREMGenerator,
  PointLight,
  Quaternion,
  Raycaster,
  RectAreaLight,
  Scene,
  SpotLight,
  type Texture,
  NoColorSpace,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget
} from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { CubeTextureLoader } from "three";
import { GroundedSkybox } from "three/examples/jsm/objects/GroundedSkybox.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { CSM } from "three/examples/jsm/csm/CSM.js";
import { applyPcssShadowChunks } from "./shadow-pcss";
import { RenderPoolRegistry } from "./render-pool-registry";
import type { BucketSpec, PoolHandle } from "./bucket-spec";
import { extendBatchedMeshPrototype } from "@three.ez/batched-mesh-extensions";
import { GpuTimer } from "./gpu-timer";
import { WebGpuTimer } from "./webgpu/webgpu-timer";
import type { WebGpuTimerHost } from "./webgpu/webgpu-timer";
import { loadWebGpuModule, type WebGpuModule, type TslColorNode } from "./webgpu/webgpu-module-loader";
import {
  type RenderAdapterCapabilities,
  type RenderAdapterKind,
  WEBGL_CAPABILITIES,
  WEBGPU_CAPABILITIES
} from "./render-adapter";

// S53 M17-bvh-extension: the extension patches BatchedMesh.prototype
// once at module load. Idempotent — safe to call multiple times across
// HMR reloads. The patch is a precondition for the BVH-augmented
// `batched-bvh` path; vanilla `batched` is unaffected because the
// extension only activates when `mesh.computeBVH()` is called.
extendBatchedMeshPrototype();
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { FXAAPass } from "three/examples/jsm/postprocessing/FXAAPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";
import { LUTPass } from "three/examples/jsm/postprocessing/LUTPass.js";
import { LUTCubeLoader } from "three/examples/jsm/loaders/LUTCubeLoader.js";

export type MeshHandle = number;
export type CameraHandle = number;
export type LightHandle = number;
/** M17: one InstancedMesh per bucket. */
export type BucketHandle = number;
/** Index inside a bucket. The bucket owns a contiguous range [0, count). */
export type InstanceIndex = number;

export type BucketAcquireSpec = {
  /** Initial GL upload geometry. The bucket caches it; recreate the bucket if geometry changes. */
  geometry: BufferGeometry;
  /** Initial slot count for the InstancedMesh. Grow via `resizeBucket`; can't shrink. */
  capacity: number;
  /** Initial / fallback material color when `useInstanceColor` is off. */
  color?: string;
  castShadow?: boolean;
  receiveShadow?: boolean;
  /**
   * M17-batchable-color-variants (S50): when true, the bucket allocates
   * an `instanceColor` InstancedBufferAttribute so each slot can carry
   * its own color. Three.js's MeshStandardMaterial picks the attribute
   * up automatically and modulates the base color per instance. Use
   * `setBucketInstanceColor(handle, index, color)` to write per-slot.
   *
   * Default false to keep older call sites (batch-bench, physics-bench)
   * one-bucket-per-color so their existing fixtures stay deterministic.
   */
  useInstanceColor?: boolean;
  /**
   * S50 manifest batching: opaque profile id (e.g. `std|R0.4|M0.2|E#7a4a08`).
   * Cached in the BucketRecord on the BatchingSystem side; the adapter
   * doesn't interpret it. Used only to widen the bucket key on the
   * BatchingSystem side so different manifests don't collapse.
   */
  materialProfile?: string;
  /** S50 manifest batching: standard material parameters. */
  materialParams?: {
    roughness?: number;
    metalness?: number;
    emissive?: string;
  };
};

/**
 * M19-particle-preset: opaque handle for one additive InstancedMesh
 * pool of particles. The adapter owns the geometry/material/instancedmesh
 * so gameplay code never sees Three.js objects. Acquire → setParticles →
 * release lifecycle mirrors the M17 bucket API.
 */
export type ParticlePoolHandle = number;

export type ParticlePoolAcquireSpec = {
  /** Particle color (hex). Drawn with additive blending against the scene. */
  color: string;
  /** Maximum simultaneous particles in the pool. */
  capacity: number;
  /** Base sphere radius for one particle at scale 1.0. */
  radius?: number;
  /** Emissive multiplier baked into the material. Particles are unlit. */
  emissiveStrength?: number;
};

/** M17-batched-mesh: one BatchedMesh per bucket. Multiple geometries share a material. */
export type BatchedBucketHandle = number;
export type BatchedGeometryId = number;

/**
 * S53 RENDER-pool-handle-union: construction-only options for
 * `acquirePool`. Identity options (`shadowCast` / `shadowReceive` /
 * `materialProfile` / `group`) come in via `BucketSpec`; this carries
 * the per-kind GL allocation params that the underlying
 * `acquireBucket` / `acquireBatchedBucket` methods need.
 */
export type PoolAcquireOptions =
  | {
      kind: "instanced";
      geometry: BufferGeometry;
      capacity: number;
      useInstanceColor?: boolean;
      color?: string;
      materialParams?: {
        roughness?: number;
        metalness?: number;
        emissive?: string;
      };
    }
  | {
      kind: "batched";
      maxInstances: number;
      maxVertices: number;
      maxIndices: number;
      color?: string;
    };

export type BatchedBucketAcquireSpec = {
  /** Maximum instances the BatchedMesh ring will hold. Grow with resize (not supported in v0). */
  maxInstances: number;
  /** Sum of vertex counts across every geometry we'll add. Pad generously. */
  maxVertices: number;
  /** Sum of index counts across every geometry we'll add. */
  maxIndices: number;
  color?: string;
  castShadow?: boolean;
  receiveShadow?: boolean;
  /**
   * S53 M17-bvh-extension: when true, the adapter tags the bucket for
   * BVH-accelerated per-instance frustum culling. Call
   * `ensureBucketBvh(handle)` once initial instances are added — the
   * BVH builds lazily and auto-updates from then on. Cheaper than the
   * default O(N) bounding-sphere walk when many instances are
   * off-screen.
   */
  useBvh?: boolean;
};

export type LightKind = "directional" | "point" | "ambient" | "spot" | "hemisphere" | "rect-area";

export type LightShadowParams = {
  /** Power-of-two shadow map size. Bigger = sharper + more VRAM. */
  mapSize?: number;
  bias?: number;
  normalBias?: number;
  radius?: number;
  /** Orthographic frustum for directional lights. */
  camera?: {
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
    near?: number;
    far?: number;
  };
};

export type LightAcquireSpec = {
  kind: LightKind;
  color?: string;
  intensity?: number;
  /** Point + spot. */
  distance?: number;
  /** Point + spot. */
  decay?: number;
  /** Spot only — cone half-angle in radians. */
  angle?: number;
  /** Spot only — soft edge ratio 0..1. */
  penumbra?: number;
  /** Hemisphere only — ground tint. */
  groundColor?: string;
  /** Rect-area only — emitter width. */
  width?: number;
  /** Rect-area only — emitter height. */
  height?: number;
};

export type LightPatch = {
  color?: string;
  intensity?: number;
  distance?: number;
  decay?: number;
  angle?: number;
  penumbra?: number;
  groundColor?: string;
  width?: number;
  height?: number;
};

export type ResolvedWorld = {
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
  scale: readonly [number, number, number];
};

/** M21-mat-physical / M21-mat-custom: the shader kind to drive `setMeshMaterialKind`. */
export type MaterialKind =
  | "standard"
  | "physical"
  | "lambert"
  | "phong"
  | "basic"
  | "custom";

export type ShaderUniformValue = number | string | ReadonlyArray<number>;

export type MaterialPatch = {
  /** When set + different from the mesh's current material class, the adapter swaps the material instance. */
  kind?: MaterialKind;
  color?: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  transparent?: boolean;
  /** MeshPhysicalMaterial fields. */
  clearcoat?: number;
  clearcoatRoughness?: number;
  ior?: number;
  transmission?: number;
  thickness?: number;
  sheen?: number;
  sheenColor?: string;
  iridescence?: number;
  /** MeshPhongMaterial fields. */
  shininess?: number;
  specular?: string;
  /**
   * M21-mat-custom: source-string fields for `kind: "custom"`. Each
   * string is GLSL the renderer drops straight into a `ShaderMaterial`.
   * `uniforms` is a flat name → value map; numeric strings starting
   * with `#` are parsed as colours, arrays are passed through.
   * `defines` lets the manifest gate `#ifdef` branches without
   * recompiling the shader.
   */
  vertexShader?: string;
  fragmentShader?: string;
  uniforms?: Record<string, ShaderUniformValue>;
  defines?: Record<string, string>;
  /**
   * M21-mat-textures: pre-loaded texture objects. As of S57
   * (ASSET-textures-via-registry) material-binding-system fetches each
   * texture via `AssetRegistry.get<Texture>(ref)` and hands the loaded
   * Texture instance directly to the adapter — the adapter no longer
   * resolves URLs internally, so 404s emit
   * `AGF_RUNTIME_ASSET_LOAD_FAILED` through the registry's standard
   * path instead of failing silently inside Three's TextureLoader.
   * Each Texture's `colorSpace` should already be set; the adapter
   * re-asserts based on the field's role (`map` / `emissiveMap` → sRGB,
   * others → linear).
   */
  map?: Texture;
  normalMap?: Texture;
  normalScale?: number;
  bumpMap?: Texture;
  bumpScale?: number;
  roughnessMap?: Texture;
  metalnessMap?: Texture;
  emissiveMap?: Texture;
  aoMap?: Texture;
  /** S57 REFLECTION-cube-probe: optional per-object envmap override (CubeTexture). Falls back to `scene.environment` when undefined. */
  envMap?: Texture;
  envMapIntensity?: number;
};

export type CameraParams = {
  /**
   * S81 KABOOM-ORTHO-CAMERA. Default `perspective` for backward compat — every
   * scene that doesn't set `kind` keeps a PerspectiveCamera. Orthographic
   * cameras read `orthographicSize` (half-height) and derive width from
   * `aspect`. Both kinds honour `near` / `far`.
   */
  kind?: "perspective" | "orthographic";
  fov?: number;
  near?: number;
  far?: number;
  /** Half-height of the ortho frustum in world units. Ignored for perspective. */
  orthographicSize?: number;
  /** Width / height. The adapter recomputes this on `resize`; passing it here is only used to seed a freshly-acquired camera. */
  aspect?: number;
};

/**
 * M21-post-pipeline — declarative post-processing chain. The adapter
 * builds an EffectComposer from these entries (always followed by an
 * `OutputPass` to apply the device's tone-mapping + sRGB conversion)
 * once an active camera exists. Order is preserved.
 */
export type PostPassConfig =
  | { kind: "bloom"; strength?: number; radius?: number; threshold?: number }
  | { kind: "fxaa" }
  | { kind: "ssao"; radius?: number; intensity?: number; kernelSize?: number }
  | { kind: "color-lut"; file: string; intensity?: number };

/**
 * M21-shadow-csm — config for the Cascade Shadow Maps adapter. The
 * adapter constructs CSM lazily once an active camera exists.
 */
export type CsmConfig = {
  cascades?: number;
  maxFar?: number;
  mode?: "practical" | "uniform" | "logarithmic";
  shadowMapSize?: number;
  shadowBias?: number;
  /** M21-shadow-csm: normal-space bias on each cascade. Counters
   *  peter-pan (visible gap between an object and its shadow at the
   *  base contact point) without growing acne the way a pure negative
   *  `shadowBias` would. three.js applies it across all cascades. */
  shadowNormalBias?: number;
  lightDirection?: readonly [number, number, number];
  lightIntensity?: number;
};

export type AdapterInfo = {
  geometries: number;
  textures: number;
  programs: number;
  drawCalls: number;
  triangles: number;
  meshes: number;
  lights: number;
  shadowCasters: number;
  /** M17: live InstancedMesh buckets currently in the scene. */
  buckets: number;
  /** M17: live instances summed across every bucket (sparse slots NOT counted). */
  bucketInstances: number;
  /** M17-batched-mesh: live BatchedMesh buckets. */
  batchedBuckets: number;
  /** M17-batched-mesh: live instances inside BatchedMesh buckets. */
  batchedBucketInstances: number;
  /**
   * S54 RUNTIME-gpu-timing: latest available GPU-side ms reading from
   * `EXT_disjoint_timer_query_webgl2`. The first reading lands one or two
   * frames after boot; stays `undefined` on browsers / contexts without
   * the extension (Safari, headless WebGL, Firefox in resist-fingerprint).
   */
  gpuMs?: number;
  /** S59 PERF-renderer-info: count of live `ReflectionProbe` cube cams. */
  reflectionProbes: number;
  /**
   * S59 PERF-renderer-info: total PMREM regen time across every probe
   * this frame. Zero when no probe opted into `prefilter: "pmrem"` or
   * the cadence skipped this frame.
   */
  prefilterMs: number;
  /** S59 REFLECTION-planar: live planar-mirror Reflector meshes. */
  planarMirrors: number;
  /**
   * S60 PERF-renderer-info-renderer-kind. Identifies which renderer
   * backed this AdapterInfo. Today always `"webgl"`; the future
   * `WebGpuRenderAdapter` will set `"webgpu"`. Agent probes can branch
   * on this when interpreting other fields (e.g. `drawCalls` counts
   * differently between renderers).
   */
  renderer: "webgl" | "webgpu";
};

export type SkyGradient = {
  top: string;
  bottom: string;
};

export type AdapterOptions = {
  canvas: HTMLCanvasElement;
  background?: string;
  /** S52 POLISH-shadows-bench-sky: optional vertical gradient skybox. Overrides `background`. */
  skyGradient?: SkyGradient;
  /**
   * M21-context-loss: fires when the WebGL context is lost or
   * restored. Three.js's WebGLRenderer auto-re-uploads GPU resources
   * on restore; the runtime wires these to the DiagnosticsBus so
   * agents can react (pause systems, surface a banner, etc.).
   */
  onContextLost?: () => void;
  onContextRestored?: () => void;
  /**
   * M21-color: output color pipeline. `toneMapping` defaults to
   * `aces-filmic` (correct PBR look out of the box); set to `none` to
   * keep the legacy linear / clamped look. `exposure` defaults to 1.
   */
  color?: ColorPipelineOptions;
  /**
   * M21-shadow-algorithm: pick the shadow-map filtering algorithm.
   * `pcf` (default) — 4-tap percentage-closer filter; sharp, well
   * supported, what every existing project was tuned against.
   * `vsm` — variance shadow maps; smoother penumbras but light leaks
   * around concave geometry.
   * `pcss` — percentage-closer soft shadows via shader-chunk
   *   substitution. Smoothest penumbras + distance-aware blur; the
   *   substitution is process-wide and one-way (toggling back to PCF
   *   needs a reload).
   */
  shadowAlgorithm?: "pcf" | "vsm" | "pcss";
  /**
   * S61 RENDER-mode-schema. `"webgl"` (default) creates a `WebGLRenderer`.
   * `"webgpu"` creates `WebGPURenderer` from `three/webgpu`; the
   * runtime must `await adapter.init()` before the first `acquireMesh`
   * / `draw` call because WebGPURenderer's `init()` asks for a
   * `GPUAdapter` + `GPUDevice` asynchronously. WebGL-specific features
   * (post-processing chain, CSM, PCSS, reflection probes, planar
   * mirrors, GPU timer) are gated on the adapter's `capabilities` —
   * those methods become no-ops on the WebGPU path.
   */
  mode?: RenderAdapterKind;
  /**
   * S84 AGF-LOG-RENDERER-DIAGNOSTICS-WIRE. Optional diagnostics bus.
   * When supplied, the adapter routes renderer-side warnings + errors
   * through `bus.emit({ severity, code: 'AGF_RENDER_*', ... })` instead
   * of `console.warn`. Stays optional so unit tests / pre-runtime call
   * sites keep working without wiring a bus.
   */
  diagnostics?: import("../runtime/diagnostics/diagnostics-bus").DiagnosticsBus;
};

export type ToneMappingKind =
  | "none"
  | "linear"
  | "reinhard"
  | "cineon"
  | "aces-filmic"
  | "agx";

export type ColorPipelineOptions = {
  toneMapping?: ToneMappingKind;
  exposure?: number;
  /** Multiplier on the resolution of three.js' transmission pre-pass render target. */
  transmissionResolutionScale?: number;
};

const TONE_MAPPING_BY_KIND: Record<ToneMappingKind, ToneMapping> = {
  "none": NoToneMapping,
  "linear": LinearToneMapping,
  "reinhard": ReinhardToneMapping,
  "cineon": CineonToneMapping,
  "aces-filmic": ACESFilmicToneMapping,
  "agx": AgXToneMapping
};

export type EnvironmentKind = "generated" | "none" | "hdr" | "cube";

/**
 * M17-instance-picking + M17-instance-picking-buckets: hit-test result
 * from `pickAtNdc`. `kind` discriminates between a regular per-entity
 * Mesh, an InstancedMesh bucket slot, and a BatchedMesh bucket slot.
 * Callers resolve `(bucket, instance)` to an EntityId by reading the
 * `BatchedMeshHandle` component table.
 */
export type PickHit =
  | {
      kind: "mesh";
      handle: MeshHandle;
      point: readonly [number, number, number];
      distance: number;
    }
  | {
      kind: "bucket";
      bucket: BucketHandle;
      instance: InstanceIndex;
      point: readonly [number, number, number];
      distance: number;
    }
  | {
      kind: "batched-bucket";
      bucket: BatchedBucketHandle;
      instance: InstanceIndex;
      point: readonly [number, number, number];
      distance: number;
    };

export type EnvironmentSpec =
  | { kind: "generated" | "none" }
  | {
      kind: "hdr";
      url: string;
      intensity?: number;
      asBackground?: boolean;
      /** When `asBackground` is true, optional blur factor in [0, 1] for the sky. */
      backgroundBlurriness?: number;
      /** S57 GROUND-skybox config; applied after the IBL load completes. */
      groundedSkybox?: { height: number; radius: number };
    }
  | {
      /**
       * M21-env-cube: 6-face cubemap (positive-x, negative-x, positive-y,
       * negative-y, positive-z, negative-z). Each face is fetched once via
       * CubeTextureLoader and pre-filtered through PMREMGenerator so it
       * supplies IBL, not just a skybox.
       */
      kind: "cube";
      faces: readonly [string, string, string, string, string, string];
      intensity?: number;
      asBackground?: boolean;
      /** When `asBackground` is true, optional blur factor in [0, 1] for the sky. */
      backgroundBlurriness?: number;
      /** S57 GROUND-skybox config; applied after the IBL load completes. */
      groundedSkybox?: { height: number; radius: number };
    };

const DEFAULT_COLOR = "#cccccc";

export class ThreeRenderAdapter {
  private readonly canvas: HTMLCanvasElement;
  // S84 AGF-LOG-RENDERER-DIAGNOSTICS-WIRE.
  private readonly diagnostics: import("../runtime/diagnostics/diagnostics-bus").DiagnosticsBus | undefined;
  // S61 RENDER-mode. Typed as `WebGLRenderer` for backwards-compat with
  // every existing method; when `mode === "webgpu"` the runtime field
  // holds a `WebGPURenderer` instance which exposes the same `.render() /
  // .setSize() / .setPixelRatio() / .dispose() / .shadowMap / .info` surface
  // plus an extra async `.init()`. Methods that touch WebGL-only state
  // (composer, GPU timer, getContext-based extensions, CSM, PCSS, probes,
  // mirrors) gate on `this.capabilities.kind === "webgl"`.
  // S70 WEBGPU-lazy-import: on the WebGL path the renderer is constructed
  // synchronously and `device` is set before the constructor returns. On
  // the WebGPU path device construction needs the lazy-imported
  // `three/webgpu` module + a `GPUAdapter`/`GPUDevice` — both async — so
  // assignment is deferred to `await adapter.init()`. The `!` marks the
  // property as definitely-assigned by then; the runtime sequence in
  // `engine/runtime/start.ts` always `await`s `init()` before any draw or
  // acquire call so reads stay safe.
  private device!: WebGLRenderer;
  readonly capabilities: RenderAdapterCapabilities;
  /** True once `await adapter.init()` has resolved. WebGL path resolves synchronously. */
  private initialized: boolean = false;
  // S70 WEBGPU-lazy-import: cached snapshot of the original options bag so
  // the deferred device setup on the WebGPU path can run the same
  // configuration the WebGL path runs in the constructor. Cleared once
  // consumed.
  private pendingOptions: AdapterOptions | undefined;
  // S70 WEBGPU-lazy-import: populated by `init()` for the WebGPU path with
  // the dynamically imported `three/webgpu` constructors. Stays undefined
  // on the WebGL path.
  private webGpuModule: WebGpuModule | undefined;
  private contextLostListener: ((event: Event) => void) | undefined;
  private contextRestoredListener: (() => void) | undefined;
  // M21-mat-textures: shared TextureLoader + URL → Texture cache so a
  // map shared across N materials only fetches + decodes once.
  // S57 textureLoader / textureCache removed — see AssetRegistry texture loader.
  private readonly scene: Scene;
  private readonly meshes = new Map<MeshHandle, Mesh>();
  private readonly cameras = new Map<CameraHandle, PerspectiveCamera | OrthographicCamera>();
  private readonly lights = new Map<LightHandle, Light>();
  // S53 RENDER-pool-registry: replaces the three triplicated patterns
  // (Map<H, Entry> + `next<Pool>Handle` counter) that the InstancedMesh
  // bucketer, BatchedMesh bucketer, and particle pool each grew
  // independently. `RenderPoolRegistry` owns the handle counter +
  // lookup Map; per-pool dispose still lives in the `release*` methods.
  private readonly buckets = new RenderPoolRegistry<BucketEntry>();
  private readonly batchedBuckets = new RenderPoolRegistry<BatchedBucketEntry>();
  /** M19-particle: live particle pools (additive InstancedMesh). */
  private readonly particlePools = new RenderPoolRegistry<{
    mesh: InstancedMesh;
    capacity: number;
  }>();
  private fallbackAmbient: AmbientLight | undefined;
  private fallbackDirectional: DirectionalLight | undefined;
  private pmrem: PMREMGenerator | undefined;
  // S71 WebGPU bug fix. Reflection probes need a DEDICATED PMREMGenerator
  // so their cube-bake doesn't share the `_pingPongRenderTarget` (named
  // "PMREM.cubeUv") with `setEnvironment`. Sharing was the actual root
  // cause of the WebGPU validation spam:
  //   - setEnvironment with HDR `venice_sunset_1k.hdr` (1024 equirect)
  //     sized PMREM's pingpong for cubeSize 256.
  //   - Probe cube-bake at size 128 wants cubeSize 128 → on each
  //     `fromCubemap` call, three.js's PMREMGenerator._init detected the
  //     size mismatch and `_dispose()`d the pingpong, recreating it.
  //   - Dispose hit while the previous bake's submit was still in flight,
  //     so Chrome's WebGPU validation logged
  //     "Destroyed texture PMREM.cubeUv used in a submit" on every bake
  //     and the renderer entered an error state — game animation froze.
  // Splitting the two PMREMGenerator instances pins each one to a stable
  // input size and the pingpong stays put.
  private probePmrem: PMREMGenerator | undefined;
  private currentEnvironmentTexture: Texture | undefined;
  private currentEnvironmentKind: EnvironmentKind = "none";
  // S57 GROUND-skybox: optional helpers + an invisible shadow-catcher
  // plane underneath. The shadow-catcher uses `ShadowMaterial`, which is
  // unlit + transparent except for whatever shadow projects on it — the
  // HDR background underneath shows through everywhere else.
  private groundedSkyboxMesh: Mesh | undefined;
  private groundedShadowMesh: Mesh | undefined;
  private activeCameraHandle: CameraHandle | undefined;
  private debugOverlay: LineSegments | undefined;
  private csm: CSM | undefined;
  private csmConfig: CsmConfig | undefined;
  private readonly csmMaterials = new Set<Material>();
  // S74 WEBGPU-csm. WebGPU's CSM is a different shape: a single
  // DirectionalLight with `light.shadow.shadowNode = CSMShadowNode(...)`.
  // We keep the light + node references separately so disposeCsm() can
  // tear them down on mode change. csmShadowNodeAttached protects
  // against assigning a stale node to a disposed light.
  private csmDirectionalLight: DirectionalLight | undefined;
  private csmShadowNodeAttached: unknown | undefined;
  // M21-post-pipeline: composer + last-applied config. Rebuilt when the
  // config or active camera changes (mirrors the CSM lazy-build flow).
  private composer: EffectComposer | undefined;
  private postConfig: ReadonlyArray<PostPassConfig> | undefined;
  private composerSize: { width: number; height: number } | undefined;
  private nextMeshHandle = 1;
  private nextCameraHandle = 1;
  private nextLightHandle = 1;
  private rectAreaUniformsReady = false;
  private readonly scratchMatrix = new Matrix4();
  private readonly scratchPosition = new Vector3();
  private readonly scratchColor = new Color();
  private readonly scratchScale = new Vector3();
  private readonly scratchQuat = new Quaternion();
  private readonly scratchRaycaster = new Raycaster();
  private readonly scratchPickNdc = new Vector2();

  // S54 RUNTIME-gpu-timing / S59 GPU-timer-test. The state machine lives in
  // `engine/render/gpu-timer.ts` so it can be unit-tested against a small
  // mock WebGL2 context (the original S58 INVALID_ENUM / dangling endQuery
  // pair would have been caught by that test before reaching DevTools).
  // Stays `undefined` on browsers / contexts without
  // `EXT_disjoint_timer_query_webgl2` — every Safari, headless WebGL,
  // Firefox in resist-fingerprint.
  private gpuTimer: GpuTimer | undefined;
  // S70 WEBGPU-gpu-timer. Parallel to `gpuTimer` for the WebGPU path. Stays
  // `undefined` on the WebGL adapter and on WebGPU devices that don't
  // expose the `timestamp-query` feature (three.js silently flips
  // `trackTimestamp` to false in that case, so the helper would never
  // produce a reading anyway).
  private webGpuTimer: WebGpuTimer | undefined;

  constructor(options: AdapterOptions) {
    this.canvas = options.canvas;
    this.diagnostics = options.diagnostics;
    let mode: RenderAdapterKind = options.mode ?? "webgl";
    // S68 WEBGPU-fallback-policy. If the runtime requested WebGPU but
    // `navigator.gpu` is unavailable (headless CI, older browsers), fall
    // back to WebGL automatically so the page still renders. Apps that
    // *require* WebGPU should check `__agf.rendererInfo().renderer`
    // after boot to detect the fallback. Without this, mode="webgpu" on
    // a browser without WebGPU support produces a black canvas + console
    // error — surprising failure mode for users opting in.
    if (mode === "webgpu" && typeof navigator !== "undefined" && (navigator as { gpu?: unknown }).gpu === undefined) {
      // S84 AGF-LOG-RENDERER-DIAGNOSTICS-WIRE. Route the fallback notice
      // through the diagnostics bus when wired so agents can detect the
      // downgrade without grep'ing console output. Falls back to
      // console.warn when no bus is available (pre-runtime, tests).
      if (this.diagnostics !== undefined) {
        this.diagnostics.emit({
          severity: "warning",
          code: "AGF_RENDER_WEBGPU_FALLBACK_WEBGL",
          source: "three-render-adapter",
          message: "project.render.mode = 'webgpu' but navigator.gpu is undefined — falling back to WebGL.",
          details: { requestedMode: "webgpu", effectiveMode: "webgl" }
        });
      } else {
        // eslint-disable-next-line no-console
        // agf-allow:console pre-runtime fallback — adapter constructor runs before the bus is wired in tests / non-runtime spikes.
        console.warn("[AGF] project.render.mode = 'webgpu' but navigator.gpu is undefined — falling back to WebGL.");
      }
      mode = "webgl";
    }
    this.capabilities = mode === "webgpu" ? WEBGPU_CAPABILITIES : WEBGL_CAPABILITIES;
    // Scene-bound setup runs synchronously on both paths: the renderer
    // device isn't needed for scene / background / fallback-lighting
    // construction, so this works even before the WebGPU device exists.
    this.scene = new Scene();
    if (options.skyGradient !== undefined) {
      this.scene.background = createGradientTexture(options.skyGradient);
    } else if (options.background !== undefined) {
      this.scene.background = new Color(options.background);
    }
    // Fallback lighting until LightLifecycleSystem (or the user's scene)
    // provides ECS Light entities. `disableFallbackLighting` removes them
    // once an ECS light is acquired.
    this.enableFallbackLighting();
    // M21-context-loss: canvas-bound listeners are cheap to attach now
    // even though the WebGPU device hasn't been created yet — the
    // browser fires `webglcontextlost`/`webglcontextrestored` on the
    // canvas, not on a renderer instance.
    if (options.onContextLost !== undefined) {
      const onLost = (event: Event): void => {
        // Without preventDefault the browser does not attempt to
        // restore the context.
        event.preventDefault();
        options.onContextLost?.();
      };
      this.canvas.addEventListener("webglcontextlost", onLost);
      this.contextLostListener = onLost;
    }
    if (options.onContextRestored !== undefined) {
      const onRestored = (): void => {
        options.onContextRestored?.();
      };
      this.canvas.addEventListener("webglcontextrestored", onRestored);
      this.contextRestoredListener = onRestored;
    }
    if (mode === "webgpu") {
      // S70 WEBGPU-lazy-import: defer device construction (which needs
      // the dynamic `three/webgpu` import + an async `GPUAdapter`
      // request) until `init()`. The options snapshot is consumed there.
      this.pendingOptions = options;
    } else {
      this.device = new WebGLRenderer({
        canvas: options.canvas,
        antialias: true,
        preserveDrawingBuffer: true
      });
      this.applyDeviceSetup(options);
    }
  }

  /**
   * S70 WEBGPU-lazy-import. Device-dependent configuration shared by the
   * WebGL constructor path and the WebGPU init() path. Runs after
   * `this.device` is assigned; nothing here references `this.scene` /
   * `enableFallbackLighting()` / context-loss listeners, which are set
   * up earlier in the constructor on both paths.
   */
  private applyDeviceSetup(options: AdapterOptions): void {
    // M21-frame-timing: by default three.js resets `info.render.*` on
    // every `.render()` call. With EffectComposer (FXAA / Bloom /
    // OutputPass) one frame issues 3+ `.render()` invocations and the
    // counters we expose via `rendererInfo()` end up showing only the
    // LAST pass's stats — typically a single full-screen quad, hence
    // the misleading `drawCalls: 1` an agent sees from `__agf.rendererInfo()`.
    //
    // Disable autoReset + reset manually at the start of `draw()` so
    // `info.render.calls / triangles` accumulate across every pass in
    // the frame.
    this.device.info.autoReset = false;
    if (this.capabilities.kind === "webgl") {
      // S54 RUNTIME-gpu-timing: probe for the WebGL2 timer-query extension.
      // Browsers behind privacy modes (Safari, Firefox-RFP) silently return
      // null — that's expected and the runtime reports `gpuMs: undefined`.
      const rawCtx = this.device.getContext();
      if (typeof WebGL2RenderingContext !== "undefined" && rawCtx instanceof WebGL2RenderingContext) {
        const ext = rawCtx.getExtension("EXT_disjoint_timer_query_webgl2") as
          | {
              TIME_ELAPSED_EXT: number;
              GPU_DISJOINT_EXT: number;
            }
          | null;
        if (ext !== null) {
          this.gpuTimer = new GpuTimer(rawCtx, ext);
        }
      }
    } else {
      // WebGPU path: `trackTimestamp: true` was passed to the renderer
      // constructor in init(); the helper just throttles
      // `resolveTimestampsAsync` and reads `info.render.timestamp`.
      this.webGpuTimer = new WebGpuTimer(this.device as unknown as WebGpuTimerHost);
    }
    // M21-shadow-basic: enable shadow rendering globally. Per-light + per-mesh
    // opt-in still happens via `setLightCastShadow` / `setMeshCastShadow` etc.
    //
    // PCFShadowMap (4-tap PCF) is the default-recommended type in r184+.
    // PCFSoftShadowMap was deprecated and aliases to PCFShadowMap; calling it
    // directly produced a noisy console warning. VSM is a future stretch
    // (Phase 3) but is not the default — it changes the artifact profile.
    this.device.shadowMap.enabled = true;
    this.device.shadowMap.type = shadowAlgorithmType(options.shadowAlgorithm, this.capabilities.kind);
    // The WebGL PCSS implementation patches three.js's shadow shader
    // chunks via `onBeforeCompile` — no-op on WebGPU where the shader
    // is built from TSL nodes and the soft-PCF filter is selected by
    // `shadowMap.type = PCFSoftShadowMap` instead (see
    // `shadowAlgorithmType` above).
    if (options.shadowAlgorithm === "pcss" && this.capabilities.kind === "webgl") {
      applyPcssShadowChunks();
    }
    // M21-color: tone-mapping is opt-in (default "none" / linear clamp)
    // so existing projects look identical after the upgrade. Projects
    // that want ACES Filmic / AgX highlight roll-off set
    // `project.json#render.color.toneMapping: "aces-filmic"`.
    const toneMappingKind = options.color?.toneMapping ?? "none";
    this.device.toneMapping = TONE_MAPPING_BY_KIND[toneMappingKind];
    this.device.toneMappingExposure = options.color?.exposure ?? 1;
    // Lower the transmission pre-pass resolution when requested. Three.js
    // renders the whole opaque scene into this RT every frame so refraction
    // can sample it. At 0.5 the cost halves and refraction stays visually
    // identical because `roughness` already mip-blurs the result.
    if (options.color?.transmissionResolutionScale !== undefined) {
      this.device.transmissionResolutionScale = options.color.transmissionResolutionScale;
    }
  }


  /**
   * S66 WEBGPU-shadermaterial-audit. Walks the scene + every light's
   * shadowMap material + the scene.environment + composer passes and
   * returns a per-class count of every material instance the next
   * render frame will touch. Used to identify which `ShaderMaterial`
   * instances `three/webgpu`'s `PostProcessing` (TSL `NodeBuilder`)
   * rejects.
   */
  auditMaterialClasses(): Record<string, number> {
    const counts: Record<string, number> = {};
    const add = (mat: { type?: string } | { type?: string }[] | undefined): void => {
      if (mat === undefined) return;
      if (Array.isArray(mat)) {
        for (const m of mat) add(m);
        return;
      }
      const name = mat.type ?? "<unknown>";
      counts[name] = (counts[name] ?? 0) + 1;
    };
    this.scene.traverse((obj) => {
      const m = (obj as { material?: unknown }).material as { type?: string } | undefined;
      if (m !== undefined) add(m as never);
      // ShadowMaterial swap on shadow casters via customDepthMaterial:
      const cdm = (obj as { customDepthMaterial?: unknown }).customDepthMaterial;
      const cdrm = (obj as { customDistanceMaterial?: unknown }).customDistanceMaterial;
      if (cdm) add(cdm as never);
      if (cdrm) add(cdrm as never);
    });
    // Lights with shadow maps own internal depth materials reachable
    // via shadow.camera but the actual MeshDepthMaterial / MeshDistance
    // is constructed per-pass inside three.js — not on the light
    // object. Document this gap separately.
    for (const light of this.lights.values()) {
      if (light.castShadow) {
        counts[`<shadow-pass-for:${light.type}>`] = (counts[`<shadow-pass-for:${light.type}>`] ?? 0) + 1;
      }
    }
    // Composer passes (WebGL path only).
    if (this.composer !== undefined) {
      for (const pass of this.composer.passes) {
        counts[`<composer:${pass.constructor.name}>`] = (counts[`<composer:${pass.constructor.name}>`] ?? 0) + 1;
      }
    }
    return counts;
  }

  /**
   * S61 WEBGPU-init-async. WebGPURenderer's `init()` asks for a
   * `GPUAdapter` + `GPUDevice` asynchronously; the runtime must `await
   * adapter.init()` before any `acquireMesh` / `draw` call. Resolves
   * synchronously on the WebGL path.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.capabilities.kind === "webgpu") {
      // S70 WEBGPU-lazy-import. The `three/webgpu` entrypoint is loaded
      // dynamically (~145 KB gzipped) so projects that opt out don't
      // pay for it. The module loader memoises so re-init across
      // adapter rebuilds shares the same module.
      this.webGpuModule = await loadWebGpuModule();
      const options = this.pendingOptions;
      this.pendingOptions = undefined;
      if (options === undefined) {
        throw new Error("[AGF] WebGPU adapter init() called without pending options snapshot");
      }
      // S61 WEBGPU-adapter-core. `WebGPURenderer`'s constructor is
      // synchronous; the async `init()` (which asks for a GPUAdapter
      // + GPUDevice) is awaited below. Cast through `unknown` because
      // three.js's WebGPURenderer extends a different base than
      // WebGLRenderer — the public surface we use (render / setSize /
      // setPixelRatio / dispose / shadowMap / info / toneMapping*)
      // overlaps but TypeScript's structural check can't see it.
      //
      // S70 WEBGPU-gpu-timer: opt into GPU timestamp queries. Three.js
      // automatically falls back to `false` if the underlying GPUDevice
      // doesn't advertise `timestamp-query`, so this is safe to always
      // pass. `trackTimestamp` is forwarded to the backend constructor
      // (`common/Backend.js`) but is not in the public JSDoc types.
      const renderer = new this.webGpuModule.WebGPURenderer({
        canvas: this.canvas,
        antialias: true,
        trackTimestamp: true
      } as unknown as ConstructorParameters<WebGpuModule["WebGPURenderer"]>[0]);
      this.device = renderer as unknown as WebGLRenderer;
      this.applyDeviceSetup(options);
      // `WebGPURenderer.init()` is async on the WebGPU backend (asks for
      // a GPUAdapter + GPUDevice from the browser).
      await (this.device as unknown as { init(): Promise<void> }).init();
    }
    this.initialized = true;
  }

  enableFallbackLighting(): void {
    if (this.fallbackAmbient !== undefined || this.fallbackDirectional !== undefined) return;
    this.fallbackAmbient = new AmbientLight(0xffffff, 0.6);
    this.scene.add(this.fallbackAmbient);
    this.fallbackDirectional = new DirectionalLight(0xffffff, 0.85);
    this.fallbackDirectional.position.set(5, 10, 7);
    this.scene.add(this.fallbackDirectional);
  }

  disableFallbackLighting(): void {
    if (this.fallbackAmbient !== undefined) {
      this.scene.remove(this.fallbackAmbient);
      this.fallbackAmbient.dispose();
      this.fallbackAmbient = undefined;
    }
    if (this.fallbackDirectional !== undefined) {
      this.scene.remove(this.fallbackDirectional);
      this.fallbackDirectional.dispose();
      this.fallbackDirectional = undefined;
    }
  }

  hasFallbackLighting(): boolean {
    return this.fallbackAmbient !== undefined || this.fallbackDirectional !== undefined;
  }

  /**
   * Apply an image-based-lighting environment that drives PBR
   * reflections + indirect diffuse on MeshStandardMaterial /
   * MeshPhysicalMaterial:
   * - `none` — clears the environment.
   * - `generated` — builds Three.js's `RoomEnvironment` via PMREMGenerator.
   * - `hdr` — fetches an equirectangular `.hdr` file via RGBELoader,
   *   pre-filters with PMREMGenerator, applies as the scene environment.
   *
   * Idempotent on `generated` / `none`; `hdr` always reloads when the
   * URL changes (cheap if the browser caches the file).
   */
  setEnvironment(spec: EnvironmentSpec | "generated" | "none"): void {
    const normalised: EnvironmentSpec =
      typeof spec === "string" ? { kind: spec } : spec;
    if (normalised.kind === "none") {
      if (this.currentEnvironmentKind === "none") return;
      this.scene.environment = null;
      this.currentEnvironmentTexture?.dispose();
      this.currentEnvironmentTexture = undefined;
      this.currentEnvironmentKind = "none";
      return;
    }
    // S62 WEBGPU-hdr-ibl / WEBGPU-generated-env. `three/webgpu` ships its
    // own `PMREMGenerator` that drives the WebGPU node-material runtime;
    // we lazy-construct the right one depending on the adapter mode so
    // both `generated` (RoomEnvironment) and `hdr` paths produce real
    // IBL on either renderer.
    if (this.pmrem === undefined) {
      // S62 WEBGPU-hdr-ibl: `three/webgpu` ships its own PMREMGenerator
      // that takes the new Renderer base class — pass the WebGPURenderer
      // through `unknown` because TypeScript doesn't see the structural
      // overlap with WebGLRenderer.
      this.pmrem =
        this.capabilities.kind === "webgpu" && this.webGpuModule !== undefined
          ? (new this.webGpuModule.PMREMGenerator(this.device as unknown as never) as unknown as PMREMGenerator)
          : new PMREMGenerator(this.device);
      this.pmrem.compileEquirectangularShader();
    }
    if (normalised.kind === "generated") {
      if (this.currentEnvironmentKind === "generated") return;
      this.currentEnvironmentTexture?.dispose();
      const envScene = new RoomEnvironment();
      const rt = this.pmrem.fromScene(envScene, 0.04);
      this.currentEnvironmentTexture = rt.texture;
      this.scene.environment = rt.texture;
      this.currentEnvironmentKind = "generated";
      return;
    }
    // M21-env-hdr: load equirect HDR + pre-filter through PMREM. The
    // load is async; we tear the existing env down only once the new
    // texture is ready so the scene doesn't flash unlit during the
    // round-trip.
    if (normalised.kind === "hdr") {
      const url = normalised.url;
      const intensity = normalised.intensity ?? 1;
      const asBackground = normalised.asBackground === true;
      const blur = normalised.backgroundBlurriness;
      const groundedSpec = normalised.groundedSkybox;
      new RGBELoader().load(url, (texture) => {
        const pmrem = this.pmrem;
        if (pmrem === undefined) return;
        const rt = pmrem.fromEquirectangular(texture);
        this.currentEnvironmentTexture?.dispose();
        this.currentEnvironmentTexture = rt.texture;
        this.scene.environment = rt.texture;
        this.scene.environmentIntensity = intensity;
        // EquirectangularReflectionMapping lets three.js render the
        // equirect HDR as a sky (both for `scene.background` and
        // GroundedSkybox).
        texture.mapping = EquirectangularReflectionMapping;
        if (asBackground) {
          this.scene.background = texture;
          this.scene.backgroundIntensity = intensity;
          this.scene.backgroundBlurriness = blur ?? 0;
        }
        // S57 GROUND-skybox: the helper wants the raw equirect HDR (NOT
        // the PMREM cubemap — that's mip-filtered for IBL and projects
        // softly through the helper's geometry). We just made the
        // equirect available; reuse it.
        this.mountGroundedSkybox(groundedSpec, texture);
        if (!asBackground && groundedSpec === undefined) {
          texture.dispose();
        }
        this.currentEnvironmentKind = "hdr";
      });
      return;
    }
    // M21-env-cube: 6-face cubemap. CubeTextureLoader returns a single
    // CubeTexture; PMREM produces the IBL-ready render target. Same
    // swap-once-ready ordering as the HDR path.
    if (normalised.kind === "cube") {
      const intensity = normalised.intensity ?? 1;
      const asBackground = normalised.asBackground === true;
      const blur = normalised.backgroundBlurriness;
      const groundedSpec = normalised.groundedSkybox;
      new CubeTextureLoader().load(
        normalised.faces as unknown as string[],
        (cubeTexture) => {
          const pmrem = this.pmrem;
          if (pmrem === undefined) return;
          const rt = pmrem.fromCubemap(cubeTexture);
          this.currentEnvironmentTexture?.dispose();
          this.currentEnvironmentTexture = rt.texture;
          this.scene.environment = rt.texture;
          this.scene.environmentIntensity = intensity;
          if (asBackground) {
            this.scene.background = cubeTexture;
            this.scene.backgroundIntensity = intensity;
            this.scene.backgroundBlurriness = blur ?? 0;
          } else if (groundedSpec === undefined) {
            cubeTexture.dispose();
          }
          this.mountGroundedSkybox(groundedSpec, rt.texture);
          this.currentEnvironmentKind = "cube";
        }
      );
    }
  }

  currentEnvironment(): EnvironmentKind {
    return this.currentEnvironmentKind;
  }

  // ---- S57 REFLECTION-cube-probe ----

  private readonly reflectionProbes = new Map<
    number,
    {
      cubeCam: CubeCamera;
      renderTarget: WebGLCubeRenderTarget;
      // S59 REFLECTION-prefilter: when `prefilter === "pmrem"` we run the
      // raw cubemap through PMREMGenerator after each cubeCam.update.
      // `prefilteredTarget` holds the most-recent prefiltered RT (dispose
      // + replace per regen). `prefilterLastMs` records the regen time.
      prefilter: "mipmap" | "pmrem";
      prefilteredTarget: WebGLRenderTarget | undefined;
      prefilterLastMs: number;
    }
  >();
  private nextReflectionProbeHandle = 1;
  // S59 PERF-renderer-info: total PMREM regen time across all probes this
  // frame, reset at the top of every probe update cycle. Read by
  // `rendererInfo()` so agents can budget against it.
  private reflectionPrefilterMsThisFrame = 0;

  acquireReflectionProbe(spec: {
    size: 128 | 256 | 512;
    near: number;
    far: number;
    prefilter?: "mipmap" | "pmrem";
  }): number {
    // generateMipmaps + LinearMipmapLinearFilter lets MeshStandard/
    // MeshPhysicalMaterial sample the cube map at roughness > 0 with a
    // box-filtered mip chain — close-enough blurry reflection for
    // moderate-roughness surfaces. For physically-accurate PBR-roughness
    // reflection (rough > 0.3), opt the probe into `prefilter: "pmrem"`
    // and the runtime will run a GGX prefilter after every cube render.
    //
    // S64 WEBGPU-reflection-probe: `three/webgpu` ships its own
    // `CubeRenderTarget` (different class than WebGL's
    // `WebGLCubeRenderTarget`) compatible with `WebGPURenderer`.
    // CubeCamera works on both renderers and reads `.texture` from
    // either RT class.
    const renderTarget = this.capabilities.kind === "webgpu" && this.webGpuModule !== undefined
      ? (new this.webGpuModule.CubeRenderTarget(spec.size, {
          type: HalfFloatType,
          generateMipmaps: true,
          minFilter: LinearMipmapLinearFilter
        }) as unknown as WebGLCubeRenderTarget)
      : new WebGLCubeRenderTarget(spec.size, {
          type: HalfFloatType,
          generateMipmaps: true,
          minFilter: LinearMipmapLinearFilter
        });
    const cubeCam = new CubeCamera(spec.near, spec.far, renderTarget);
    // INTENTIONALLY NOT added to scene. CubeCamera.update() only auto-
    // refreshes its world matrix when parent === null; if we add it to
    // the scene the matrixWorld stays one frame behind whatever we set
    // via setReflectionProbeTransform, and the captured cubemap reads
    // off-centre. CubeCamera doesn't need to be in the scene graph to
    // render — it owns its own face cameras + projects directly.
    const handle = this.nextReflectionProbeHandle++;
    this.reflectionProbes.set(handle, {
      cubeCam,
      renderTarget,
      prefilter: spec.prefilter ?? "mipmap",
      prefilteredTarget: undefined,
      prefilterLastMs: 0
    });
    return handle;
  }

  setReflectionProbeTransform(
    handle: number,
    position: readonly [number, number, number]
  ): void {
    const entry = this.reflectionProbes.get(handle);
    if (entry === undefined) return;
    entry.cubeCam.position.set(position[0], position[1], position[2]);
  }

  updateReflectionProbe(
    handle: number,
    hiddenObjects: ReadonlyArray<Object3D>
  ): void {
    const entry = this.reflectionProbes.get(handle);
    if (entry === undefined) return;
    // S71 shadow-flicker fix. The `hiddenObjects` list — typically the
    // probe owner + its pedestal — is intentionally NOT applied as an
    // `obj.visible = false` toggle around the cube-bake. Verified
    // experimentally on WebGPU material-bench: toggling visibility off
    // during the bake hid the centre sphere/pedestal from the WebGPU
    // shadow pass too (three.js's `ShadowNode.updateBefore` iterates
    // the scene by `visible`, and a cube bake runs 6 sub-camera frames
    // inside one tick — the shadow texture got rebaked with the
    // probe-owner NOT a caster on the last of those 6 sub-cameras,
    // lingered into the main render's frame, and produced the visible
    // shadow flicker under the centre sphere/cylinder that the user
    // reported at probe-bake cadence). Removing the toggle eliminates
    // the flicker.
    //
    // What about the probe-owner appearing in its own cube capture?
    // The cube camera sits AT the probe owner's world position. For a
    // sphere-shaped probe owner the camera is INSIDE the geometry and
    // backface culling makes it invisible to the cube camera for free.
    // For non-sphere probe owners (a flat plate, a cylinder closer than
    // the near plane, etc.) the cube capture may include parts of the
    // owner from the inside; today's example projects all use sphere
    // probe owners so the trade-off is invisible. A future story can
    // bring back proper exclusion via per-light
    // `shadow.camera.layers.enable(PROBE_HIDDEN_LAYER)` + matching
    // object/camera layer setup if a project needs it; document the
    // need rather than re-introduce the visibility toggle.
    void hiddenObjects;
    entry.cubeCam.updateMatrixWorld(true);
    entry.cubeCam.update(this.device, this.scene);
    // S59 REFLECTION-prefilter: run GGX prefilter through PMREMGenerator
    // when the probe asked for it. fromCubemap allocates a new RT every
    // call; we dispose the previous to bound memory. Cost is ~4–6× a
    // single face render, so pair with a low `updateRate` (15 Hz).
    if (entry.prefilter === "pmrem") {
      if (this.probePmrem === undefined) {
        // S71 BUG-FIX (final). Probes get their OWN PMREMGenerator so
        // their internal pingpong (named "PMREM.cubeUv") doesn't get
        // dispose+recreated when `setEnvironment` pushes a different
        // cubemap size through the SAME generator. Also use the
        // backend-correct class on WebGPU vs WebGL.
        if (this.capabilities.kind === "webgpu" && this.webGpuModule !== undefined) {
          this.probePmrem = new this.webGpuModule.PMREMGenerator(
            this.device as unknown as never
          ) as unknown as PMREMGenerator;
        } else {
          this.probePmrem = new PMREMGenerator(this.device);
        }
      }
      const pmrem = this.probePmrem;
      const t0 = performance.now();
      // S71 WEBGPU-deferred-dispose. Ring of 3 prefiltered RTs:
      //   prefilteredTargetPrev (2 bakes ago) -- safe to dispose now;
      //                                          any GPU submit that
      //                                          referenced it has long
      //                                          since completed.
      //   prefilteredTarget     (1 bake ago)  -- may still be bound on
      //                                          materials' envMap and
      //                                          referenced in the
      //                                          most-recent submit's
      //                                          command buffer; DO NOT
      //                                          dispose this frame.
      //   next                  (this bake)   -- becomes the new
      //                                          prefilteredTarget.
      // S71 WEBGPU-pmrem-reuse-target. Pass the existing prefilteredTarget
      // back to `fromCubemap` so three.js fills the SAME RT in place
      // instead of allocating a new one each call. Result:
      //   - No `prefilteredTarget` dispose during runtime — fixes the
      //     "Destroyed texture [PMREM.cubeUv] used in a submit" warning
      //     spam from Chrome's WebGPU validation that previously broke
      //     material-bench (the texture got destroyed while a previous
      //     bake's submit was still in flight, and the renderer entered
      //     an error state).
      //   - Texture object pointer stays stable across bakes; entities
      //     with `EnvmapBinding` keep their existing `material.envMap`
      //     reference and don't need to be re-patched.
      //   - The bound-texture memo in `reflection-probe-system` will see
      //     the same Texture object and short-circuit the patch (no
      //     spurious `material.needsUpdate` per frame).
      //
      // First call (entry.prefilteredTarget is undefined) lets
      // PMREMGenerator allocate a new RT; subsequent calls reuse it.
      const next = pmrem.fromCubemap(
        entry.renderTarget.texture,
        entry.prefilteredTarget ?? null
      ) as unknown as WebGLRenderTarget;
      entry.prefilteredTarget = next;
      const ms = performance.now() - t0;
      entry.prefilterLastMs = ms;
      this.reflectionPrefilterMsThisFrame += ms;
    }
  }

  /**
   * Reset accumulated probe-prefilter ms — called at the top of every
   * probe system frame so `rendererInfo().prefilterMs` reflects ONLY the
   * current frame's PMREM cost.
   */
  resetReflectionPrefilterTimings(): void {
    this.reflectionPrefilterMsThisFrame = 0;
  }

  reflectionProbeTexture(handle: number): Texture | undefined {
    const entry = this.reflectionProbes.get(handle);
    if (entry === undefined) return undefined;
    if (entry.prefilter === "pmrem" && entry.prefilteredTarget !== undefined) {
      return entry.prefilteredTarget.texture;
    }
    return entry.renderTarget.texture;
  }

  /** S59 PERF-renderer-info — read by `rendererInfo()`. */
  reflectionProbeCount(): number {
    return this.reflectionProbes.size;
  }

  /** S59 PERF-renderer-info — total PMREM regen ms across all probes this frame. */
  reflectionPrefilterMs(): number {
    return this.reflectionPrefilterMsThisFrame;
  }

  releaseReflectionProbe(handle: number): void {
    const entry = this.reflectionProbes.get(handle);
    if (entry === undefined) return;
    this.scene.remove(entry.cubeCam);
    entry.renderTarget.dispose();
    if (entry.prefilteredTarget !== undefined) entry.prefilteredTarget.dispose();
    this.reflectionProbes.delete(handle);
  }

  /** Look up the Three.js mesh for an entity — needed by `ReflectionProbeSystem` to hide excluded entities. */
  meshForHandle(handle: number): Object3D | undefined {
    return this.meshes.get(handle);
  }

  // S59 REFLECTION-planar: per-entity planar mirror via three.js's
  // `Reflector` helper. Unlike ReflectionProbe (cube capture, works on
  // any geometry), Reflector renders the scene through a portal-style
  // RTT for a single flat surface — perfect for water / lobby floor /
  // smooth glass tile. Cost is one extra full-scene render per mirror
  // per frame.
  // S72 WEBGPU-planar-mirror. Two storage shapes for the same logical
  // handle: WebGL keeps `mirror: Reflector` (Reflector IS a Mesh
  // subclass — single object on the scene); WebGPU keeps `mesh: Mesh +
  // material: MeshBasicNodeMaterial + reflectorTarget: Object3D`. The
  // ReflectorNode's `target` Object3D is parented to the mesh so the
  // mirror plane follows the mesh's transform (set via
  // setPlanarMirrorTransform).
  private readonly planarMirrors = new Map<
    number,
    | { kind: "webgl"; mirror: Reflector }
    | { kind: "webgpu"; mesh: Mesh; material: Material; reflectorTarget: Object3D }
  >();
  private nextPlanarMirrorHandle = 1;

  acquirePlanarMirror(spec: {
    width: number;
    height: number;
    resolution: number;
    color?: string;
  }): number {
    const handle = this.nextPlanarMirrorHandle++;
    if (this.capabilities.kind === "webgpu") {
      if (this.webGpuModule === undefined) {
        throw new Error("[AGF] acquirePlanarMirror requires webGpuModule on the WebGPU adapter; call adapter.init() first.");
      }
      // TSL ReflectorNode + node-material pattern. The `reflector()`
      // factory returns a TextureNode that captures live reflections;
      // we attach it to a `MeshBasicNodeMaterial.colorNode` so the
      // mirror plane shows pure reflection (the WebGL `Reflector`
      // class similarly renders an unlit colored-reflection surface).
      // `resolutionScale: 0.5` matches the original `Reflector`'s
      // `textureWidth / textureHeight: resolution` budget at half the
      // viewport — keep it cheap on real GPU. The `target` Object3D
      // (which the reflector base node uses to derive the mirror plane)
      // becomes a child of the host mesh so transform updates propagate.
      const reflectorNode = this.webGpuModule.reflector({ resolutionScale: 0.5 });
      const material = new this.webGpuModule.MeshBasicNodeMaterial();
      // S73 WEBGPU-reflection-tint. The WebGL `Reflector` multiplies
      // the reflected RGB by `color` in its internal ShaderMaterial.
      // TSL equivalent: `reflector.mul(color(hex))` evaluates per-pixel
      // and lands in `material.colorNode`. Defaulting the tint to the
      // same #88aaff the WebGL path uses keeps water-bench visually
      // close on both renderers; projects that want pure reflection
      // can pass `"#ffffff"`.
      const tint = this.webGpuModule.color(spec.color ?? "#88aaff");
      (material as unknown as { colorNode: unknown }).colorNode =
        reflectorNode.mul(tint as TslColorNode);
      const geometry = new PlaneGeometry(spec.width, spec.height);
      const mesh = new Mesh(geometry, material as unknown as Material);
      mesh.add((reflectorNode as unknown as { target: Object3D }).target);
      this.scene.add(mesh);
      this.planarMirrors.set(handle, {
        kind: "webgpu",
        mesh,
        material: material as unknown as Material,
        reflectorTarget: (reflectorNode as unknown as { target: Object3D }).target
      });
      return handle;
    }
    const geometry = new PlaneGeometry(spec.width, spec.height);
    const mirror = new Reflector(geometry, {
      textureWidth: spec.resolution,
      textureHeight: spec.resolution,
      color: new Color(spec.color ?? "#88aaff"),
      clipBias: 0.003
    });
    // Reflector geometry is a PlaneGeometry on the XY plane facing +Z;
    // matrix updates via setPlanarMirrorTransform put it where the
    // entity's LocalToWorld says.
    this.scene.add(mirror);
    this.planarMirrors.set(handle, { kind: "webgl", mirror });
    return handle;
  }

  setPlanarMirrorTransform(
    handle: number,
    ltw: { position: readonly number[]; rotation: readonly number[]; scale: readonly number[] }
  ): void {
    const entry = this.planarMirrors.get(handle);
    if (entry === undefined) return;
    const node: Object3D = entry.kind === "webgl" ? entry.mirror : entry.mesh;
    // LocalToWorld.rotation is 3-element XYZ Euler (radians) — matches the
    // shape `applyTransform` consumes for meshes / lights / cameras. Earlier
    // S59 impl read 4 values as a quaternion → undefined `w` → scrambled
    // orientation → mirror normal pointed roughly behind the camera, so the
    // water plane reflected nothing and read as black.
    node.position.set(ltw.position[0]!, ltw.position[1]!, ltw.position[2]!);
    node.rotation.set(ltw.rotation[0]!, ltw.rotation[1]!, ltw.rotation[2]!);
    node.scale.set(ltw.scale[0]!, ltw.scale[1]!, ltw.scale[2]!);
    node.updateMatrixWorld(true);
  }

  releasePlanarMirror(handle: number): void {
    const entry = this.planarMirrors.get(handle);
    if (entry === undefined) return;
    if (entry.kind === "webgl") {
      this.scene.remove(entry.mirror);
      entry.mirror.geometry.dispose();
      // Reflector materials are internal; dispose-on-remove is the helper's
      // documented teardown. The wrapping object3d is what matters.
      (entry.mirror.material as Material).dispose();
    } else {
      this.scene.remove(entry.mesh);
      entry.mesh.remove(entry.reflectorTarget);
      entry.mesh.geometry.dispose();
      entry.material.dispose();
    }
    this.planarMirrors.delete(handle);
  }

  planarMirrorCount(): number {
    return this.planarMirrors.size;
  }

  /**
   * S57 GROUND-skybox. Mounts (or replaces) the curved-bottom sky mesh
   * plus an invisible shadow-catcher plane at the same height. The
   * shadow-catcher uses ShadowMaterial — fully transparent except for
   * incoming shadow contribution — so light writes a soft falloff on
   * the virtual ground while the HDR shows through everywhere else.
   *
   * Pass `undefined` to remove both meshes.
   */
  private mountGroundedSkybox(
    spec: { height: number; radius: number } | undefined,
    envCubemap: Texture
  ): void {
    if (this.groundedSkyboxMesh !== undefined) {
      this.scene.remove(this.groundedSkyboxMesh);
      (this.groundedSkyboxMesh.material as Material).dispose();
      this.groundedSkyboxMesh.geometry.dispose();
      this.groundedSkyboxMesh = undefined;
    }
    if (this.groundedShadowMesh !== undefined) {
      this.scene.remove(this.groundedShadowMesh);
      (this.groundedShadowMesh.material as Material).dispose();
      this.groundedShadowMesh.geometry.dispose();
      this.groundedShadowMesh = undefined;
    }
    if (spec === undefined) return;
    // GroundedSkybox's `height` constructor arg controls the HDR
    // projection — larger values magnify the downward part of the
    // sky-sphere into the flat floor disk. The three.js docs example
    // pairs `height: 15` with `radius: 100` (ratio ≈ 6.6); the same
    // ratio reads well across project scales. AGF's `spec.height`
    // means "world Y where the virtual floor sits" (so it can be
    // negative); the projection magnitude is derived from radius.
    // Per the docs the mesh is positioned so its internal -height
    // floor line lands at world Y = mesh.position.y - height; we
    // want that to equal spec.height.
    const projectionHeight = Math.max(spec.radius / 6, 1);
    const sky = new GroundedSkybox(envCubemap, projectionHeight, spec.radius) as unknown as Mesh;
    sky.position.y = projectionHeight + spec.height;
    sky.name = "agf.grounded-skybox";
    this.scene.add(sky);
    this.groundedSkyboxMesh = sky;

    // Shadow-catcher: a large flat plane laid 1 mm above the grounded
    // sky mesh's floor line, using ShadowMaterial so it only contributes
    // the shadow lookup. The y-lift avoids z-fighting with the
    // skybox surface; `renderOrder = 1` keeps the transparent catcher
    // painted after the opaque sky in the same depth range.
    const catcher = new Mesh(
      new PlaneGeometry(spec.radius * 2, spec.radius * 2),
      new ShadowMaterial({ opacity: 0.6, transparent: true })
    );
    catcher.name = "agf.grounded-skybox-shadow";
    catcher.rotation.x = -Math.PI / 2;
    // 10 mm above the sky's flat-bottom disc avoids z-fighting on
    // GPUs with low depth precision at this scene scale.
    catcher.position.y = spec.height + 0.01;
    catcher.receiveShadow = true;
    catcher.renderOrder = 1;
    this.scene.add(catcher);
    this.groundedShadowMesh = catcher;
  }

  acquireLight(spec: LightAcquireSpec): LightHandle {
    const handle = this.nextLightHandle;
    this.nextLightHandle += 1;
    const color = new Color(spec.color ?? "#ffffff");
    const intensity = spec.intensity ?? 1;
    let light: Light;
    switch (spec.kind) {
      case "ambient":
        light = new AmbientLight(color, intensity);
        break;
      case "directional":
        light = new DirectionalLight(color, intensity);
        break;
      case "point":
        light = new PointLight(color, intensity, spec.distance ?? 0, spec.decay ?? 2);
        break;
      case "spot": {
        const spot = new SpotLight(
          color,
          intensity,
          spec.distance ?? 0,
          spec.angle ?? Math.PI / 4,
          spec.penumbra ?? 0,
          spec.decay ?? 2
        );
        // SpotLight needs its target as a Scene child for shadow camera updates.
        this.scene.add(spot.target);
        light = spot;
        break;
      }
      case "hemisphere":
        light = new HemisphereLight(
          color,
          new Color(spec.groundColor ?? "#000000"),
          intensity
        );
        break;
      case "rect-area":
        // The LUT init is per-renderer + idempotent; call once when the
        // first rect-area light arrives.
        if (!this.rectAreaUniformsReady) {
          RectAreaLightUniformsLib.init();
          this.rectAreaUniformsReady = true;
        }
        light = new RectAreaLight(color, intensity, spec.width ?? 1, spec.height ?? 1);
        break;
    }
    this.lights.set(handle, light);
    this.scene.add(light);
    return handle;
  }

  releaseLight(handle: LightHandle): void {
    const light = this.lights.get(handle);
    if (light === undefined) return;
    this.scene.remove(light);
    if (light instanceof SpotLight) this.scene.remove(light.target);
    light.dispose();
    this.lights.delete(handle);
  }

  setLightParams(handle: LightHandle, patch: LightPatch): void {
    const light = this.lights.get(handle);
    if (light === undefined) return;
    if (patch.color !== undefined) light.color.set(patch.color);
    if (patch.intensity !== undefined) light.intensity = patch.intensity;
    if (light instanceof PointLight) {
      if (patch.distance !== undefined) light.distance = patch.distance;
      if (patch.decay !== undefined) light.decay = patch.decay;
    }
    if (light instanceof SpotLight) {
      if (patch.distance !== undefined) light.distance = patch.distance;
      if (patch.decay !== undefined) light.decay = patch.decay;
      if (patch.angle !== undefined) light.angle = patch.angle;
      if (patch.penumbra !== undefined) light.penumbra = patch.penumbra;
    }
    if (light instanceof HemisphereLight && patch.groundColor !== undefined) {
      light.groundColor.set(patch.groundColor);
    }
    if (light instanceof RectAreaLight) {
      if (patch.width !== undefined) light.width = patch.width;
      if (patch.height !== undefined) light.height = patch.height;
    }
  }

  setLightTransform(handle: LightHandle, world: ResolvedWorld): void {
    const light = this.lights.get(handle);
    if (light === undefined) return;
    // Ambient lights ignore position; pushing it anyway is harmless and keeps the call site uniform.
    applyTransform(light, world);
    // S63 WEBGPU-light-investigation: three.js's WebGPU
    // HemisphereLightNode (r0.184) uses the light's world position to
    // derive its "up" direction — a HemisphereLight at world origin
    // (0, 0, 0) contributes nothing to material lighting on WebGPU,
    // unlike WebGL which always treats hemisphere direction as +Y
    // regardless of position. Force a small positive Y so the light
    // works on both renderers. Doesn't matter visually on WebGL since
    // position is ignored there.
    if (light instanceof HemisphereLight && light.position.y <= 0) {
      light.position.y = 1;
    }
  }

  setLightCastShadow(handle: LightHandle, cast: boolean, params: LightShadowParams = {}): void {
    const light = this.lights.get(handle);
    if (light === undefined) return;
    // AmbientLight doesn't support shadows; silently ignore. Directional /
    // point share the shadow surface but each picks a different camera type.
    if (!("shadow" in light) || (light as { shadow?: unknown }).shadow === undefined) return;
    light.castShadow = cast;
    if (!cast) return;
    const sl = light as DirectionalLight | PointLight;
    if (params.mapSize !== undefined) {
      sl.shadow.mapSize.set(params.mapSize, params.mapSize);
    }
    if (params.bias !== undefined) sl.shadow.bias = params.bias;
    if (params.normalBias !== undefined) sl.shadow.normalBias = params.normalBias;
    if (params.radius !== undefined) sl.shadow.radius = params.radius;
    if (params.camera !== undefined) {
      const cam = sl.shadow.camera as unknown as {
        left?: number;
        right?: number;
        top?: number;
        bottom?: number;
        near?: number;
        far?: number;
        updateProjectionMatrix(): void;
      };
      if (params.camera.left !== undefined) cam.left = params.camera.left;
      if (params.camera.right !== undefined) cam.right = params.camera.right;
      if (params.camera.top !== undefined) cam.top = params.camera.top;
      if (params.camera.bottom !== undefined) cam.bottom = params.camera.bottom;
      if (params.camera.near !== undefined) cam.near = params.camera.near;
      if (params.camera.far !== undefined) cam.far = params.camera.far;
      cam.updateProjectionMatrix();
    }
  }

  // ---- M21-shadow-static ----

  /**
   * Toggle `renderer.shadowMap.autoUpdate`. When false, the shadow
   * cascade(s) only re-render on `invalidateShadowMap()`. Useful for
   * scenes whose casters never move — saves a per-frame shadow pass.
   */
  setShadowMapAutoUpdate(enabled: boolean): void {
    this.device.shadowMap.autoUpdate = enabled;
    if (!enabled) {
      // Force one final bake so the texture isn't empty when we stop
      // auto-updating mid-frame.
      this.device.shadowMap.needsUpdate = true;
    }
  }

  /**
   * Schedule one shadow-map render on the next frame. Used by static
   * shadow scenes after a known caster moved (e.g. day/night, level
   * change). No-op when autoUpdate is on.
   */
  invalidateShadowMap(): void {
    this.device.shadowMap.needsUpdate = true;
  }

  setMeshShadowFlags(handle: MeshHandle, cast: boolean, receive: boolean): void {
    const mesh = this.meshes.get(handle);
    if (mesh === undefined) return;
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
  }

  hasLight(handle: LightHandle): boolean {
    return this.lights.has(handle);
  }

  lightCount(): number {
    return this.lights.size;
  }

  // ---- M17 InstancedMesh buckets ----

  acquireBucket(spec: BucketAcquireSpec): BucketHandle {
    // When `useInstanceColor` is on, the material's base color stays white
    // and each instance modulates via its own `instanceColor` attribute.
    // Material is compiled once with the attribute attached.
    const baseColor = spec.useInstanceColor === true ? "#ffffff" : spec.color ?? DEFAULT_COLOR;
    const materialOpts: ConstructorParameters<typeof MeshStandardMaterial>[0] = {
      color: new Color(baseColor)
    };
    if (spec.materialParams !== undefined) {
      const p = spec.materialParams;
      if (p.roughness !== undefined) materialOpts.roughness = p.roughness;
      if (p.metalness !== undefined) materialOpts.metalness = p.metalness;
      if (p.emissive !== undefined) materialOpts.emissive = new Color(p.emissive);
    }
    const material = new MeshStandardMaterial(materialOpts);
    this.registerWithCsm(material);
    const mesh = new InstancedMesh(spec.geometry, material, spec.capacity);
    mesh.count = 0;
    // S50 perf: enable per-bucket frustum culling. Three's
    // InstancedMesh.computeBoundingSphere walks every instance's
    // transform to produce an enclosing sphere; once set,
    // frustumCulled=true skips the whole bucket when its sphere is
    // outside the camera frustum (main pass + every CSM cascade). We
    // recompute the sphere lazily via `recomputeBucketBoundingSphere`
    // after the BatchingSystem finishes adding/removing instances.
    mesh.frustumCulled = true;
    mesh.castShadow = spec.castShadow !== false;
    mesh.receiveShadow = spec.receiveShadow !== false;
    if (spec.useInstanceColor === true) {
      // Pre-fill with white so freshly-added instances render neutrally
      // until the first `setBucketInstanceColor` writes a real colour.
      const colors = new Float32Array(spec.capacity * 3);
      colors.fill(1);
      mesh.instanceColor = new InstancedBufferAttribute(colors, 3);
    }
    this.scene.add(mesh);
    return this.buckets.acquire({ mesh, capacity: spec.capacity, liveSlots: new Set() });
  }

  /**
   * Re-walk the bucket's per-instance transforms to update its
   * enclosing bounding sphere. Three.js relies on this sphere for
   * frustum culling. Cheap (~one Vec3 + sqrt per live instance).
   */
  recomputeBucketBoundingSphere(handle: BucketHandle): void {
    const entry = this.buckets.get(handle);
    if (entry === undefined) return;
    entry.mesh.computeBoundingSphere();
  }

  releaseBucket(handle: BucketHandle): void {
    const entry = this.buckets.release(handle);
    if (entry === undefined) return;
    this.scene.remove(entry.mesh);
    entry.mesh.dispose();
    entry.mesh.geometry.dispose();
    disposeMaterial(entry.mesh.material);
  }

  resizeBucket(handle: BucketHandle, newCapacity: number): void {
    const entry = this.buckets.get(handle);
    if (entry === undefined) return;
    if (newCapacity <= entry.capacity) return;
    // Recreate the InstancedMesh with a larger ring; copy live matrices over.
    const oldMesh = entry.mesh;
    const newMesh = new InstancedMesh(oldMesh.geometry, oldMesh.material, newCapacity);
    newMesh.castShadow = oldMesh.castShadow;
    newMesh.receiveShadow = oldMesh.receiveShadow;
    newMesh.frustumCulled = oldMesh.frustumCulled;
    newMesh.count = oldMesh.count;
    for (const slot of entry.liveSlots) {
      oldMesh.getMatrixAt(slot, this.scratchMatrix);
      newMesh.setMatrixAt(slot, this.scratchMatrix);
    }
    newMesh.instanceMatrix.needsUpdate = true;
    // Preserve per-instance colour when the bucket carries one.
    if (oldMesh.instanceColor !== null && oldMesh.instanceColor !== undefined) {
      const newColors = new Float32Array(newCapacity * 3);
      newColors.fill(1);
      const oldArray = oldMesh.instanceColor.array as Float32Array;
      newColors.set(oldArray.subarray(0, Math.min(oldArray.length, newColors.length)));
      newMesh.instanceColor = new InstancedBufferAttribute(newColors, 3);
    }
    this.scene.remove(oldMesh);
    oldMesh.dispose();
    // Don't dispose geometry/material — newMesh shares them.
    this.scene.add(newMesh);
    entry.mesh = newMesh;
    entry.capacity = newCapacity;
  }

  addBucketInstance(handle: BucketHandle): InstanceIndex | undefined {
    const entry = this.buckets.get(handle);
    if (entry === undefined) return undefined;
    if (entry.liveSlots.size >= entry.capacity) return undefined;
    // Fill the lowest free slot < count, else extend count.
    let slot = entry.mesh.count;
    for (let i = 0; i < entry.mesh.count; i += 1) {
      if (!entry.liveSlots.has(i)) {
        slot = i;
        break;
      }
    }
    if (slot >= entry.mesh.count) {
      entry.mesh.count = slot + 1;
    }
    entry.liveSlots.add(slot);
    return slot;
  }

  removeBucketInstance(handle: BucketHandle, index: InstanceIndex): void {
    const entry = this.buckets.get(handle);
    if (entry === undefined) return;
    if (!entry.liveSlots.has(index)) return;
    // Zero-scale the instance so it vanishes; the slot becomes reusable.
    this.scratchMatrix.makeScale(0, 0, 0);
    entry.mesh.setMatrixAt(index, this.scratchMatrix);
    entry.mesh.instanceMatrix.needsUpdate = true;
    entry.liveSlots.delete(index);
    // Tighten the count when we pop the tail.
    while (entry.mesh.count > 0 && !entry.liveSlots.has(entry.mesh.count - 1)) {
      entry.mesh.count -= 1;
    }
  }

  setBucketInstanceTransform(
    handle: BucketHandle,
    index: InstanceIndex,
    world: ResolvedWorld
  ): void {
    const entry = this.buckets.get(handle);
    if (entry === undefined || !entry.liveSlots.has(index)) return;
    this.scratchPosition.set(world.position[0], world.position[1], world.position[2]);
    this.scratchScale.set(world.scale[0], world.scale[1], world.scale[2]);
    eulerToQuaternion(world.rotation, this.scratchQuat);
    this.scratchMatrix.compose(this.scratchPosition, this.scratchQuat, this.scratchScale);
    entry.mesh.setMatrixAt(index, this.scratchMatrix);
    entry.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * M17-batchable-color-variants: stamp a per-instance colour on a
   * bucket slot. No-op if the bucket was acquired without
   * `useInstanceColor`. Three's InstancedMesh.setColorAt + needsUpdate
   * uploads the colour on the next draw.
   */
  setBucketInstanceColor(handle: BucketHandle, index: InstanceIndex, color: string): void {
    const entry = this.buckets.get(handle);
    if (entry === undefined || !entry.liveSlots.has(index)) return;
    const mesh = entry.mesh;
    if (mesh.instanceColor === null || mesh.instanceColor === undefined) return;
    mesh.setColorAt(index, this.scratchColor.set(color));
    mesh.instanceColor.needsUpdate = true;
  }

  bucketLiveCount(handle: BucketHandle): number {
    return this.buckets.get(handle)?.liveSlots.size ?? 0;
  }

  bucketCapacity(handle: BucketHandle): number {
    return this.buckets.get(handle)?.capacity ?? 0;
  }

  hasBucket(handle: BucketHandle): boolean {
    return this.buckets.has(handle);
  }

  // ---- M19-particle: additive InstancedMesh pools ----

  acquireParticlePool(spec: ParticlePoolAcquireSpec): ParticlePoolHandle {
    const radius = spec.radius ?? 0.05;
    const geometry = new IcosahedronGeometry(radius, 1);
    const color = new Color(spec.color);
    const material = new MeshBasicMaterial({
      color,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false
    });
    const mesh = new InstancedMesh(geometry, material, spec.capacity);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    this.scene.add(mesh);
    return this.particlePools.acquire({ mesh, capacity: spec.capacity });
  }

  /**
   * Set the live particle instances on a pool. `count` particles starting
   * from slot 0 use `transforms[i]` (matrix4) as their world matrix.
   * Slots beyond `count` are hidden via `mesh.count`. Caller MUST pass
   * `count <= capacity`.
   */
  setParticleInstances(
    handle: ParticlePoolHandle,
    transforms: ReadonlyArray<Matrix4>,
    count: number
  ): void {
    const entry = this.particlePools.get(handle);
    if (entry === undefined) return;
    const clamped = Math.max(0, Math.min(count, entry.capacity, transforms.length));
    for (let i = 0; i < clamped; i += 1) {
      entry.mesh.setMatrixAt(i, transforms[i]!);
    }
    entry.mesh.count = clamped;
    entry.mesh.instanceMatrix.needsUpdate = true;
  }

  releaseParticlePool(handle: ParticlePoolHandle): void {
    const entry = this.particlePools.release(handle);
    if (entry === undefined) return;
    this.scene.remove(entry.mesh);
    entry.mesh.dispose();
    entry.mesh.geometry.dispose();
    disposeMaterial(entry.mesh.material);
  }

  // ---- M17-batched-mesh: BatchedMesh buckets ----

  acquireBatchedBucket(spec: BatchedBucketAcquireSpec): BatchedBucketHandle {
    // S51 colour-parity: BatchedMesh always carries per-instance colour
    // (via `setColorAt` on the instance colours texture). The base
    // material colour multiplies with that per-instance colour, so we
    // anchor the material to white — otherwise spec.color or DEFAULT_COLOR
    // would square against the per-instance value and darken everything
    // (caught on shadows-bench when path: "batched" was first wired).
    const material = new MeshStandardMaterial({ color: new Color(spec.color ?? "#ffffff") });
    this.registerWithCsm(material);
    const mesh = new BatchedMesh(spec.maxInstances, spec.maxVertices, spec.maxIndices, material);
    // S51-BatchedMesh-perf: per-instance frustum culling is the headline
    // win over InstancedMesh — three.js tests each instance's bounding
    // sphere against the camera per render call (main + each cascade).
    // Whole-mesh frustumCulled stays off so the per-instance pass owns
    // visibility decisions; otherwise three.js would short-circuit on a
    // single mesh-level test before the per-instance loop runs.
    mesh.frustumCulled = false;
    mesh.perObjectFrustumCulled = true;
    mesh.castShadow = spec.castShadow !== false;
    mesh.receiveShadow = spec.receiveShadow !== false;
    this.scene.add(mesh);
    return this.batchedBuckets.acquire({
      mesh,
      liveInstances: new Set(),
      useBvh: spec.useBvh === true,
      bvhBuilt: false
    });
  }

  /**
   * S53 M17-bvh-extension: builds the BVH on the underlying
   * BatchedMesh once at least one instance exists. No-op when the
   * bucket wasn't acquired with `useBvh: true`, when the BVH has
   * already been built, or when the bucket is still empty.
   * BatchingSystem calls this once per frame for `batched-bvh` buckets
   * so the BVH lights up after initial population without exposing
   * three.ez internals to gameplay.
   */
  ensureBucketBvh(handle: BatchedBucketHandle): void {
    const entry = this.batchedBuckets.get(handle);
    if (entry === undefined) return;
    if (!entry.useBvh || entry.bvhBuilt) return;
    if (entry.liveInstances.size === 0) return;
    // The extension augments BatchedMesh.prototype with `computeBVH()`;
    // the type isn't visible to TS without a module declaration, so we
    // cast through `unknown`.
    (entry.mesh as unknown as { computeBVH: () => void }).computeBVH();
    entry.bvhBuilt = true;
  }

  releaseBatchedBucket(handle: BatchedBucketHandle): void {
    const entry = this.batchedBuckets.release(handle);
    if (entry === undefined) return;
    this.scene.remove(entry.mesh);
    entry.mesh.dispose();
    disposeMaterial(entry.mesh.material);
  }

  addBatchedGeometry(handle: BatchedBucketHandle, geometry: BufferGeometry): BatchedGeometryId | undefined {
    const entry = this.batchedBuckets.get(handle);
    if (entry === undefined) return undefined;
    // S51-BatchedMesh-perf: per-instance frustum culling reads each
    // geometry's boundingBox + boundingSphere via getBoundingBoxAt /
    // getBoundingSphereAt. Primitive geometries (BoxGeometry, etc.) and
    // GLB geometries don't always have these computed; ensure both are
    // present before BatchedMesh ingests the buffer.
    if (geometry.boundingBox === null) geometry.computeBoundingBox();
    if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
    try {
      return entry.mesh.addGeometry(geometry);
    } catch {
      // BatchedMesh throws if it's out of pool space; the caller's bucket
      // budget needs widening. v0 surfaces this as undefined.
      return undefined;
    }
  }

  addBatchedInstance(handle: BatchedBucketHandle, geometryId: BatchedGeometryId): InstanceIndex | undefined {
    const entry = this.batchedBuckets.get(handle);
    if (entry === undefined) return undefined;
    try {
      const slot = entry.mesh.addInstance(geometryId);
      entry.liveInstances.add(slot);
      return slot;
    } catch {
      return undefined;
    }
  }

  removeBatchedInstance(handle: BatchedBucketHandle, instance: InstanceIndex): void {
    const entry = this.batchedBuckets.get(handle);
    if (entry === undefined || !entry.liveInstances.has(instance)) return;
    entry.mesh.deleteInstance(instance);
    entry.liveInstances.delete(instance);
  }

  setBatchedInstanceTransform(
    handle: BatchedBucketHandle,
    instance: InstanceIndex,
    world: ResolvedWorld
  ): void {
    const entry = this.batchedBuckets.get(handle);
    if (entry === undefined || !entry.liveInstances.has(instance)) return;
    this.scratchPosition.set(world.position[0], world.position[1], world.position[2]);
    this.scratchScale.set(world.scale[0], world.scale[1], world.scale[2]);
    eulerToQuaternion(world.rotation, this.scratchQuat);
    this.scratchMatrix.compose(this.scratchPosition, this.scratchQuat, this.scratchScale);
    entry.mesh.setMatrixAt(instance, this.scratchMatrix);
  }

  setBatchedInstanceGeometry(
    handle: BatchedBucketHandle,
    instance: InstanceIndex,
    geometryId: BatchedGeometryId
  ): void {
    const entry = this.batchedBuckets.get(handle);
    if (entry === undefined || !entry.liveInstances.has(instance)) return;
    entry.mesh.setGeometryIdAt(instance, geometryId);
  }

  /** S51-BatchedMesh-color: per-instance colour parity with InstancedMesh. */
  setBatchedInstanceColor(
    handle: BatchedBucketHandle,
    instance: InstanceIndex,
    color: string
  ): void {
    const entry = this.batchedBuckets.get(handle);
    if (entry === undefined || !entry.liveInstances.has(instance)) return;
    this.scratchColor.set(color);
    entry.mesh.setColorAt(instance, this.scratchColor);
  }

  batchedBucketLiveCount(handle: BatchedBucketHandle): number {
    return this.batchedBuckets.get(handle)?.liveInstances.size ?? 0;
  }

  // ---- S53 RENDER-pool-handle-union: typed dispatcher ----

  /**
   * Acquire a pool by `BucketSpec` identity + per-kind construction
   * options. Returns a tagged `PoolHandle` so downstream readers
   * (story 11's doctor, story 13's BatchingSystem migration) can
   * dispatch on `kind` without consulting a separate Map.
   *
   * The kinds map to existing pool methods:
   * - `instanced` → `acquireBucket` (BVH-free InstancedMesh path).
   * - `batched`   → `acquireBatchedBucket` (BatchedMesh, per-instance
   *   frustum culling via three.js' `perObjectFrustumCulled`).
   * - `batched-bvh` → reserved for story 5. Currently routes to
   *   `acquireBatchedBucket`; the BVH adapter swap lands when
   *   `@three.ez/batched-mesh-extensions` is wired in.
   *
   * Construction-only options (`geometry`, `capacity`, `useInstanceColor`,
   * `materialParams`, `maxInstances`, `maxVertices`, `maxIndices`) come
   * in via `opts`. Identity options (`shadowCast`, `shadowReceive`,
   * `materialProfile`, `group`) come from `spec` and are forwarded so
   * the underlying acquire call gets a fully-populated spec.
   *
   * Existing per-kind methods (`acquireBucket`, `acquireBatchedBucket`)
   * stay public for back-compat — call sites can adopt the dispatcher
   * incrementally.
   */
  acquirePool(spec: BucketSpec, opts: PoolAcquireOptions): PoolHandle {
    switch (spec.kind) {
      case "instanced": {
        if (opts.kind !== "instanced") {
          throw new Error(
            `acquirePool: spec.kind "instanced" requires opts.kind "instanced" (got "${opts.kind}").`
          );
        }
        const bucketSpec: BucketAcquireSpec = {
          geometry: opts.geometry,
          capacity: opts.capacity,
          castShadow: spec.shadowCast,
          receiveShadow: spec.shadowReceive
        };
        if (opts.useInstanceColor !== undefined) bucketSpec.useInstanceColor = opts.useInstanceColor;
        if (opts.materialParams !== undefined) bucketSpec.materialParams = opts.materialParams;
        if (spec.materialProfile !== undefined) bucketSpec.materialProfile = spec.materialProfile;
        if (opts.color !== undefined) bucketSpec.color = opts.color;
        return { kind: "instanced", handle: this.acquireBucket(bucketSpec) };
      }
      case "batched":
      case "batched-bvh": {
        if (opts.kind !== "batched") {
          throw new Error(
            `acquirePool: spec.kind "${spec.kind}" requires opts.kind "batched" (got "${opts.kind}").`
          );
        }
        const batchedSpec: BatchedBucketAcquireSpec = {
          maxInstances: opts.maxInstances,
          maxVertices: opts.maxVertices,
          maxIndices: opts.maxIndices,
          castShadow: spec.shadowCast,
          receiveShadow: spec.shadowReceive,
          // S53 M17-bvh-extension: only the `batched-bvh` variant gets
          // the BVH-accelerated frustum-cull path on the underlying
          // BatchedMesh. `batched` stays on the default O(N) walk.
          useBvh: spec.kind === "batched-bvh"
        };
        if (opts.color !== undefined) batchedSpec.color = opts.color;
        return { kind: spec.kind, handle: this.acquireBatchedBucket(batchedSpec) };
      }
    }
  }

  /**
   * Live instance count for a pool by typed handle. Maps to the
   * existing per-kind counters (`bucketLiveCount` /
   * `batchedBucketLiveCount`) without forcing callers to know which
   * to use. New in S53 alongside the typed `PoolHandle`.
   */
  poolLiveCount(handle: PoolHandle): number {
    switch (handle.kind) {
      case "instanced":
        return this.bucketLiveCount(handle.handle);
      case "batched":
      case "batched-bvh":
        return this.batchedBucketLiveCount(handle.handle);
    }
  }

  /**
   * Release a pool by typed handle. Routes to `releaseBucket` or
   * `releaseBatchedBucket` based on `kind`. Mirrors the symmetry of
   * `acquirePool`.
   */
  releasePool(handle: PoolHandle): void {
    switch (handle.kind) {
      case "instanced":
        this.releaseBucket(handle.handle);
        return;
      case "batched":
      case "batched-bvh":
        this.releaseBatchedBucket(handle.handle);
        return;
    }
  }

  resize(width: number, height: number): void {
    this.device.setSize(width, height, false);
    this.composerSize = { width, height };
    if (this.composer !== undefined) {
      this.composer.setSize(width, height);
    }
    const active = this.activeCamera();
    if (active !== undefined) {
      const aspect = width / Math.max(1, height);
      if (active instanceof PerspectiveCamera) {
        active.aspect = aspect;
      } else {
        // S81 KABOOM-ORTHO-CAMERA: keep ortho frustum half-height
        // (active.top) stable; rebuild horizontal extents from new aspect.
        const halfHeight = active.top;
        active.left = -halfHeight * aspect;
        active.right = halfHeight * aspect;
      }
      active.updateProjectionMatrix();
    }
  }

  acquireMesh(initial: { geometry: BufferGeometry; color?: string }): MeshHandle {
    const handle = this.nextMeshHandle;
    this.nextMeshHandle += 1;
    const material = new MeshStandardMaterial({ color: new Color(initial.color ?? DEFAULT_COLOR) });
    this.registerWithCsm(material);
    const mesh = new Mesh(initial.geometry, material);
    this.meshes.set(handle, mesh);
    this.scene.add(mesh);
    return handle;
  }

  releaseMesh(handle: MeshHandle): void {
    const mesh = this.meshes.get(handle);
    if (mesh === undefined) return;
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    disposeMaterial(mesh.material);
    this.meshes.delete(handle);
  }

  setMeshGeometry(handle: MeshHandle, geometry: BufferGeometry): void {
    const mesh = this.meshes.get(handle);
    if (mesh === undefined) return;
    mesh.geometry.dispose();
    mesh.geometry = geometry;
  }

  setMeshMaterialPatch(handle: MeshHandle, patch: MaterialPatch): void {
    const mesh = this.meshes.get(handle);
    if (mesh === undefined) return;

    if (patch.kind !== undefined && !materialMatchesKind(mesh.material, patch.kind)) {
      const next = createMaterialForKind(patch.kind, patch);
      disposeMaterial(mesh.material);
      mesh.material = next;
      this.registerWithCsm(next);
    }
    const material = mesh.material as
      | MeshStandardMaterial
      | MeshPhysicalMaterial
      | MeshLambertMaterial
      | MeshPhongMaterial
      | MeshBasicMaterial;

    if (patch.color !== undefined) material.color.set(patch.color);
    if (patch.opacity !== undefined) material.opacity = patch.opacity;
    if (patch.transparent !== undefined) material.transparent = patch.transparent;

    if (
      material instanceof MeshStandardMaterial ||
      material instanceof MeshPhysicalMaterial
    ) {
      if (patch.roughness !== undefined) material.roughness = patch.roughness;
      if (patch.metalness !== undefined) material.metalness = patch.metalness;
      if (patch.emissive !== undefined) material.emissive.set(patch.emissive);
    }

    if (material instanceof MeshPhysicalMaterial) {
      if (patch.clearcoat !== undefined) material.clearcoat = patch.clearcoat;
      if (patch.clearcoatRoughness !== undefined) material.clearcoatRoughness = patch.clearcoatRoughness;
      if (patch.ior !== undefined) material.ior = patch.ior;
      if (patch.transmission !== undefined) material.transmission = patch.transmission;
      if (patch.thickness !== undefined) material.thickness = patch.thickness;
      if (patch.sheen !== undefined) material.sheen = patch.sheen;
      if (patch.sheenColor !== undefined) material.sheenColor.set(patch.sheenColor);
      if (patch.iridescence !== undefined) material.iridescence = patch.iridescence;
    }

    if (material instanceof MeshPhongMaterial) {
      if (patch.shininess !== undefined) material.shininess = patch.shininess;
      if (patch.specular !== undefined) material.specular.set(patch.specular);
      if (patch.emissive !== undefined) material.emissive.set(patch.emissive);
    }

    if (material instanceof MeshLambertMaterial && patch.emissive !== undefined) {
      material.emissive.set(patch.emissive);
    }

    // M21-mat-textures + S57 ASSET-textures-via-registry: textures
    // arrive already loaded via the AssetRegistry. `map` / `emissiveMap`
    // are colour data (sRGB); the rest stay in linear space per glTF
    // convention. The adapter re-asserts colorSpace here so a wrong
    // initial guess in `createTextureLoader()`'s heuristic doesn't
    // bleed through.
    if (
      material instanceof MeshStandardMaterial ||
      material instanceof MeshPhysicalMaterial ||
      material instanceof MeshPhongMaterial ||
      material instanceof MeshLambertMaterial ||
      material instanceof MeshBasicMaterial
    ) {
      if (patch.map !== undefined) {
        patch.map.colorSpace = SRGBColorSpace;
        material.map = patch.map;
      }
    }
    if (
      material instanceof MeshStandardMaterial ||
      material instanceof MeshPhysicalMaterial ||
      material instanceof MeshPhongMaterial
    ) {
      if (patch.normalMap !== undefined) {
        patch.normalMap.colorSpace = NoColorSpace;
        material.normalMap = patch.normalMap;
      }
      if (patch.normalScale !== undefined) material.normalScale.set(patch.normalScale, patch.normalScale);
      if (patch.bumpMap !== undefined) {
        patch.bumpMap.colorSpace = NoColorSpace;
        material.bumpMap = patch.bumpMap;
      }
      if (patch.bumpScale !== undefined) material.bumpScale = patch.bumpScale;
      if (patch.emissiveMap !== undefined) {
        patch.emissiveMap.colorSpace = SRGBColorSpace;
        material.emissiveMap = patch.emissiveMap;
      }
      if (patch.emissiveIntensity !== undefined) {
        // emissiveIntensity is only on Standard/Physical, not Phong.
        if (
          material instanceof MeshStandardMaterial ||
          material instanceof MeshPhysicalMaterial
        ) {
          material.emissiveIntensity = patch.emissiveIntensity;
        }
      }
      if (patch.aoMap !== undefined) {
        patch.aoMap.colorSpace = NoColorSpace;
        material.aoMap = patch.aoMap;
      }
    }
    if (
      material instanceof MeshStandardMaterial ||
      material instanceof MeshPhysicalMaterial
    ) {
      if (patch.roughnessMap !== undefined) {
        patch.roughnessMap.colorSpace = NoColorSpace;
        material.roughnessMap = patch.roughnessMap;
      }
      if (patch.metalnessMap !== undefined) {
        patch.metalnessMap.colorSpace = NoColorSpace;
        material.metalnessMap = patch.metalnessMap;
      }
      // S57 REFLECTION-cube-probe: per-object envmap override.
      if (patch.envMap !== undefined) material.envMap = patch.envMap;
      if (patch.envMapIntensity !== undefined) material.envMapIntensity = patch.envMapIntensity;
    }

    material.needsUpdate = true;
  }

  // S57 ASSET-textures-via-registry retired the adapter-side
  // `acquireTexture(url)` path. Textures arrive pre-loaded via the
  // `MaterialPatch.{map,normalMap,...}` Texture instances; lifecycle
  // (cache, invalidation, HMR) lives in the AssetRegistry.

  setMeshTransform(handle: MeshHandle, world: ResolvedWorld): void {
    const mesh = this.meshes.get(handle);
    if (mesh === undefined) return;
    applyTransform(mesh, world);
  }

  hasMesh(handle: MeshHandle): boolean {
    return this.meshes.has(handle);
  }

  acquireCamera(params: CameraParams): CameraHandle {
    const handle = this.nextCameraHandle;
    this.nextCameraHandle += 1;
    const aspect = params.aspect ?? this.canvasAspect();
    const near = params.near ?? 0.1;
    const far = params.far ?? 100;
    let camera: PerspectiveCamera | OrthographicCamera;
    if (params.kind === "orthographic") {
      // S81 KABOOM-ORTHO-CAMERA. half-height = orthographicSize; width
      // derived from canvas aspect at acquire time and refreshed on
      // resize via setCameraParams.
      const halfHeight = params.orthographicSize ?? 5;
      const halfWidth = halfHeight * aspect;
      camera = new OrthographicCamera(-halfWidth, halfWidth, halfHeight, -halfHeight, near, far);
    } else {
      camera = new PerspectiveCamera(params.fov ?? 60, aspect, near, far);
    }
    this.cameras.set(handle, camera);
    return handle;
  }

  releaseCamera(handle: CameraHandle): void {
    this.cameras.delete(handle);
    if (this.activeCameraHandle === handle) {
      this.activeCameraHandle = undefined;
    }
  }

  setCameraParams(handle: CameraHandle, params: CameraParams): void {
    const camera = this.cameras.get(handle);
    if (camera === undefined) return;
    if (params.near !== undefined) camera.near = params.near;
    if (params.far !== undefined) camera.far = params.far;
    if (camera instanceof PerspectiveCamera) {
      if (params.fov !== undefined) camera.fov = params.fov;
      if (params.aspect !== undefined) camera.aspect = params.aspect;
    } else {
      // Orthographic: ortho cameras don't have `aspect` directly; derive
      // left/right from aspect × half-height (params.orthographicSize),
      // falling back to the current frustum half-height so a partial
      // patch (only `near` / `far` changed) doesn't reshape the frustum.
      const aspect = params.aspect ?? this.canvasAspect();
      const halfHeight = params.orthographicSize ?? camera.top;
      const halfWidth = halfHeight * aspect;
      camera.left = -halfWidth;
      camera.right = halfWidth;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
    }
    camera.updateProjectionMatrix();
  }

  setCameraTransform(handle: CameraHandle, world: ResolvedWorld): void {
    const camera = this.cameras.get(handle);
    if (camera === undefined) return;
    applyTransform(camera, world);
  }

  setActiveCamera(handle: CameraHandle | undefined): void {
    if (handle !== undefined && !this.cameras.has(handle)) return;
    const previous = this.activeCameraHandle;
    this.activeCameraHandle = handle;
    // CSM + post-composer cache the camera reference. Rebuild if it
    // changed (or if it became defined for the first time after a
    // deferred enable).
    if (previous !== handle && this.csmConfig !== undefined) {
      this.rebuildCsm();
    }
    if (previous !== handle && this.postConfig !== undefined) {
      this.rebuildComposer();
    }
  }

  /** Used by the renderer to skip a draw when no camera is bound. */
  hasActiveCamera(): boolean {
    return this.activeCamera() !== undefined;
  }

  // ---- M17-instance-picking ----

  /**
   * Cast a ray from screen space (normalised device coords in [-1, 1]
   * range) through the active camera and return the first MeshHandle
   * intersection + hit point/distance, or undefined when nothing was
   * hit. Callers map MeshHandle → EntityId through the mesh-handle
   * registry. InstancedMesh hits report the bucket's first member;
   * proper instanceId resolution lands as a follow-up.
   */
  pickAtNdc(
    ndcX: number,
    ndcY: number
  ): PickHit | undefined {
    const camera = this.activeCamera();
    if (camera === undefined) return undefined;
    this.scratchPickNdc.set(ndcX, ndcY);
    this.scratchRaycaster.setFromCamera(this.scratchPickNdc, camera);
    let best: PickHit | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;

    // 1. Per-entity Mesh map.
    for (const [handle, mesh] of this.meshes) {
      const first = this.scratchRaycaster.intersectObject(mesh, false)[0];
      if (first === undefined) continue;
      if (first.distance < bestDistance) {
        bestDistance = first.distance;
        best = {
          kind: "mesh",
          handle,
          point: [first.point.x, first.point.y, first.point.z],
          distance: first.distance
        };
      }
    }

    // 2. InstancedMesh buckets — Three reports the slot via `instanceId`.
    for (const [bucketHandle, entry] of this.buckets.entriesIter()) {
      const first = this.scratchRaycaster.intersectObject(entry.mesh, false)[0];
      if (first === undefined || first.instanceId === undefined) continue;
      if (first.distance < bestDistance) {
        bestDistance = first.distance;
        best = {
          kind: "bucket",
          bucket: bucketHandle,
          instance: first.instanceId,
          point: [first.point.x, first.point.y, first.point.z],
          distance: first.distance
        };
      }
    }

    // 3. BatchedMesh buckets — same `instanceId` semantics.
    for (const [bucketHandle, entry] of this.batchedBuckets.entriesIter()) {
      const first = this.scratchRaycaster.intersectObject(entry.mesh, false)[0];
      if (first === undefined || first.instanceId === undefined) continue;
      if (first.distance < bestDistance) {
        bestDistance = first.distance;
        best = {
          kind: "batched-bucket",
          bucket: bucketHandle,
          instance: first.instanceId,
          point: [first.point.x, first.point.y, first.point.z],
          distance: first.distance
        };
      }
    }

    return best;
  }

  draw(): void {
    const camera = this.activeCamera();
    if (camera === undefined) return;
    if (this.csm !== undefined) {
      this.csm.update();
    }
    // With `info.autoReset = false` we own the per-frame reset so the
    // counters span every composer pass.
    this.device.info.reset();
    this.gpuTimer?.begin();
    if (this.composer !== undefined) {
      this.composer.render();
    } else {
      this.device.render(this.scene, camera);
    }
    this.gpuTimer?.end();
    this.webGpuTimer?.onFrame();
  }

  // ---- M21-shadow-csm: cascade shadow maps ----

  /**
   * Turn CSM on or off. When `config` is provided, the adapter stores
   * it and tries to construct CSM if an active camera exists; otherwise
   * the build is deferred until `setActiveCamera` is called. Pass
   * `undefined` to fully disable + restore materials.
   */
  setCsm(config: CsmConfig | undefined): void {
    if (config === undefined) {
      this.disposeCsm();
      this.csmConfig = undefined;
      return;
    }
    // S75 WEBGPU-csm-rebuild-guard. Three.js's `CSMShadowNode` does NOT
    // survive being torn down + reconstructed on the same renderer
    // (cached TSL graph references the OLD cascade sub-nodes, the
    // graph walks a dangling pointer and `AssignNode.generate()`
    // throws). Live tuning of cascades / maxFar / mode / mapSize on
    // WebGPU therefore requires a page reload to take effect. If the
    // CSM is already initialized for this scene, treat the new config
    // as a no-op + warn so the dev-tuner sliders don't crash the page.
    // Bias / normalBias / intensity have their own dedicated setters
    // (`setCsmShadowBias` etc.) and bypass this rebuild path entirely.
    if (
      this.capabilities.kind === "webgpu" &&
      this.csmConfig !== undefined &&
      this.csmDirectionalLight !== undefined
    ) {
      const message =
        "WebGPU CSM does not support live rebuild yet — change project.json#render.shadows.csm and reload the page. Slider change ignored.";
      if (this.diagnostics !== undefined) {
        this.diagnostics.emit({
          severity: "warning",
          code: "AGF_RENDER_WEBGPU_CSM_NO_LIVE_REBUILD",
          source: "three-render-adapter",
          message
        });
      } else {
        // eslint-disable-next-line no-console
        // agf-allow:console pre-runtime call site — bus unavailable when the legacy shadow-tuner pings setCsmConfig before attachUi.
        console.warn(`[AGF] ${message}`);
      }
      return;
    }
    this.csmConfig = config;
    this.rebuildCsm();
  }

  /**
   * Cheap in-place mutators on the existing CSM lights. Avoid a full
   * rebuild for parameters that don't change cascade structure
   * (`shadowBias`, `shadowNormalBias`, `lightIntensity`). A full
   * `setCsm()` rebuild costs ~100 ms per call because every material in
   * the scene gets reregistered via `csm.setupMaterial(...)`; calling
   * that on each slider tick freezes the frame loop visibly. These
   * setters take microseconds.
   *
   * No-op when CSM is not currently active.
   */
  /**
   * S76 — walk both renderer paths' CSM-managed DirectionalLights.
   * WebGL: `this.csm.lights[]` array. WebGPU: the host
   * `this.csmDirectionalLight` plus the cascade sub-lights stored
   * inside `(csmShadowNodeAttached as { lights: Light[] }).lights[]`.
   */
  private forEachCsmLight(fn: (light: DirectionalLight) => void): void {
    if (this.csm !== undefined) {
      for (const light of this.csm.lights) fn(light);
      return;
    }
    if (this.csmDirectionalLight !== undefined) {
      fn(this.csmDirectionalLight);
    }
    const node = this.csmShadowNodeAttached as
      | { lights?: ReadonlyArray<{ shadow?: unknown; intensity?: number }> }
      | undefined;
    if (node?.lights !== undefined) {
      for (const sub of node.lights) {
        fn(sub as unknown as DirectionalLight);
      }
    }
  }

  setCsmShadowBias(value: number): void {
    if (this.csmConfig === undefined) return;
    this.forEachCsmLight((light) => { light.shadow.bias = value; });
    this.csmConfig = { ...this.csmConfig, shadowBias: value };
    this.invalidateShadowMap();
  }

  setCsmShadowNormalBias(value: number): void {
    if (this.csmConfig === undefined) return;
    this.forEachCsmLight((light) => { light.shadow.normalBias = value; });
    this.csmConfig = { ...this.csmConfig, shadowNormalBias: value };
    this.invalidateShadowMap();
  }

  setCsmLightIntensity(value: number): void {
    if (this.csmConfig === undefined) return;
    this.forEachCsmLight((light) => { light.intensity = value; });
    this.csmConfig = { ...this.csmConfig, lightIntensity: value };
    // Light intensity doesn't change shadow geometry — no shadow re-render
    // needed.
  }

  /**
   * Resize cascade shadow maps in-place. three.js can resize a shadow's
   * RenderTarget by mutating `mapSize` and disposing the old map so the
   * renderer recreates it on the next pass. Avoids a full CSM rebuild
   * (~100 ms + 267-material shader recompile in shadows-bench).
   */
  setCsmShadowMapSize(value: number): void {
    if (this.csmConfig === undefined) return;
    this.forEachCsmLight((light) => {
      light.shadow.mapSize.set(value, value);
      if (light.shadow.map !== null) {
        light.shadow.map.dispose();
        light.shadow.map = null;
      }
    });
    this.csmConfig = { ...this.csmConfig, shadowMapSize: value };
    this.invalidateShadowMap();
  }

  /**
   * Change CSM's far clip in-place. Updates `csm.maxFar` and recomputes
   * frustum splits without recreating cascades or recompiling shaders.
   */
  setCsmMaxFar(value: number): void {
    if (this.csm === undefined) return;
    this.csm.maxFar = value;
    this.csm.updateFrustums();
    if (this.csmConfig !== undefined) this.csmConfig = { ...this.csmConfig, maxFar: value };
    this.invalidateShadowMap();
  }

  /**
   * Switch the shadow filter algorithm at runtime. PCF / VSM swap freely
   * because they only differ in `WebGLRenderer.shadowMap.type` + the
   * sampler bindings three regenerates on the next compile.
   *
   * **PCSS is a one-way transition.** The PCSS shader-chunk substitution
   * mutates the process-wide `ShaderChunk.shadowmap_pars_fragment` and
   * cannot be cleanly reverted in the same page — switching FROM PCSS
   * back to PCF/VSM keeps the PCSS helpers compiled into materials but
   * with a sampler2D binding that won't match the new shadow type, which
   * produces visual garbage. Callers (UI panels, dev tools) MUST treat
   * PCSS as a "reload required" toggle in either direction once
   * `applyPcssShadowChunks()` has fired.
   */
  setShadowAlgorithm(kind: "pcf" | "vsm" | "pcss"): void {
    this.device.shadowMap.type = shadowAlgorithmType(kind, this.capabilities.kind);
    this.device.shadowMap.needsUpdate = true;
    if (kind === "pcss") {
      applyPcssShadowChunks();
    }
    // Force every active material to recompile so the new sampler binding
    // matches the new shadow type. Touching `needsUpdate` on the materials
    // is the cheapest way to do that without rebuilding the scene.
    const flagDirty = (m: Material | Material[]): void => {
      if (Array.isArray(m)) {
        for (const slot of m) slot.needsUpdate = true;
      } else {
        m.needsUpdate = true;
      }
    };
    for (const mesh of this.meshes.values()) flagDirty(mesh.material);
    for (const bucket of this.buckets.values()) flagDirty(bucket.mesh.material);
    for (const bucket of this.batchedBuckets.values()) flagDirty(bucket.mesh.material);
    if (this.csm !== undefined) {
      // CSM keeps its own internal lights — touching their .needsUpdate
      // wouldn't help; rebuilding the CSM regenerates everything.
      this.rebuildCsm();
    }
  }

  // ---- M21-post-pipeline ----

  /**
   * Configure the post-processing chain. `undefined` (or an empty array)
   * disables the composer and `draw()` falls back to a direct
   * `device.render()`. Each pass is built in array order; an `OutputPass`
   * is always appended so the final blit picks up the renderer's
   * `toneMapping` + `outputColorSpace` settings.
   */
  setPostPipeline(passes: ReadonlyArray<PostPassConfig> | undefined): void {
    if (passes === undefined || passes.length === 0) {
      this.disposeComposer();
      this.postConfig = undefined;
      return;
    }
    this.postConfig = passes;
    // S67 WEBGPU-post-bloom upstream block confirmed: stack capture
    // shows the error originates from `WebGPURenderer._renderObjectDirect`
    // when the bloom node's internal pingpong quads (which use vanilla
    // `ShaderMaterial`) reach `WGSLNodeBuilder.prebuild`. Not fixable
    // from AGF without forking three.js. See
    // `docs/research/m21-webgpu-shadermaterial-audit.md` for details.
    if (this.capabilities.kind === "webgpu") {
      return;
    }
    this.rebuildComposer();
  }

  isPostPipelineActive(): boolean {
    return this.composer !== undefined;
  }

  private rebuildComposer(): void {
    const camera = this.activeCamera();
    if (this.postConfig === undefined || camera === undefined) {
      this.disposeComposer();
      return;
    }
    this.disposeComposer();
    const composer = new EffectComposer(this.device);
    const size = this.composerSize ?? this.currentDeviceSize();
    composer.setSize(size.width, size.height);
    composer.setPixelRatio(this.device.getPixelRatio());
    composer.addPass(new RenderPass(this.scene, camera));
    for (const pass of this.postConfig) {
      if (pass.kind === "bloom") {
        const bloom = new UnrealBloomPass(
          new Vector2(size.width, size.height),
          pass.strength ?? 0.5,
          pass.radius ?? 0.4,
          pass.threshold ?? 0.85
        );
        composer.addPass(bloom);
      } else if (pass.kind === "fxaa") {
        composer.addPass(new FXAAPass());
      } else if (pass.kind === "ssao") {
        // S57 POST-ssao: vendored SSAOPass. Requires a camera, which we
        // already gated above via `activeCamera()`. The pass renders an AO
        // buffer in screen space + blends it back; cost ~5–10 % of base
        // render at default kernel size 32.
        const ssao = new SSAOPass(
          this.scene,
          camera,
          size.width,
          size.height,
          pass.kernelSize ?? 32
        );
        if (pass.radius !== undefined) ssao.kernelRadius = pass.radius;
        composer.addPass(ssao);
      } else if (pass.kind === "color-lut") {
        // S57 POST-color-lut: vendored LUTPass + LUTCubeLoader. The LUT
        // load is async — we add the pass with a placeholder identity
        // LUT first so the composer stays valid, then swap in the real
        // 3D texture when it arrives.
        const lutPass = new LUTPass();
        if (pass.intensity !== undefined) lutPass.intensity = pass.intensity;
        composer.addPass(lutPass);
        const url = this.resolveLutUrl(pass.file);
        new LUTCubeLoader().load(url, (result) => {
          lutPass.lut = result.texture3D;
        });
      }
    }
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  /**
   * S57 POST-color-lut: hook for the asset-path resolution that lives
   * in `engine/runtime/start.ts` — the adapter doesn't own the registry,
   * so the runtime overrides this when wiring the adapter together.
   * Default falls back to the raw ref (matches the pre-S54 behaviour for
   * texture refs).
   */
  lutUrlResolver: ((ref: string) => string) | undefined;
  private resolveLutUrl(ref: string): string {
    if (this.lutUrlResolver !== undefined) return this.lutUrlResolver(ref);
    return ref;
  }

  private disposeComposer(): void {
    if (this.composer === undefined) return;
    this.composer.dispose();
    this.composer = undefined;
  }

  private currentDeviceSize(): { width: number; height: number } {
    const target = new Vector2();
    this.device.getSize(target);
    return { width: Math.max(1, target.x), height: Math.max(1, target.y) };
  }

  isCsmEnabled(): boolean {
    return this.csm !== undefined;
  }

  private rebuildCsm(): void {
    const camera = this.activeCamera();
    if (this.csmConfig === undefined || camera === undefined) {
      this.disposeCsm();
      return;
    }
    // S81 KABOOM-ORTHO-CAMERA. CSM splits the perspective frustum using
    // FOV → cascade math doesn't translate to orthographic. Skip CSM
    // when the active camera is orthographic; warn once so the agent
    // sees why their shadow tuner is no-op'ing.
    if (!(camera instanceof PerspectiveCamera)) {
      const message =
        "CSM requires a perspective camera; active camera is orthographic. Cascade shadows skipped — use a single DirectionalLight with `castShadow: true` or switch the camera kind.";
      if (this.diagnostics !== undefined) {
        this.diagnostics.emit({
          severity: "warning",
          code: "AGF_RENDER_CSM_REQUIRES_PERSPECTIVE",
          source: "three-render-adapter",
          message
        });
      } else {
        // eslint-disable-next-line no-console
        // agf-allow:console bus not yet attached.
        console.warn(`[AGF] ${message}`);
      }
      this.disposeCsm();
      return;
    }
    // Reconstruct from scratch so a camera swap or config change is
    // safe — CSM caches the camera ref + shader uniforms.
    this.disposeCsm();
    if (this.capabilities.kind === "webgpu") {
      // S74 WEBGPU-csm. Three.js ships `CSMShadowNode` as an addon
      // (`three/examples/jsm/csm/CSMShadowNode.js`) that runs natively
      // on `WebGPURenderer`. The pattern: one DirectionalLight, set
      // `light.shadow.shadowNode = new CSMShadowNode(light, data)`,
      // add to scene. The shadowNode internally manages cascade
      // sub-lights and the per-fragment cascade selection in the TSL
      // graph — no `onBeforeCompile` material patching needed.
      //
      // Loaded asynchronously: kick off the load + complete in a
      // microtask. Until then `this.csm` stays undefined and the rest
      // of the adapter treats it as "CSM is disabled". The first frame
      // after the load resolves shows cascade shadows.
      this.buildWebGpuCsm(camera);
      return;
    }
    const direction = this.csmConfig.lightDirection ?? [-0.5, -1, -0.3];
    const csm = new CSM({
      camera,
      parent: this.scene,
      cascades: this.csmConfig.cascades ?? 3,
      maxFar: this.csmConfig.maxFar ?? 100,
      mode: this.csmConfig.mode ?? "practical",
      shadowMapSize: this.csmConfig.shadowMapSize ?? 2048,
      shadowBias: this.csmConfig.shadowBias ?? -0.0001,
      lightDirection: new Vector3(direction[0], direction[1], direction[2]).normalize(),
      lightIntensity: this.csmConfig.lightIntensity ?? 1.5
    });
    // S47 — apply per-cascade normalBias when configured. three's CSM
    // doesn't expose this in its options bag, so we mutate each cascade's
    // shadow.normalBias after the lights are created. Counters peter-pan
    // (visible gap between an object and its shadow at the base contact
    // point) without growing acne the way a pure negative bias would.
    const normalBias = this.csmConfig.shadowNormalBias;
    if (normalBias !== undefined) {
      for (const light of csm.lights) {
        light.shadow.normalBias = normalBias;
      }
    }
    this.csm = csm;
    // Register every material the adapter has already created.
    for (const mesh of this.meshes.values()) {
      this.registerWithCsm(mesh.material);
    }
    for (const bucket of this.buckets.values()) {
      this.registerWithCsm(bucket.mesh.material);
    }
    for (const bucket of this.batchedBuckets.values()) {
      this.registerWithCsm(bucket.mesh.material);
    }
  }

  /**
   * S76 WEBGPU-csm. Build a CSM setup with `CSMShadowNode`
   * SYNCHRONOUSLY. The constructor is now part of `loadWebGpuModule`
   * which the runtime has already awaited inside `adapter.init()`, so
   * it's safe to read `this.webGpuModule.CSMShadowNode` here without
   * additional await.
   *
   * Ordering: shadowNode is assigned to `light.shadow.shadowNode`
   * BEFORE the light enters the scene graph. Three.js's
   * `AnalyticLightNode.setup` reads the shadowNode the first time a
   * material samples the light and bakes the resulting TSL graph; if
   * the light were added first, the default (no-CSM) graph would get
   * baked and the late shadowNode assignment would have no effect.
   * That race was the root cause of the S74-spike "weak shadows"
   * symptom on WebGPU.
   */
  private buildWebGpuCsm(camera: PerspectiveCamera): void {
    const config = this.csmConfig;
    if (config === undefined) return;
    if (this.webGpuModule === undefined) {
      const message = "buildWebGpuCsm called before adapter.init() resolved; cascade shadows skipped.";
      if (this.diagnostics !== undefined) {
        this.diagnostics.emit({
          severity: "warning",
          code: "AGF_RENDER_WEBGPU_CSM_BEFORE_INIT",
          source: "three-render-adapter",
          message
        });
      } else {
        // eslint-disable-next-line no-console
        // agf-allow:console early-init path before diagnostics bus is wired.
        console.warn(`[AGF] ${message}`);
      }
      return;
    }
    const direction = config.lightDirection ?? [-0.5, -1, -0.3];
    const light = new DirectionalLight(
      0xffffff,
      config.lightIntensity ?? 1.5
    );
    // DirectionalLight.position acts as the LIGHT direction in three.js
    // (the light looks toward .target, which defaults to origin). Place
    // it along the inverse of the direction vector so the light shines
    // along `direction` toward the scene.
    const dir = new Vector3(direction[0], direction[1], direction[2]).normalize();
    light.position.copy(dir).multiplyScalar(-50);
    light.castShadow = true;
    const mapSize = config.shadowMapSize ?? 2048;
    light.shadow.mapSize.set(mapSize, mapSize);
    light.shadow.bias = config.shadowBias ?? -0.0001;
    if (config.shadowNormalBias !== undefined) {
      light.shadow.normalBias = config.shadowNormalBias;
    }
    const shadowNode = new this.webGpuModule.CSMShadowNode(
      light as unknown as { shadow: { shadowNode?: unknown }; isDirectionalLight?: boolean },
      {
        cascades: config.cascades ?? 3,
        maxFar: config.maxFar ?? 100,
        mode: config.mode ?? "practical"
      }
    );
    // CRITICAL: do NOT pre-assign shadowNode.camera here. CSMShadowNode's
    // `setup(builder)` only calls `_init(builder)` when `this.camera ===
    // null`, and `_init` is where cascade sub-lights, frustums, and the
    // internal `_shadowNodes[]` array get populated. Pre-setting the
    // camera short-circuits that → the cascade arrays stay empty → TSL
    // graph traversal in `AssignNode.generate()` walks an undefined
    // sub-node and the renderer crashes with
    // `TypeError: Cannot read properties of undefined (reading 'build')`.
    // Three.js reads `builder.camera` from the renderer context on the
    // first setup pass, which is the camera we want anyway.
    // (`shadowNode.camera = camera;` removed — see S76 commit.)
    void camera;
    (light.shadow as unknown as { shadowNode?: unknown }).shadowNode = shadowNode;
    this.csmShadowNodeAttached = shadowNode;
    this.csmDirectionalLight = light;
    // Add to scene LAST — see method-doc comment above.
    this.scene.add(light);
  }

  private disposeCsm(): void {
    if (this.csm !== undefined) {
      this.csm.remove();
      this.csm.dispose();
      this.csm = undefined;
      // CSM.dispose already flips needsUpdate on each registered material
      // so the shader recompiles without the cascade defines next frame.
      this.csmMaterials.clear();
    }
    // S74 WEBGPU-csm dispose: detach the shadowNode (if attached) and
    // remove the host DirectionalLight + its shadow target. The
    // CSMShadowNode exposes a dispose() — call it so the internal
    // cascade lights + render targets release.
    if (this.csmShadowNodeAttached !== undefined) {
      const attached = this.csmShadowNodeAttached as { dispose?: () => void };
      if (typeof attached.dispose === "function") {
        attached.dispose();
      }
      this.csmShadowNodeAttached = undefined;
    }
    if (this.csmDirectionalLight !== undefined) {
      this.scene.remove(this.csmDirectionalLight);
      (this.csmDirectionalLight.shadow as unknown as { shadowNode?: unknown }).shadowNode = undefined;
      this.csmDirectionalLight.dispose();
      this.csmDirectionalLight = undefined;
    }
  }

  /**
   * Idempotent. Materials created/swapped while CSM is active route
   * through here so their shader picks up cascade uniforms.
   */
  private registerWithCsm(material: Material | Material[]): void {
    if (this.csm === undefined) return;
    if (Array.isArray(material)) {
      for (const m of material) this.registerWithCsm(m);
      return;
    }
    if (this.csmMaterials.has(material)) return;
    this.csm.setupMaterial(material);
    this.csmMaterials.add(material);
  }

  // ---- M24-debug: physics collider overlay ----

  /**
   * Show or hide a single LineSegments node in the scene that visualises
   * Rapier's `debugRender()` output. The renderer owns the GPU resource;
   * the physics debug system feeds new vertex/color buffers each frame.
   * Returns true when the overlay is currently visible after the call.
   */
  setDebugOverlayEnabled(enabled: boolean): boolean {
    if (enabled === (this.debugOverlay !== undefined)) {
      return this.debugOverlay !== undefined;
    }
    if (enabled) {
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(new Float32Array(0), 3));
      geometry.setAttribute("color", new BufferAttribute(new Float32Array(0), 4));
      const material = new LineBasicMaterial({ vertexColors: true, transparent: true, depthTest: false });
      const segments = new LineSegments(geometry, material);
      segments.frustumCulled = false;
      // Render after everything else so the overlay always sits on top.
      segments.renderOrder = 999;
      this.scene.add(segments);
      this.debugOverlay = segments;
    } else if (this.debugOverlay !== undefined) {
      this.scene.remove(this.debugOverlay);
      this.debugOverlay.geometry.dispose();
      const material = this.debugOverlay.material;
      if (Array.isArray(material)) {
        for (const m of material) m.dispose();
      } else {
        material.dispose();
      }
      this.debugOverlay = undefined;
    }
    return this.debugOverlay !== undefined;
  }

  isDebugOverlayEnabled(): boolean {
    return this.debugOverlay !== undefined;
  }

  /**
   * Push a fresh set of line-segment vertices + per-vertex RGBA colors
   * into the debug overlay. Both buffers are flat `Float32Array`s:
   *   vertices = [x0,y0,z0, x1,y1,z1, ...]
   *   colors   = [r0,g0,b0,a0, r1,g1,b1,a1, ...]
   * Caller is `engine/physics/rapier/physics-debug-system`.
   */
  setDebugOverlayData(vertices: Float32Array, colors: Float32Array): void {
    const overlay = this.debugOverlay;
    if (overlay === undefined) return;
    const geometry = overlay.geometry;
    const positionAttr = geometry.getAttribute("position") as BufferAttribute | undefined;
    const colorAttr = geometry.getAttribute("color") as BufferAttribute | undefined;
    // Rebuild only when size changes — same Float32Array length lets us
    // reuse the BufferAttribute and just flip `needsUpdate`.
    if (positionAttr === undefined || positionAttr.array.length !== vertices.length) {
      geometry.setAttribute("position", new BufferAttribute(vertices, 3));
    } else {
      (positionAttr.array as Float32Array).set(vertices);
      positionAttr.needsUpdate = true;
    }
    if (colorAttr === undefined || colorAttr.array.length !== colors.length) {
      geometry.setAttribute("color", new BufferAttribute(colors, 4));
    } else {
      (colorAttr.array as Float32Array).set(colors);
      colorAttr.needsUpdate = true;
    }
    geometry.setDrawRange(0, vertices.length / 3);
  }

  info(): AdapterInfo {
    const memory = this.device.info.memory;
    const renderStats = this.device.info.render;
    const programs = this.device.info.programs?.length ?? 0;
    let shadowCasters = 0;
    for (const light of this.lights.values()) {
      if (light.castShadow) shadowCasters += 1;
    }
    let bucketInstances = 0;
    for (const entry of this.buckets.values()) bucketInstances += entry.liveSlots.size;
    let batchedBucketInstances = 0;
    for (const entry of this.batchedBuckets.values()) batchedBucketInstances += entry.liveInstances.size;
    const info: AdapterInfo = {
      geometries: memory.geometries ?? 0,
      textures: memory.textures ?? 0,
      programs,
      // S62 hotfix: on WebGPU `info.render.calls` is a CUMULATIVE counter
      // (never reset by Info.reset() — confirmed in three.js r0.184). Read
      // the per-frame `frameCalls` field instead so `__agf.rendererInfo()`
      // shows draws-this-frame on either renderer. On WebGL `calls` IS
      // per-frame so the existing path is preserved.
      drawCalls: this.capabilities.kind === "webgpu"
        ? ((renderStats as { frameCalls?: number; drawCalls?: number }).frameCalls
            ?? (renderStats as { frameCalls?: number; drawCalls?: number }).drawCalls
            ?? 0)
        : (renderStats.calls ?? 0),
      triangles: renderStats.triangles ?? 0,
      meshes: this.meshes.size,
      lights: this.lights.size,
      shadowCasters,
      buckets: this.buckets.size(),
      bucketInstances,
      batchedBuckets: this.batchedBuckets.size(),
      batchedBucketInstances,
      reflectionProbes: this.reflectionProbes.size,
      prefilterMs: this.reflectionPrefilterMsThisFrame,
      planarMirrors: this.planarMirrors.size,
      renderer: this.capabilities.kind
    };
    const gpuMs = this.gpuTimer?.read() ?? this.webGpuTimer?.read();
    if (gpuMs !== undefined) {
      info.gpuMs = gpuMs;
    }
    return info;
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      disposeMaterial(mesh.material);
    }
    this.meshes.clear();
    for (const light of this.lights.values()) {
      this.scene.remove(light);
      light.dispose();
    }
    this.lights.clear();
    for (const [handle] of [...this.buckets.entriesIter()]) this.releaseBucket(handle);
    for (const [handle] of [...this.batchedBuckets.entriesIter()]) this.releaseBatchedBucket(handle);
    this.setDebugOverlayEnabled(false);
    this.disposeComposer();
    this.disableFallbackLighting();
    this.currentEnvironmentTexture?.dispose();
    this.currentEnvironmentTexture = undefined;
    this.pmrem?.dispose();
    this.pmrem = undefined;
    this.probePmrem?.dispose();
    this.probePmrem = undefined;
    this.cameras.clear();
    this.activeCameraHandle = undefined;
    if (this.contextLostListener !== undefined) {
      this.canvas.removeEventListener("webglcontextlost", this.contextLostListener);
      this.contextLostListener = undefined;
    }
    if (this.contextRestoredListener !== undefined) {
      this.canvas.removeEventListener("webglcontextrestored", this.contextRestoredListener);
      this.contextRestoredListener = undefined;
    }
    // S57: textures are owned by AssetRegistry; the adapter no longer
    // owns the cache. The renderer disposes its Three.js device which
    // releases per-material texture bindings.
    this.device.dispose();
  }

  private activeCamera(): PerspectiveCamera | OrthographicCamera | undefined {
    if (this.activeCameraHandle === undefined) return undefined;
    return this.cameras.get(this.activeCameraHandle);
  }

  private canvasAspect(): number {
    const width = this.canvas.clientWidth || this.canvas.width;
    const height = this.canvas.clientHeight || this.canvas.height;
    return width / Math.max(1, height);
  }
}

function applyTransform(object: Object3D, world: ResolvedWorld): void {
  object.position.set(world.position[0], world.position[1], world.position[2]);
  object.rotation.set(world.rotation[0], world.rotation[1], world.rotation[2]);
  object.scale.set(world.scale[0], world.scale[1], world.scale[2]);
}

type BucketEntry = {
  mesh: InstancedMesh;
  capacity: number;
  liveSlots: Set<InstanceIndex>;
};

type BatchedBucketEntry = {
  mesh: BatchedMesh;
  liveInstances: Set<InstanceIndex>;
  /** S53 M17-bvh-extension: opt-in flag set on `acquireBatchedBucket({ useBvh: true })`. */
  useBvh: boolean;
  /** S53 M17-bvh-extension: flips true after the first `computeBVH()` call. */
  bvhBuilt: boolean;
};

/** Fill an existing Quaternion from an Euler XYZ rotation (radians) — XYZ order matches Three.js default. */
function eulerToQuaternion(rotation: readonly [number, number, number], out: Quaternion): Quaternion {
  const c1 = Math.cos(rotation[0] / 2);
  const c2 = Math.cos(rotation[1] / 2);
  const c3 = Math.cos(rotation[2] / 2);
  const s1 = Math.sin(rotation[0] / 2);
  const s2 = Math.sin(rotation[1] / 2);
  const s3 = Math.sin(rotation[2] / 2);
  out.set(
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3
  );
  return out;
}

function disposeMaterial(material: Mesh["material"]): void {
  if (Array.isArray(material)) {
    for (const item of material) item.dispose();
    return;
  }
  material.dispose();
}

/**
 * S52 POLISH-shadows-bench-sky: build a vertical 2-stop gradient as a
 * 4×256 CanvasTexture. The narrow width is enough because three.js
 * stretches the background texture to fill the viewport; the 256 px
 * height covers every screen-y interpolation step without banding.
 */
function createGradientTexture(spec: SkyGradient): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    // Canvas2D is universally supported in dev/prod browsers we target;
    // returning a 1×1 placeholder is fine for the unlikely null case.
    return new CanvasTexture(canvas);
  }
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, spec.top);
  gradient.addColorStop(1, spec.bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new CanvasTexture(canvas);
  // Background textures bypass the colour-space pipeline three.js
  // would otherwise apply to data textures; explicit sRGB keeps the
  // hex values readable on output (otherwise tonemapping would double-
  // process them).
  texture.colorSpace = "srgb";
  return texture;
}

function materialMatchesKind(material: Material | Material[], kind: MaterialKind): boolean {
  if (Array.isArray(material)) return false;
  switch (kind) {
    // MeshPhysicalMaterial extends MeshStandardMaterial; treat them as
    // separate kinds so `kind: "standard"` never silently keeps a physical
    // material that the manifest no longer wants.
    case "standard":
      return material.type === "MeshStandardMaterial";
    case "physical":
      return material.type === "MeshPhysicalMaterial";
    case "lambert":
      return material instanceof MeshLambertMaterial;
    case "phong":
      return material instanceof MeshPhongMaterial;
    case "basic":
      return material instanceof MeshBasicMaterial;
    case "custom":
      return material instanceof ShaderMaterial;
  }
}

function createMaterialForKind(kind: MaterialKind, patch: MaterialPatch): Material {
  const color = patch.color ?? DEFAULT_COLOR;
  switch (kind) {
    case "standard":
      return new MeshStandardMaterial({ color: new Color(color) });
    case "physical":
      return new MeshPhysicalMaterial({ color: new Color(color) });
    case "lambert":
      return new MeshLambertMaterial({ color: new Color(color) });
    case "phong":
      return new MeshPhongMaterial({ color: new Color(color) });
    case "basic":
      return new MeshBasicMaterial({ color: new Color(color) });
    case "custom": {
      const material = new ShaderMaterial({
        vertexShader: patch.vertexShader ?? DEFAULT_VERTEX_SHADER,
        fragmentShader: patch.fragmentShader ?? DEFAULT_FRAGMENT_SHADER
      });
      applyShaderUniforms(material, patch.uniforms);
      if (patch.defines !== undefined) {
        material.defines = { ...patch.defines };
      }
      return material;
    }
  }
}

const DEFAULT_VERTEX_SHADER = `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const DEFAULT_FRAGMENT_SHADER = `
uniform vec3 color;
void main() {
  gl_FragColor = vec4(color, 1.0);
}
`;

function shadowAlgorithmType(
  kind: "pcf" | "vsm" | "pcss" | undefined,
  mode: "webgl" | "webgpu" = "webgl"
): ShadowMapType {
  // S76 — on WebGPU, three.js's TSL shadow filter library is indexed
  // directly by `shadowMap.type` (PCF / PCFSoft / VSM). Setting type
  // to `PCFSoftShadowMap` enables `PCFSoftShadowFilter` — a 5×5 PCF
  // kernel with linear hardware sampling that visibly softens shadow
  // edges, especially under tall objects (the user's main "where is
  // PCSS?" point on the WebGPU shadows-bench). No GLSL chunks needed.
  if (kind === "pcss" && mode === "webgpu") return PCFSoftShadowMap;
  // WebGL PCSS path: requires reading raw depth from the shadow map
  // (blocker search + variable-penumbra filter). Modern three.js
  // `PCFShadowMap` binds the shadow map as `sampler2DShadow` and uses
  // hardware comparison — the sampler returns 0/1, not raw depth — so
  // the PCSS shader-chunk substitution silently no-ops there.
  // `BasicShadowMap` binds the shadow map as `sampler2D` and the
  // chunk's BASIC variant of `getShadow` reads `texture2D( ... ).r`,
  // which the S41 substitution actually replaces. Matches the official
  // `three/examples/webgl_shadowmap_pcss.html` setup.
  if (kind === "vsm") return VSMShadowMap;
  if (kind === "pcss") return BasicShadowMap;
  return PCFShadowMap;
}

function applyShaderUniforms(
  material: ShaderMaterial,
  uniforms: Record<string, ShaderUniformValue> | undefined
): void {
  if (uniforms === undefined) return;
  for (const [name, raw] of Object.entries(uniforms)) {
    let value: number | Color | ReadonlyArray<number>;
    if (typeof raw === "string" && /^#[0-9a-fA-F]{6}$/.test(raw)) {
      value = new Color(raw);
    } else if (typeof raw === "string") {
      // Not a colour string and we don't have a texture loader hook
      // here — skip silently; agents see the unknown uniform in the
      // shader compile error instead.
      continue;
    } else {
      value = raw;
    }
    material.uniforms[name] = { value };
  }
}
