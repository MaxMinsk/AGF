import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  WebGLRenderer,
  MathUtils,
  type BufferGeometry,
  type Material,
  type Object3D
} from "three";
import type { EntityId } from "../core/ecs/types";
import type { World } from "../core/ecs/world";
import {
  resolveHierarchy,
  type ResolvedTransform,
  type TransformInput,
  type Vec3 as ResolverVec3
} from "../core/transform/resolve";
import type { AssetRegistry } from "../runtime/asset-registry";
import type { MaterialManifest } from "../runtime/asset-loaders/material-loader";
import type { GlbAsset } from "./glb-loader";

type Vec3 = ReadonlyArray<number>;

type TransformComponent = {
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  parent?: EntityId;
};

type CameraComponent = {
  kind: "perspective" | "orthographic";
  active?: boolean;
  fov?: number;
  near?: number;
  far?: number;
};

type MeshRendererComponent = {
  mesh: string;
  material?: string;
  color?: string;
};

const DEFAULT_COLOR = "#cccccc";

export class ThreeRenderer {
  private readonly world: World;
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly meshes = new Map<EntityId, Mesh>();
  private readonly appliedMaterials = new Map<EntityId, string>();
  private readonly appliedGeometries = new Map<EntityId, string>();
  private readonly assetRegistry: AssetRegistry | undefined;
  private camera: PerspectiveCamera | undefined;
  private cameraEntityId: EntityId | undefined;

