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
  Color,
  DirectionalLight,
  HemisphereLight,
  InstancedMesh,
  type Light,
  LineBasicMaterial,
  LineSegments,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  ACESFilmicToneMapping,
  LinearToneMapping,
  NoToneMapping,
  ReinhardToneMapping,
  CineonToneMapping,
  AgXToneMapping,
  type ToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  PointLight,
  Quaternion,
  RectAreaLight,
  Scene,
  SpotLight,
  type Texture,
  TextureLoader,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer
} from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { CSM } from "three/examples/jsm/csm/CSM.js";

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
  /** Initial material color (per-bucket; per-instance color via setInstanceColor). */
  color?: string;
  castShadow?: boolean;
  receiveShadow?: boolean;
};

/** M17-batched-mesh: one BatchedMesh per bucket. Multiple geometries share a material. */
export type BatchedBucketHandle = number;
export type BatchedGeometryId = number;

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

/** M21-mat-physical: the shader kind to drive `setMeshMaterialKind`. */
export type MaterialKind = "standard" | "physical" | "lambert" | "phong" | "basic";

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
   * M21-mat-textures: texture map URLs. The adapter resolves them
   * through a process-wide cached TextureLoader and applies them to
   * the matching Three.js material slot. KTX2-encoded textures
   * (.ktx2) route through the shared KTX2Loader singleton — when
   * the renderer has been wired with KTX2 support via the asset
   * decoders module.
   */
  map?: string;
  normalMap?: string;
  normalScale?: number;
  roughnessMap?: string;
  metalnessMap?: string;
  emissiveMap?: string;
  aoMap?: string;
};

export type CameraParams = {
  fov?: number;
  near?: number;
  far?: number;
  /** Width / height. The adapter recomputes this on `resize`; passing it here is only used to seed a freshly-acquired camera. */
  aspect?: number;
};

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
};

export type AdapterOptions = {
  canvas: HTMLCanvasElement;
  background?: string;
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
};

const TONE_MAPPING_BY_KIND: Record<ToneMappingKind, ToneMapping> = {
  "none": NoToneMapping,
  "linear": LinearToneMapping,
  "reinhard": ReinhardToneMapping,
  "cineon": CineonToneMapping,
  "aces-filmic": ACESFilmicToneMapping,
  "agx": AgXToneMapping
};

export type EnvironmentKind = "generated" | "none";

const DEFAULT_COLOR = "#cccccc";

export class ThreeRenderAdapter {
  private readonly canvas: HTMLCanvasElement;
  private readonly device: WebGLRenderer;
  private contextLostListener: ((event: Event) => void) | undefined;
  private contextRestoredListener: (() => void) | undefined;
  // M21-mat-textures: shared TextureLoader + URL → Texture cache so a
  // map shared across N materials only fetches + decodes once.
  private readonly textureLoader = new TextureLoader();
  private readonly textureCache = new Map<string, Texture>();
  private readonly scene: Scene;
  private readonly meshes = new Map<MeshHandle, Mesh>();
  private readonly cameras = new Map<CameraHandle, PerspectiveCamera>();
  private readonly lights = new Map<LightHandle, Light>();
  private readonly buckets = new Map<BucketHandle, BucketEntry>();
  private readonly batchedBuckets = new Map<BatchedBucketHandle, BatchedBucketEntry>();
  private nextBatchedBucketHandle = 1;
  private fallbackAmbient: AmbientLight | undefined;
  private fallbackDirectional: DirectionalLight | undefined;
  private pmrem: PMREMGenerator | undefined;
  private currentEnvironmentTexture: Texture | undefined;
  private currentEnvironmentKind: EnvironmentKind = "none";
  private activeCameraHandle: CameraHandle | undefined;
  private debugOverlay: LineSegments | undefined;
  private csm: CSM | undefined;
  private csmConfig: CsmConfig | undefined;
  private readonly csmMaterials = new Set<Material>();
  private nextMeshHandle = 1;
  private nextCameraHandle = 1;
  private nextLightHandle = 1;
  private nextBucketHandle = 1;
  private rectAreaUniformsReady = false;
  private readonly scratchMatrix = new Matrix4();
  private readonly scratchPosition = new Vector3();
  private readonly scratchScale = new Vector3();
  private readonly scratchQuat = new Quaternion();

