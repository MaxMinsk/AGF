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
  type BufferGeometry,
  Color,
  DirectionalLight,
  type Light,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PointLight,
  Scene,
  WebGLRenderer
} from "three";

export type MeshHandle = number;
export type CameraHandle = number;
export type LightHandle = number;

export type LightKind = "directional" | "point" | "ambient";

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
  /** Point-light specific. */
  distance?: number;
  /** Point-light specific. */
  decay?: number;
};

export type LightPatch = {
  color?: string;
  intensity?: number;
  distance?: number;
  decay?: number;
};

export type ResolvedWorld = {
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
  scale: readonly [number, number, number];
};

export type MaterialPatch = {
  color?: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
};

export type CameraParams = {
  fov?: number;
  near?: number;
  far?: number;
  /** Width / height. The adapter recomputes this on `resize`; passing it here is only used to seed a freshly-acquired camera. */
  aspect?: number;
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
};

export type AdapterOptions = {
  canvas: HTMLCanvasElement;
  background?: string;
};

const DEFAULT_COLOR = "#cccccc";

export class ThreeRenderAdapter {
  private readonly canvas: HTMLCanvasElement;
  private readonly device: WebGLRenderer;
  private readonly scene: Scene;
  private readonly meshes = new Map<MeshHandle, Mesh>();
  private readonly cameras = new Map<CameraHandle, PerspectiveCamera>();
  private readonly lights = new Map<LightHandle, Light>();
  private fallbackAmbient: AmbientLight | undefined;
  private fallbackDirectional: DirectionalLight | undefined;
  private activeCameraHandle: CameraHandle | undefined;
  private nextMeshHandle = 1;
  private nextCameraHandle = 1;
  private nextLightHandle = 1;

  constructor(options: AdapterOptions) {
    this.canvas = options.canvas;
    this.device = new WebGLRenderer({
      canvas: options.canvas,
      antialias: true,
      preserveDrawingBuffer: true
    });
    // M21-shadow-basic: enable shadow rendering globally. Per-light + per-mesh
    // opt-in still happens via `setLightCastShadow` / `setMeshCastShadow` etc.
    //
    // PCFShadowMap (4-tap PCF) is the default-recommended type in r184+.
    // PCFSoftShadowMap was deprecated and aliases to PCFShadowMap; calling it
    // directly produced a noisy console warning. VSM is a future stretch
    // (Phase 3) but is not the default — it changes the artifact profile.
    this.device.shadowMap.enabled = true;
    this.device.shadowMap.type = PCFShadowMap;
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
    }
    this.lights.set(handle, light);
    this.scene.add(light);
    return handle;
  }

  releaseLight(handle: LightHandle): void {
    const light = this.lights.get(handle);
    if (light === undefined) return;
    this.scene.remove(light);
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
    if (!(mesh.material instanceof MeshStandardMaterial)) return;
    if (patch.color !== undefined) mesh.material.color.set(patch.color);
    if (patch.roughness !== undefined) mesh.material.roughness = patch.roughness;
    if (patch.metalness !== undefined) mesh.material.metalness = patch.metalness;
    if (patch.emissive !== undefined) mesh.material.emissive.set(patch.emissive);
    mesh.material.needsUpdate = true;
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
    this.activeCameraHandle = handle;
  }

  /** Used by the renderer to skip a draw when no camera is bound. */
  hasActiveCamera(): boolean {
    return this.activeCamera() !== undefined;
  }

  draw(): void {
    const camera = this.activeCamera();
    if (camera === undefined) return;
    this.device.render(this.scene, camera);
  }

  info(): AdapterInfo {
    const memory = this.device.info.memory;
    const renderStats = this.device.info.render;
    const programs = this.device.info.programs?.length ?? 0;
    let shadowCasters = 0;
    for (const light of this.lights.values()) {
      if (light.castShadow) shadowCasters += 1;
    }
    return {
      geometries: memory.geometries ?? 0,
      textures: memory.textures ?? 0,
      programs,
      drawCalls: renderStats.calls ?? 0,
      triangles: renderStats.triangles ?? 0,
      meshes: this.meshes.size,
      lights: this.lights.size,
      shadowCasters
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
    this.disableFallbackLighting();
    this.cameras.clear();
    this.activeCameraHandle = undefined;
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

function disposeMaterial(material: Mesh["material"]): void {
  if (Array.isArray(material)) {
    for (const item of material) item.dispose();
    return;
  }
  material.dispose();
}