  constructor(
    world: World,
    canvas: HTMLCanvasElement,
    background?: string,
    assetRegistry?: AssetRegistry
  ) {
    this.world = world;
    this.canvas = canvas;
    this.assetRegistry = assetRegistry;
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true
    });
    this.scene = new Scene();
    if (background !== undefined) {
      this.scene.background = new Color(background);
    }
    this.scene.add(new AmbientLight(0xffffff, 0.6));
    const sun = new DirectionalLight(0xffffff, 0.85);
    sun.position.set(5, 10, 7);
    this.scene.add(sun);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    if (this.camera !== undefined) {
      this.camera.aspect = width / Math.max(1, height);
      this.camera.updateProjectionMatrix();
    }
  }

  render(): void {
    const resolved = this.buildResolvedTransforms();
    this.refreshCamera(resolved);
    this.refreshMeshes(resolved);
    if (this.camera === undefined) {
      return;
    }
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Pull every entity's Transform off the World, convert degrees→radians,
   * and feed the resolver so children inherit their parent's world frame.
   * Returns an empty map when no entities carry Transform.
   */
  private buildResolvedTransforms(): Map<EntityId, ResolvedTransform> {
    const inputs: TransformInput[] = [];
    for (const id of this.world.entityIds()) {
      if (!this.world.hasComponent(id, "Transform")) {
        continue;
      }
      const t = this.world.getComponent<TransformComponent>(id, "Transform");
      if (t === undefined) continue;
      const entry: TransformInput = { id };
      if (t.parent !== undefined) entry.parent = t.parent;
      if (t.position !== undefined) entry.position = toVec3(t.position);
      if (t.rotation !== undefined) {
        // Scene rotations are degrees; resolver math is in radians.
        entry.rotation = [
          MathUtils.degToRad(t.rotation[0] ?? 0),
          MathUtils.degToRad(t.rotation[1] ?? 0),
          MathUtils.degToRad(t.rotation[2] ?? 0)
        ];
      }
      if (t.scale !== undefined) entry.scale = toVec3(t.scale);
      inputs.push(entry);
    }
    if (inputs.length === 0) {
      return new Map();
    }
    try {
      return resolveHierarchy(inputs);
    } catch {
      // engine check is the source of truth for hierarchy diagnostics.
      // Renderer should not crash if a bad parent slips through (e.g. a
      // mid-edit HMR state). Fall back to identity-per-entity.
      return new Map(
        inputs.map((entry) => [
          entry.id,
          {
            parent: undefined,
            local: identityFor(entry),
            world: identityFor(entry)
          }
        ])
      );
    }
  }

  /**
   * Snapshot of Three.js WebGL resource counters plus the mesh count.
   * Exposed via `window.__agf.rendererInfo()` for agent / e2e assertions
   * that resource counts stay bounded across HMR cycles.
   */
  info(): {
    geometries: number;
    textures: number;
    programs: number;
    drawCalls: number;
    triangles: number;
    meshes: number;
  } {
    const memory = this.renderer.info.memory;
    const renderStats = this.renderer.info.render;
    const programs = this.renderer.info.programs?.length ?? 0;
    return {
      geometries: memory.geometries ?? 0,
      textures: memory.textures ?? 0,
      programs,
      drawCalls: renderStats.calls ?? 0,
      triangles: renderStats.triangles ?? 0,
      meshes: this.meshes.size
    };
  }

  /**
   * Forget the cached binding for an asset reference so the renderer re-fetches
   * and re-applies it on the next refreshMeshes. Used by asset HMR.
   */
  forgetAssetBinding(ref: string): void {
    for (const [entityId, currentRef] of this.appliedMaterials) {
      if (currentRef === ref) {
        this.appliedMaterials.delete(entityId);
      }
    }
    for (const [entityId, currentRef] of this.appliedGeometries) {
      if (currentRef === ref) {
        this.appliedGeometries.delete(entityId);
      }
    }
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      disposeMaterial(mesh.material);
    }
    this.meshes.clear();
    this.renderer.dispose();
  }

  private refreshCamera(resolved: Map<EntityId, ResolvedTransform>): void {
    const cameraEntities = this.world.query(["Camera"]);
    let activeId: EntityId | undefined;
    for (const id of cameraEntities) {
      const component = this.world.getComponent<CameraComponent>(id, "Camera");
      if (component?.active === true) {
        activeId = id;
        break;
      }
    }
    if (activeId === undefined) {
      activeId = cameraEntities[0];
    }
    if (activeId === undefined) {
      return;
    }

    const cameraComponent = this.world.getComponent<CameraComponent>(activeId, "Camera");
    if (cameraComponent === undefined || cameraComponent.kind !== "perspective") {
      return;
    }

    if (this.camera === undefined || this.cameraEntityId !== activeId) {
      this.camera = new PerspectiveCamera(
        cameraComponent.fov ?? 60,
        this.canvasAspect(),
        cameraComponent.near ?? 0.1,
        cameraComponent.far ?? 100
      );
      this.cameraEntityId = activeId;
    } else {
      this.camera.fov = cameraComponent.fov ?? this.camera.fov;
      this.camera.near = cameraComponent.near ?? this.camera.near;
      this.camera.far = cameraComponent.far ?? this.camera.far;
      this.camera.updateProjectionMatrix();
    }

    applyResolvedTransform(this.camera, resolved.get(activeId)?.world);
  }

  private refreshMeshes(resolved: Map<EntityId, ResolvedTransform>): void {
    const renderable = new Set(this.world.query(["MeshRenderer"]));

    for (const [id, mesh] of this.meshes) {
      if (!renderable.has(id)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        disposeMaterial(mesh.material);
        this.meshes.delete(id);
        this.appliedMaterials.delete(id);
        this.appliedGeometries.delete(id);
      }
    }

    for (const id of renderable) {
      const meshComponent = this.world.getComponent<MeshRendererComponent>(id, "MeshRenderer");
      if (meshComponent === undefined) {
        continue;
      }

      let mesh = this.meshes.get(id);
      if (mesh === undefined) {
        const geometry = isExternalMeshRef(meshComponent.mesh)
          ? createPlaceholderGeometry()
          : createPrimitiveGeometry(meshComponent.mesh);
        if (geometry === undefined) {
          continue;
        }
        const material = new MeshStandardMaterial({
          color: new Color(meshComponent.color ?? DEFAULT_COLOR)
        });
        mesh = new Mesh(geometry, material);
        this.scene.add(mesh);
        this.meshes.set(id, mesh);
      } else if (mesh.material instanceof MeshStandardMaterial && meshComponent.material === undefined) {
        mesh.material.color.set(meshComponent.color ?? DEFAULT_COLOR);
      }

      if (isExternalMeshRef(meshComponent.mesh)) {
        this.maybeLoadGeometry(id, mesh, meshComponent.mesh);
      } else if (this.appliedGeometries.has(id)) {
        this.appliedGeometries.delete(id);
      }

      if (meshComponent.material !== undefined) {
        this.maybeApplyMaterial(id, mesh, meshComponent.material);
      } else if (this.appliedMaterials.has(id)) {
        this.appliedMaterials.delete(id);
      }

      applyResolvedTransform(mesh, resolved.get(id)?.world);
    }
  }

  private maybeLoadGeometry(entityId: EntityId, mesh: Mesh, meshRef: string): void {
    if (this.assetRegistry === undefined) {
      return;
    }
    if (this.appliedGeometries.get(entityId) === meshRef) {
      return;
    }
    this.appliedGeometries.set(entityId, meshRef);

    this.assetRegistry.get<GlbAsset>(meshRef).then(
      (asset) => {
        if (this.appliedGeometries.get(entityId) !== meshRef) {
          return;
        }
        const sourceMesh = findFirstMesh(asset.scene);
        if (sourceMesh === undefined) {
          console.warn(`[agf] glb "${meshRef}" contains no Mesh; skipping.`);
          return;
        }
        mesh.geometry.dispose();
        mesh.geometry = sourceMesh.geometry.clone();
      },
      (error: unknown) => {
        console.error(`[agf] mesh load failed for "${entityId}" → "${meshRef}":`, error);
        if (this.appliedGeometries.get(entityId) === meshRef) {
          this.appliedGeometries.delete(entityId);
        }
      }
    );
  }

  private maybeApplyMaterial(entityId: EntityId, mesh: Mesh, materialRef: string): void {
    if (this.assetRegistry === undefined) {
      return;
    }
    if (this.appliedMaterials.get(entityId) === materialRef) {
      return;
    }
    this.appliedMaterials.set(entityId, materialRef);

    this.assetRegistry.get<MaterialManifest>(materialRef).then(
      (manifest) => {
        if (!(mesh.material instanceof MeshStandardMaterial)) {
          return;
        }
        if (this.appliedMaterials.get(entityId) !== materialRef) {
          return;
        }
        mesh.material.color.set(manifest.color);
        if (manifest.roughness !== undefined) {
          mesh.material.roughness = manifest.roughness;
        }
        if (manifest.metalness !== undefined) {
          mesh.material.metalness = manifest.metalness;
        }
        if (manifest.emissive !== undefined) {
          mesh.material.emissive.set(manifest.emissive);
        }
        mesh.material.needsUpdate = true;
      },
      (error: unknown) => {
        console.error(`[agf] material load failed for "${entityId}" → "${materialRef}":`, error);
        if (this.appliedMaterials.get(entityId) === materialRef) {
          this.appliedMaterials.delete(entityId);
        }
      }
    );
  }

  private canvasAspect(): number {
    const width = this.canvas.clientWidth || this.canvas.width;
    const height = this.canvas.clientHeight || this.canvas.height;
    return width / Math.max(1, height);
  }
}

