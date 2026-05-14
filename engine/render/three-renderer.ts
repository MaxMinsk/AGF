import { BoxGeometry, MathUtils, type BufferGeometry, type Mesh, type Object3D, PlaneGeometry, SphereGeometry } from "three";
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
import { ThreeRenderAdapter, type CameraHandle, type MeshHandle, type ResolvedWorld } from "./three-render-adapter";

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

/**
 * Orchestrator for the renderer pipeline. Reads ECS state, decides what
 * needs to happen each frame, and calls into the adapter. Three.js types
 * appear here only via the GLB loader's payload — direct GPU touches go
 * through `ThreeRenderAdapter`.
 *
 * `M21-a` extracted the adapter. Subsequent stories `M21-b..f` peel each
 * `refresh*` method out into its own scheduler-registered `System`, at
 * which point this class becomes a thin shim that creates the adapter,
 * registers the systems and forwards a few lifecycle calls.
 */
export class ThreeRenderer {
  private readonly world: World;
  private readonly adapter: ThreeRenderAdapter;
  private readonly meshHandles = new Map<EntityId, MeshHandle>();
  private readonly appliedMaterials = new Map<EntityId, string>();
  private readonly appliedGeometries = new Map<EntityId, string>();
  private readonly assetRegistry: AssetRegistry | undefined;
  private cameraHandle: CameraHandle | undefined;
  private cameraEntityId: EntityId | undefined;

  constructor(
    world: World,
    canvas: HTMLCanvasElement,
    background?: string,
    assetRegistry?: AssetRegistry
  ) {
    this.world = world;
    this.assetRegistry = assetRegistry;
    const options: { canvas: HTMLCanvasElement; background?: string } = { canvas };
    if (background !== undefined) options.background = background;
    this.adapter = new ThreeRenderAdapter(options);
  }

  resize(width: number, height: number): void {
    this.adapter.resize(width, height);
  }

  render(): void {
    const resolved = this.buildResolvedTransforms();
    this.refreshCamera(resolved);
    this.refreshMeshes(resolved);
    if (!this.adapter.hasActiveCamera()) return;
    this.adapter.draw();
  }

