// agf-allow:console-file renderer pipeline — same renderer-side
// rationale as three-render-adapter.ts; bus injection follow-up.
import { MathUtils, type Mesh, type Object3D } from "three";
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
import { createLightHandleRegistry, type LightHandleRegistry } from "./light-handle-registry";
import { createMeshHandleRegistry, type MeshHandleRegistry } from "./mesh-handle-registry";
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
  /** S81 KABOOM-ORTHO-CAMERA: half-height for the orthographic projection. */
  orthographicSize?: number;
};

type CameraAcquireParams = {
  kind: "perspective" | "orthographic";
  fov?: number;
  near?: number;
  far?: number;
  orthographicSize?: number;
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
  readonly adapter: ThreeRenderAdapter;
  private readonly registry: MeshHandleRegistry;
  private readonly lightRegistry: LightHandleRegistry;
  private readonly appliedMaterials = new Map<EntityId, string>();
  private readonly appliedGeometries = new Map<EntityId, string>();
  private readonly assetRegistry: AssetRegistry | undefined;
  private cameraHandle: CameraHandle | undefined;
  private cameraEntityId: EntityId | undefined;
  /** S81 KABOOM-ORTHO-CAMERA: track the projection kind currently bound so we can re-acquire when it flips. */
  private boundCameraKind: "perspective" | "orthographic" | undefined;
  private materialBindingExternal = false;
  private meshTransformSyncExternal = false;

  constructor(
    world: World,
    canvas: HTMLCanvasElement,
    background?: string,
    assetRegistry?: AssetRegistry,
    extraOptions?: {
      onContextLost?: () => void;
      onContextRestored?: () => void;
      color?: import("./three-render-adapter").ColorPipelineOptions;
      shadowAlgorithm?: "pcf" | "vsm" | "pcss";
      skyGradient?: import("./three-render-adapter").SkyGradient;
      mode?: "webgl" | "webgpu";
    }
  ) {
    this.world = world;
    this.assetRegistry = assetRegistry;
    const options: import("./three-render-adapter").AdapterOptions = { canvas };
    if (background !== undefined) options.background = background;
    if (extraOptions?.onContextLost !== undefined) {
      options.onContextLost = extraOptions.onContextLost;
    }
    if (extraOptions?.onContextRestored !== undefined) {
      options.onContextRestored = extraOptions.onContextRestored;
    }
    if (extraOptions?.color !== undefined) {
      options.color = extraOptions.color;
    }
    if (extraOptions?.shadowAlgorithm !== undefined) {
      options.shadowAlgorithm = extraOptions.shadowAlgorithm;
    }
    if (extraOptions?.skyGradient !== undefined) {
      options.skyGradient = extraOptions.skyGradient;
    }
    if (extraOptions?.mode !== undefined) {
      options.mode = extraOptions.mode;
    }
    this.adapter = new ThreeRenderAdapter(options);
    this.registry = createMeshHandleRegistry(this.adapter);
    this.lightRegistry = createLightHandleRegistry(this.adapter);
  }

  /**
   * Expose the shared mesh-handle registry so `start.ts` can construct
   * `MeshLifecycleSystem` (M21-d) and future renderer Systems against the
   * same handle table the renderer reads.
   */
  meshRegistry(): MeshHandleRegistry {
    return this.registry;
  }

  /**
   * Expose the shared light-handle registry so `start.ts` can construct
   * `LightLifecycleSystem` (M21-light-directional-point) over the same
   * handle table the renderer talks to.
   */
  lightRegistryHandle(): LightHandleRegistry {
    return this.lightRegistry;
  }

  /**
   * Tell the renderer that `MaterialBindingSystem` (M21-e) is registered.
   * When true, the renderer skips geometry + material asset reconciliation
   * in `refreshMeshes` — the system has already done it (or is in flight).
   */
  setMaterialBindingExternal(value: boolean): void {
    this.materialBindingExternal = value;
  }

  /**
   * Tell the renderer that `MeshTransformSyncSystem` (M21-f) owns the
   * per-frame `adapter.setMeshTransform` calls. The renderer skips the
   * tail transform-write inside refreshMeshes when this flag is true.
   */
  setMeshTransformSyncExternal(value: boolean): void {
    this.meshTransformSyncExternal = value;
  }

  resize(width: number, height: number): void {
    this.adapter.resize(width, height);
  }

  /**
   * Drives one frame of rendering. Returns `true` iff there was an
   * active camera + an actual `adapter.draw()` call ran — start.ts
   * uses this to resolve `RuntimeHandle.rendererReady` on the first
   * successful frame.
   */
  render(): boolean {
    const resolved = this.buildResolvedTransforms();
    this.refreshCamera(resolved);
    this.refreshMeshes(resolved);
    if (!this.adapter.hasActiveCamera()) return false;
    this.adapter.draw();
    return true;
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
   * Snapshot of Three.js WebGL resource counters plus the mesh count and
   * the M21-g `handleLeak` invariant — `registry.size() -
   * count(world.query(["RenderMeshHandle"]))`. Non-zero means the
   * lifecycle system and the registry disagree about how many handles
   * should exist; any positive value is a regression on the renderer
   * pipeline and should fail tests / surface a doctor diagnostic.
   * Exposed via `window.__agf.rendererInfo()` for agent / e2e assertions.
   */
  info(): {
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
    gpuMs?: number;
    reflectionProbes: number;
    prefilterMs: number;
    planarMirrors: number;
    renderer: "webgl" | "webgpu";
  } {
    const adapter = this.adapter.info();
    // agf-allow: world.query — diagnostic, fires once per __agf.rendererInfo() call.
    const tracked = this.world.query(["RenderMeshHandle"]).length;
    return { ...adapter, handleLeak: this.registry.size() - tracked };
  }

  /**
   * S83 AGF-AGENT-RENDERER-PROBE. Compact JSON dump for agent
   * inspection: every renderer-internal counter from `info()` plus
   * the explicit list of entity ids currently holding mesh handles.
   * That handle list was the missing piece in the S82 restart
   * bug-hunt — `handleLeak: 8` told us something was wrong, but not
   * WHICH entities. Surface it here so agents grep on a fresh JSON
   * blob instead of writing throwaway probes.
   */
  inspect(): {
    info: ReturnType<ThreeRenderer["info"]>;
    handles: { count: number; entityIds: string[] };
  } {
    return {
      info: this.info(),
      handles: {
        count: this.registry.size(),
        entityIds: [...this.registry.entityIds()]
      }
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
    this.registry.clear();
    this.lightRegistry.clear();
    this.appliedMaterials.clear();
    this.appliedGeometries.clear();
    this.cameraHandle = undefined;
    this.cameraEntityId = undefined;
    this.boundCameraKind = undefined;
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
    if (
      cameraComponent === undefined ||
      (cameraComponent.kind !== "perspective" && cameraComponent.kind !== "orthographic")
    ) {
      this.adapter.setActiveCamera(undefined);
      return;
    }

    // S81 KABOOM-ORTHO-CAMERA. Acquire freshly on first bind or whenever
    // the bound camera entity changes; we also re-acquire when the
    // `kind` of an already-bound entity flips between perspective and
    // orthographic, because the underlying Three.js object class
    // differs and setCameraParams can't switch projection mode.
    const previousKind = this.boundCameraKind;
    const kindChanged = previousKind !== undefined && previousKind !== cameraComponent.kind;
    if (this.cameraHandle === undefined || this.cameraEntityId !== activeId || kindChanged) {
      if (this.cameraHandle !== undefined) {
        this.adapter.releaseCamera(this.cameraHandle);
      }
      const acquire: CameraAcquireParams = { kind: cameraComponent.kind };
      if (cameraComponent.fov !== undefined) acquire.fov = cameraComponent.fov;
      if (cameraComponent.near !== undefined) acquire.near = cameraComponent.near;
      if (cameraComponent.far !== undefined) acquire.far = cameraComponent.far;
      if (cameraComponent.orthographicSize !== undefined) {
        acquire.orthographicSize = cameraComponent.orthographicSize;
      }
      this.cameraHandle = this.adapter.acquireCamera(acquire);
      this.cameraEntityId = activeId;
      this.boundCameraKind = cameraComponent.kind;
    } else {
      const patch: CameraAcquireParams = { kind: cameraComponent.kind };
      if (cameraComponent.fov !== undefined) patch.fov = cameraComponent.fov;
      if (cameraComponent.near !== undefined) patch.near = cameraComponent.near;
      if (cameraComponent.far !== undefined) patch.far = cameraComponent.far;
      if (cameraComponent.orthographicSize !== undefined) {
        patch.orthographicSize = cameraComponent.orthographicSize;
      }
      this.adapter.setCameraParams(this.cameraHandle, patch);
    }

    this.adapter.setActiveCamera(this.cameraHandle);
    const transform = resolved.get(activeId)?.world;
    if (transform !== undefined) {
      this.adapter.setCameraTransform(this.cameraHandle, toResolvedWorld(transform));
    }
  }

  private refreshMeshes(resolved: Map<EntityId, ResolvedTransform>): void {
    // BatchingSystem (M17) owns the visual for batched entities — their
    // matrix lives in an InstancedMesh slot, not a per-entity Mesh.
    // Skip both the explicit Batchable path AND the S50 auto-batch path
    // (BatchedMeshHandle set by BatchingSystem on entities it placed in
    // a bucket) so this fallback doesn't double-acquire handles.
    const renderable = new Set<EntityId>();
    for (const id of this.world.query(["MeshRenderer"])) {
      if (this.world.hasComponent(id, "Batchable")) continue;
      if (this.world.hasComponent(id, "BatchedMeshHandle")) continue;
      renderable.add(id);
    }

    // Release entities that left the renderable set. When MeshLifecycleSystem
    // (M21-d) is registered, it already does this and the loop here is a
    // no-op; when no scheduler is in play, the renderer is the lifecycle
    // owner. `registry.release` is idempotent.
    const trackedIds: EntityId[] = [];
    for (const id of this.registry.entityIds()) trackedIds.push(id);
    for (const id of trackedIds) {
      if (renderable.has(id)) continue;
      this.registry.release(id);
      this.appliedMaterials.delete(id);
      this.appliedGeometries.delete(id);
    }

    for (const id of renderable) {
      const meshComponent = this.world.getComponent<MeshRendererComponent>(id, "MeshRenderer");
      if (meshComponent === undefined) {
        continue;
      }

      // `acquireFor` is idempotent — when MeshLifecycleSystem already
      // acquired this entity, it returns the existing handle.
      const handle = this.registry.acquireFor(id, meshComponent.mesh, meshComponent.color);
      if (handle === undefined) continue;

      if (!this.materialBindingExternal) {
        // Color-only updates for entities that don't carry a material manifest
        // ref. With a manifest, color comes from manifest.color via
        // maybeApplyMaterial.
        if (meshComponent.material === undefined && meshComponent.color !== undefined) {
          this.adapter.setMeshMaterialPatch(handle, { color: meshComponent.color });
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
      }

      if (!this.meshTransformSyncExternal) {
        const transform = resolved.get(id)?.world;
        if (transform !== undefined) {
          this.adapter.setMeshTransform(handle, toResolvedWorld(transform));
        }
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