  constructor(options: AdapterOptions) {
    this.canvas = options.canvas;
    this.device = new WebGLRenderer({
      canvas: options.canvas,
      antialias: true,
      preserveDrawingBuffer: true
    });
    // M21-context-loss: subscribe ONCE to the canvas's WebGL events.
    // Three.js auto-rebuilds GPU resources on restore; the runtime
    // uses these callbacks to emit diagnostics + optionally pause
    // gameplay until the context is back.
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
    // M21-shadow-basic: enable shadow rendering globally. Per-light + per-mesh
    // opt-in still happens via `setLightCastShadow` / `setMeshCastShadow` etc.
    //
    // PCFShadowMap (4-tap PCF) is the default-recommended type in r184+.
    // PCFSoftShadowMap was deprecated and aliases to PCFShadowMap; calling it
    // directly produced a noisy console warning. VSM is a future stretch
    // (Phase 3) but is not the default — it changes the artifact profile.
    this.device.shadowMap.enabled = true;
    this.device.shadowMap.type = PCFShadowMap;
    // M21-color: tone-mapping is opt-in (default "none" / linear clamp)
    // so existing projects look identical after the upgrade. Projects
    // that want ACES Filmic / AgX highlight roll-off set
    // `project.json#render.color.toneMapping: "aces-filmic"`.
    const toneMappingKind = options.color?.toneMapping ?? "none";
    this.device.toneMapping = TONE_MAPPING_BY_KIND[toneMappingKind];
    this.device.toneMappingExposure = options.color?.exposure ?? 1;
    this.scene = new Scene();
    if (options.background !== undefined) {
      this.scene.background = new Color(options.background);
    }
    // Fallback lighting until LightLifecycleSystem (or the user's scene)
    // provides ECS Light entities. `disableFallbackLighting` removes them
    // once an ECS light is acquired.
    this.enableFallbackLighting();
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
   * Apply an image-based-lighting environment that drives PBR reflections +
   * indirect diffuse on `MeshStandardMaterial` / `MeshPhysicalMaterial`.
   * `generated` builds Three.js's `RoomEnvironment` via `PMREMGenerator` —
   * a tiny synthetic studio cube. `none` clears it. Idempotent: re-setting
   * the same kind is a no-op.
   */
  setEnvironment(kind: EnvironmentKind): void {
    if (kind === this.currentEnvironmentKind) return;
    if (kind === "none") {
      this.scene.environment = null;
      this.currentEnvironmentTexture?.dispose();
      this.currentEnvironmentTexture = undefined;
      this.currentEnvironmentKind = "none";
      return;
    }
    if (this.pmrem === undefined) {
      this.pmrem = new PMREMGenerator(this.device);
      this.pmrem.compileEquirectangularShader();
    }
    this.currentEnvironmentTexture?.dispose();
    const envScene = new RoomEnvironment();
    const rt = this.pmrem.fromScene(envScene, 0.04);
    this.currentEnvironmentTexture = rt.texture;
    this.scene.environment = rt.texture;
    this.currentEnvironmentKind = "generated";
  }

  currentEnvironment(): EnvironmentKind {
    return this.currentEnvironmentKind;
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
    const handle = this.nextBucketHandle;
    this.nextBucketHandle += 1;
    const material = new MeshStandardMaterial({ color: new Color(spec.color ?? DEFAULT_COLOR) });
    this.registerWithCsm(material);
    const mesh = new InstancedMesh(spec.geometry, material, spec.capacity);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = spec.castShadow !== false;
    mesh.receiveShadow = spec.receiveShadow !== false;
    this.scene.add(mesh);
    this.buckets.set(handle, { mesh, capacity: spec.capacity, liveSlots: new Set() });
    return handle;
  }

  releaseBucket(handle: BucketHandle): void {
    const entry = this.buckets.get(handle);
    if (entry === undefined) return;
    this.scene.remove(entry.mesh);
    entry.mesh.dispose();
    entry.mesh.geometry.dispose();
    disposeMaterial(entry.mesh.material);
    this.buckets.delete(handle);
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

  bucketLiveCount(handle: BucketHandle): number {
    return this.buckets.get(handle)?.liveSlots.size ?? 0;
  }

  bucketCapacity(handle: BucketHandle): number {
    return this.buckets.get(handle)?.capacity ?? 0;
  }

  hasBucket(handle: BucketHandle): boolean {
    return this.buckets.has(handle);
  }

  // ---- M17-batched-mesh: BatchedMesh buckets ----

  acquireBatchedBucket(spec: BatchedBucketAcquireSpec): BatchedBucketHandle {
    const handle = this.nextBatchedBucketHandle;
    this.nextBatchedBucketHandle += 1;
    const material = new MeshStandardMaterial({ color: new Color(spec.color ?? DEFAULT_COLOR) });
    this.registerWithCsm(material);
    const mesh = new BatchedMesh(spec.maxInstances, spec.maxVertices, spec.maxIndices, material);
    mesh.frustumCulled = false;
    mesh.castShadow = spec.castShadow !== false;
    mesh.receiveShadow = spec.receiveShadow !== false;
    this.scene.add(mesh);
    this.batchedBuckets.set(handle, { mesh, liveInstances: new Set() });
    return handle;
  }

  releaseBatchedBucket(handle: BatchedBucketHandle): void {
    const entry = this.batchedBuckets.get(handle);
    if (entry === undefined) return;
    this.scene.remove(entry.mesh);
    entry.mesh.dispose();
    disposeMaterial(entry.mesh.material);
    this.batchedBuckets.delete(handle);
  }

  addBatchedGeometry(handle: BatchedBucketHandle, geometry: BufferGeometry): BatchedGeometryId | undefined {
    const entry = this.batchedBuckets.get(handle);
    if (entry === undefined) return undefined;
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

  batchedBucketLiveCount(handle: BatchedBucketHandle): number {
    return this.batchedBuckets.get(handle)?.liveInstances.size ?? 0;
  }

  resize(width: number, height: number): void {
    this.device.setSize(width, height, false);
    const active = this.activeCamera();
    if (active !== undefined) {
      active.aspect = width / Math.max(1, height);
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

    // M21-mat-textures: apply texture maps for materials that support
    // them. `map` (base colour) gets sRGB; the rest stay in linear
    // space per glTF convention. Each setter is no-op-when-already-bound
    // because we cache textures per URL.
    if (
      material instanceof MeshStandardMaterial ||
      material instanceof MeshPhysicalMaterial ||
      material instanceof MeshPhongMaterial ||
      material instanceof MeshLambertMaterial ||
      material instanceof MeshBasicMaterial
    ) {
      if (patch.map !== undefined) {
        material.map = this.acquireTexture(patch.map, true);
      }
    }
    if (
      material instanceof MeshStandardMaterial ||
      material instanceof MeshPhysicalMaterial ||
      material instanceof MeshPhongMaterial
    ) {
      if (patch.normalMap !== undefined) material.normalMap = this.acquireTexture(patch.normalMap, false);
      if (patch.normalScale !== undefined) material.normalScale.set(patch.normalScale, patch.normalScale);
      if (patch.emissiveMap !== undefined) material.emissiveMap = this.acquireTexture(patch.emissiveMap, true);
      if (patch.emissiveIntensity !== undefined) {
        // emissiveIntensity is only on Standard/Physical, not Phong.
        if (
          material instanceof MeshStandardMaterial ||
          material instanceof MeshPhysicalMaterial
        ) {
          material.emissiveIntensity = patch.emissiveIntensity;
        }
      }
      if (patch.aoMap !== undefined) material.aoMap = this.acquireTexture(patch.aoMap, false);
    }
    if (
      material instanceof MeshStandardMaterial ||
      material instanceof MeshPhysicalMaterial
    ) {
      if (patch.roughnessMap !== undefined) {
        material.roughnessMap = this.acquireTexture(patch.roughnessMap, false);
      }
      if (patch.metalnessMap !== undefined) {
        material.metalnessMap = this.acquireTexture(patch.metalnessMap, false);
      }
    }

    material.needsUpdate = true;
  }

  /**
   * M21-mat-textures: return a shared Texture for `url`, fetching +
   * decoding once. Base-colour textures (sRGB) need an explicit
   * colorSpace assignment; data textures (normal / roughness /
   * metalness / AO) stay in the default linear space.
   */
  private acquireTexture(url: string, isColor: boolean): Texture {
    const existing = this.textureCache.get(url);
    if (existing !== undefined) return existing;
    const texture = this.textureLoader.load(url);
    if (isColor) {
      texture.colorSpace = SRGBColorSpace;
    }
    this.textureCache.set(url, texture);
    return texture;
  }

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
    const camera = new PerspectiveCamera(
      params.fov ?? 60,
      params.aspect ?? this.canvasAspect(),
      params.near ?? 0.1,
      params.far ?? 100
    );
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
    if (params.fov !== undefined) camera.fov = params.fov;
    if (params.near !== undefined) camera.near = params.near;
    if (params.far !== undefined) camera.far = params.far;
    if (params.aspect !== undefined) camera.aspect = params.aspect;
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
    // CSM caches the camera reference. Rebuild if it changed (or if
    // it became defined for the first time after a deferred enable).
    if (previous !== handle && this.csmConfig !== undefined) {
      this.rebuildCsm();
    }
  }

  /** Used by the renderer to skip a draw when no camera is bound. */
  hasActiveCamera(): boolean {
    return this.activeCamera() !== undefined;
  }

  draw(): void {
    const camera = this.activeCamera();
    if (camera === undefined) return;
    if (this.csm !== undefined) {
      this.csm.update();
    }
    this.device.render(this.scene, camera);
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
    this.csmConfig = config;
    this.rebuildCsm();
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
    // Reconstruct from scratch so a camera swap or config change is
    // safe — CSM caches the camera ref + shader uniforms.
    this.disposeCsm();
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

  private disposeCsm(): void {
    if (this.csm === undefined) return;
    this.csm.remove();
    this.csm.dispose();
    this.csm = undefined;
    // CSM.dispose already flips needsUpdate on each registered material
    // so the shader recompiles without the cascade defines next frame.
    this.csmMaterials.clear();
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
    return {
      geometries: memory.geometries ?? 0,
      textures: memory.textures ?? 0,
      programs,
      drawCalls: renderStats.calls ?? 0,
      triangles: renderStats.triangles ?? 0,
      meshes: this.meshes.size,
      lights: this.lights.size,
      shadowCasters,
      buckets: this.buckets.size,
      bucketInstances,
      batchedBuckets: this.batchedBuckets.size,
      batchedBucketInstances
    };
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
    for (const handle of [...this.buckets.keys()]) this.releaseBucket(handle);
    for (const handle of [...this.batchedBuckets.keys()]) this.releaseBatchedBucket(handle);
    this.setDebugOverlayEnabled(false);
    this.disableFallbackLighting();
    this.currentEnvironmentTexture?.dispose();
    this.currentEnvironmentTexture = undefined;
    this.pmrem?.dispose();
    this.pmrem = undefined;
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
    for (const texture of this.textureCache.values()) texture.dispose();
    this.textureCache.clear();
    this.device.dispose();
  }

  private activeCamera(): PerspectiveCamera | undefined {
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
  }
}