  /**
   * Read resolved world transforms. If `TransformResolveSystem` (M21-b) is
   * registered, every Transform-bearing entity carries a `LocalToWorld`
   * component and we use that directly — zero work duplicated. If the
   * system is absent, fall back to the inline resolve so apps that don't
   * register a scheduler still render correctly.
   */
  private buildResolvedTransforms(): Map<EntityId, ResolvedTransform> {
    const fromComponent = this.tryReadLocalToWorld();
    if (fromComponent !== undefined) return fromComponent;

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

  private tryReadLocalToWorld(): Map<EntityId, ResolvedTransform> | undefined {
    const carriers = this.world.query(["LocalToWorld"]);
    if (carriers.length === 0) return undefined;
    const result = new Map<EntityId, ResolvedTransform>();
    for (const id of carriers) {
      const ltw = this.world.getComponent<{
        position: ReadonlyArray<number>;
        rotation: ReadonlyArray<number>;
        scale: ReadonlyArray<number>;
      }>(id, "LocalToWorld");
      if (ltw === undefined) continue;
      const world = {
        position: [ltw.position[0] ?? 0, ltw.position[1] ?? 0, ltw.position[2] ?? 0] as const,
        rotation: [ltw.rotation[0] ?? 0, ltw.rotation[1] ?? 0, ltw.rotation[2] ?? 0] as const,
        scale: [ltw.scale[0] ?? 1, ltw.scale[1] ?? 1, ltw.scale[2] ?? 1] as const
      };
      result.set(id, {
        parent: undefined,
        local: world,
        world
      });
    }
    return result;
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
    return this.adapter.info();
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
    this.meshHandles.clear();
    this.appliedMaterials.clear();
    this.appliedGeometries.clear();
    this.cameraHandle = undefined;
    this.cameraEntityId = undefined;
    this.adapter.dispose();
  }

  private refreshCamera(resolved: Map<EntityId, ResolvedTransform>): void {
    // Prefer the ActiveCamera marker from CameraSyncSystem (M21-c). When the
    // system isn't registered (no scheduler), fall back to the legacy
    // inline pick so static-only consumers still render.
    const markers = this.world.query(["ActiveCamera"]);
    let activeId: EntityId | undefined = markers[0];
    if (activeId === undefined) {
      const cameraEntities = this.world.query(["Camera"]);
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
    }
    if (activeId === undefined) {
      this.adapter.setActiveCamera(undefined);
      return;
    }

    const cameraComponent = this.world.getComponent<CameraComponent>(activeId, "Camera");
    if (cameraComponent === undefined || cameraComponent.kind !== "perspective") {
      this.adapter.setActiveCamera(undefined);
      return;
    }

    if (this.cameraHandle === undefined || this.cameraEntityId !== activeId) {
      if (this.cameraHandle !== undefined) {
        this.adapter.releaseCamera(this.cameraHandle);
      }
      const acquire: { fov?: number; near?: number; far?: number } = {};
      if (cameraComponent.fov !== undefined) acquire.fov = cameraComponent.fov;
      if (cameraComponent.near !== undefined) acquire.near = cameraComponent.near;
      if (cameraComponent.far !== undefined) acquire.far = cameraComponent.far;
      this.cameraHandle = this.adapter.acquireCamera(acquire);
      this.cameraEntityId = activeId;
    } else {
      const patch: { fov?: number; near?: number; far?: number } = {};
      if (cameraComponent.fov !== undefined) patch.fov = cameraComponent.fov;
      if (cameraComponent.near !== undefined) patch.near = cameraComponent.near;
      if (cameraComponent.far !== undefined) patch.far = cameraComponent.far;
      this.adapter.setCameraParams(this.cameraHandle, patch);
    }

    this.adapter.setActiveCamera(this.cameraHandle);
    const transform = resolved.get(activeId)?.world;
    if (transform !== undefined) {
      this.adapter.setCameraTransform(this.cameraHandle, toResolvedWorld(transform));
    }
  }

  private refreshMeshes(resolved: Map<EntityId, ResolvedTransform>): void {
    const renderable = new Set(this.world.query(["MeshRenderer"]));

    for (const [id, handle] of this.meshHandles) {
      if (!renderable.has(id)) {
        this.adapter.releaseMesh(handle);
        this.meshHandles.delete(id);
        this.appliedMaterials.delete(id);
        this.appliedGeometries.delete(id);
      }
    }

    for (const id of renderable) {
      const meshComponent = this.world.getComponent<MeshRendererComponent>(id, "MeshRenderer");
      if (meshComponent === undefined) {
        continue;
      }

      let handle = this.meshHandles.get(id);
      if (handle === undefined) {
        const geometry = isExternalMeshRef(meshComponent.mesh)
          ? createPlaceholderGeometry()
          : createPrimitiveGeometry(meshComponent.mesh);
        if (geometry === undefined) {
          continue;
        }
        const acquire: { geometry: BufferGeometry; color?: string } = { geometry };
        if (meshComponent.color !== undefined) acquire.color = meshComponent.color;
        handle = this.adapter.acquireMesh(acquire);
        this.meshHandles.set(id, handle);
      } else if (meshComponent.material === undefined) {
        const patch: { color?: string } = {};
        if (meshComponent.color !== undefined) patch.color = meshComponent.color;
        this.adapter.setMeshMaterialPatch(handle, patch);
      }

      if (isExternalMeshRef(meshComponent.mesh)) {
        this.maybeLoadGeometry(id, handle, meshComponent.mesh);
      } else if (this.appliedGeometries.has(id)) {
        this.appliedGeometries.delete(id);
      }

      if (meshComponent.material !== undefined) {
        this.maybeApplyMaterial(id, handle, meshComponent.material);
      } else if (this.appliedMaterials.has(id)) {
        this.appliedMaterials.delete(id);
      }

      const transform = resolved.get(id)?.world;
      if (transform !== undefined) {
        this.adapter.setMeshTransform(handle, toResolvedWorld(transform));
      }
    }
  }

  private maybeLoadGeometry(entityId: EntityId, handle: MeshHandle, meshRef: string): void {
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
        if (!this.adapter.hasMesh(handle)) {
          return;
        }
        const sourceMesh = findFirstMesh(asset.scene);
        if (sourceMesh === undefined) {
          console.warn(`[agf] glb "${meshRef}" contains no Mesh; skipping.`);
          return;
        }
        this.adapter.setMeshGeometry(handle, sourceMesh.geometry.clone());
      },
      (error: unknown) => {
        console.error(`[agf] mesh load failed for "${entityId}" → "${meshRef}":`, error);
        if (this.appliedGeometries.get(entityId) === meshRef) {
          this.appliedGeometries.delete(entityId);
        }
      }
    );
  }

  private maybeApplyMaterial(entityId: EntityId, handle: MeshHandle, materialRef: string): void {
    if (this.assetRegistry === undefined) {
      return;
    }
    if (this.appliedMaterials.get(entityId) === materialRef) {
      return;
    }
    this.appliedMaterials.set(entityId, materialRef);

    this.assetRegistry.get<MaterialManifest>(materialRef).then(
      (manifest) => {
        if (this.appliedMaterials.get(entityId) !== materialRef) {
          return;
        }
        if (!this.adapter.hasMesh(handle)) {
          return;
        }
        const patch: { color?: string; roughness?: number; metalness?: number; emissive?: string } = {
          color: manifest.color
        };
        if (manifest.roughness !== undefined) patch.roughness = manifest.roughness;
        if (manifest.metalness !== undefined) patch.metalness = manifest.metalness;
        if (manifest.emissive !== undefined) patch.emissive = manifest.emissive;
        this.adapter.setMeshMaterialPatch(handle, patch);
      },
      (error: unknown) => {
        console.error(`[agf] material load failed for "${entityId}" → "${materialRef}":`, error);
        if (this.appliedMaterials.get(entityId) === materialRef) {
          this.appliedMaterials.delete(entityId);
        }
      }
    );
  }
}

function toResolvedWorld(t: ResolvedTransform["world"]): ResolvedWorld {
  return { position: t.position, rotation: t.rotation, scale: t.scale };
}

function toVec3(value: Vec3): ResolverVec3 {
  return [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0];
}

function identityFor(entry: TransformInput): {
  position: ResolverVec3;
  rotation: ResolverVec3;
  scale: ResolverVec3;
} {
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