/**
 * Apply a resolver-produced world transform (radians already) to a Three.js
 * object. Falls back to identity when the entity has no Transform.
 */
function applyResolvedTransform(object: Object3D, world: ResolverVec3Holder | undefined): void {
  if (world === undefined) {
    return;
  }
  object.position.set(world.position[0], world.position[1], world.position[2]);
  object.rotation.set(world.rotation[0], world.rotation[1], world.rotation[2]);
  object.scale.set(world.scale[0], world.scale[1], world.scale[2]);
}

type ResolverVec3Holder = {
  position: ResolverVec3;
  rotation: ResolverVec3;
  scale: ResolverVec3;
};

function toVec3(value: Vec3): ResolverVec3 {
  return [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0];
}

function identityFor(entry: TransformInput): ResolverVec3Holder {
  return {
    position: entry.position ?? [0, 0, 0],
    rotation: entry.rotation ?? [0, 0, 0],
    scale: entry.scale ?? [1, 1, 1]
  };
}

function createPrimitiveGeometry(name: string): BufferGeometry | undefined {
  switch (name) {
    case "box":
      return new BoxGeometry(1, 1, 1);
    case "sphere":
      return new SphereGeometry(0.5, 24, 16);
    case "plane":
      return new PlaneGeometry(1, 1);
    default:
      return undefined;
  }
}

function createPlaceholderGeometry(): BufferGeometry {
  // Near-zero box keeps the mesh in the scene graph without flashing a visible
  // placeholder while the real geometry loads asynchronously.
  return new BoxGeometry(0.0001, 0.0001, 0.0001);
}

function isExternalMeshRef(ref: string): boolean {
  return ref.endsWith(".glb") || ref.endsWith(".gltf");
}

function findFirstMesh(root: Object3D): Mesh | undefined {
  let found: Mesh | undefined;
  root.traverse((object) => {
    if (found === undefined && (object as Mesh).isMesh === true) {
      found = object as Mesh;
    }
  });
  return found;
}

function disposeMaterial(material: Material | Material[]): void {
  if (Array.isArray(material)) {
    for (const item of material) {
      item.dispose();
    }
    return;
  }
  material.dispose();
}
