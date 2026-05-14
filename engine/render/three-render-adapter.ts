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
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  Scene,
  WebGLRenderer
} from "three";

export type MeshHandle = number;
export type CameraHandle = number;

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
  private activeCameraHandle: CameraHandle | undefined;
  private nextMeshHandle = 1;
  private nextCameraHandle = 1;

  constructor(options: AdapterOptions) {
    this.canvas = options.canvas;
    this.device = new WebGLRenderer({
      canvas: options.canvas,
      antialias: true,
      preserveDrawingBuffer: true
    });
    this.scene = new Scene();
    if (options.background !== undefined) {
      this.scene.background = new Color(options.background);
    }
    // Fallback lighting until M21-light-* moves lights to ECS. Without these
    // a scene with `MeshStandardMaterial` renders as a black blob.
    this.scene.add(new AmbientLight(0xffffff, 0.6));
    const sun = new DirectionalLight(0xffffff, 0.85);
    sun.position.set(5, 10, 7);
    this.scene.add(sun);
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
    return {
      geometries: memory.geometries ?? 0,
      textures: memory.textures ?? 0,
      programs,
      drawCalls: renderStats.calls ?? 0,
      triangles: renderStats.triangles ?? 0,
      meshes: this.meshes.size
    };
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      disposeMaterial(mesh.material);
    }
    this.meshes.clear();
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
