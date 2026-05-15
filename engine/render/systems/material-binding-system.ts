// M21-e: own the async geometry + material asset binding for renderable
// entities. Reads `MeshRenderer` (mesh/material/color fields) and the
// `RenderMeshHandle` (the handle MeshLifecycleSystem wrote); writes
// `AppliedGeometryRef` and `AppliedMaterialRef` renderer-internal
// components. Each tracks { ref, status: "pending" | "applied" | "failed" }
// so an agent debugging "why doesn't this mesh show?" can see the load
// state via `window.__agf.snapshot()` without poking renderer internals.
//
// Cancellation: the .then() callback checks the live AppliedRef.ref against
// the ref it was loading for; if the component was removed or the ref
// changed, the result is dropped. This makes asset HMR a "remove the
// component, system re-fetches next frame" command-pipeline operation.

import type { ComponentName, EntityId } from "../../core/ecs/types";
import type { QueryHandle, World } from "../../core/ecs/world";
import type { System, SystemContext } from "../../core/systems/types";
import type { AssetRegistry } from "../../runtime/asset-registry";
import type { MaterialManifest } from "../../runtime/asset-loaders/material-loader";
import type { Mesh } from "three";

import type { GlbAsset } from "../glb-loader";
import { isExternalMeshRef } from "../mesh-handle-registry";
import type { MeshHandleRegistry } from "../mesh-handle-registry";
import type { ThreeRenderAdapter } from "../three-render-adapter";

export const APPLIED_GEOMETRY_REF: ComponentName = "AppliedGeometryRef";
export const APPLIED_MATERIAL_REF: ComponentName = "AppliedMaterialRef";

export type AppliedRefStatus = "pending" | "applied" | "failed";

export type AppliedRef = {
  ref: string;
  status: AppliedRefStatus;
};

type MeshRendererComponent = {
  mesh: string;
  material?: string;
  color?: string;
};

export type MaterialBindingDeps = {
  adapter: ThreeRenderAdapter;
  registry: MeshHandleRegistry;
  assetRegistry: AssetRegistry | undefined;
};

export type MaterialBindingSystemHandle = System & {
  /** Drop any AppliedRef component whose ref matches — forces re-fetch next frame. */
  forgetAssetBinding(world: World, ref: string): void;
};

export function createMaterialBindingSystem(
  deps: MaterialBindingDeps,
  options: { name?: string } = {}
): MaterialBindingSystemHandle {
  const name = options.name ?? "render.material-binding";
  let cachedWorld: World | undefined;
  let renderableQuery: QueryHandle | undefined;

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      renderableQuery = world.createQuery(["MeshRenderer"]);
      cachedWorld = world;
    }
    const renderable = renderableQuery!.run();
    for (const id of renderable) {
      const handle = deps.registry.handleFor(id);
      if (handle === undefined) continue;
      const mesh = world.getComponent<MeshRendererComponent>(id, "MeshRenderer");
      if (mesh === undefined) continue;

      // Inline color updates land instantly when there's no manifest ref.
      if (mesh.material === undefined && mesh.color !== undefined) {
        deps.adapter.setMeshMaterialPatch(handle, { color: mesh.color });
      }

      reconcileGeometry(world, id, handle, mesh.mesh, deps);
      reconcileMaterial(world, id, handle, mesh.material, deps);
    }
  };

  return {
    name,
    frameUpdate,
    forgetAssetBinding(world: World, ref: string): void {
      // Cold path — fires on HMR / dev-bridge asset invalidate, not per frame.
      // agf-allow: world.query
      for (const id of world.query([APPLIED_GEOMETRY_REF])) {
        const applied = world.getComponent<AppliedRef>(id, APPLIED_GEOMETRY_REF);
        if (applied?.ref === ref) world.removeComponent(id, APPLIED_GEOMETRY_REF);
      }
      // agf-allow: world.query
      for (const id of world.query([APPLIED_MATERIAL_REF])) {
        const applied = world.getComponent<AppliedRef>(id, APPLIED_MATERIAL_REF);
        if (applied?.ref === ref) world.removeComponent(id, APPLIED_MATERIAL_REF);
      }
    }
  };
}

function reconcileGeometry(
  world: World,
  entityId: EntityId,
  handle: number,
  meshRef: string,
  deps: MaterialBindingDeps
): void {
  if (!isExternalMeshRef(meshRef)) {
    if (world.hasComponent(entityId, APPLIED_GEOMETRY_REF)) {
      world.removeComponent(entityId, APPLIED_GEOMETRY_REF);
    }
    return;
  }
  if (deps.assetRegistry === undefined) return;
  const previous = world.getComponent<AppliedRef>(entityId, APPLIED_GEOMETRY_REF);
  if (previous !== undefined && previous.ref === meshRef && previous.status !== "failed") {
    return;
  }
  world.setComponent(entityId, APPLIED_GEOMETRY_REF, { ref: meshRef, status: "pending" });

  deps.assetRegistry.get<GlbAsset>(meshRef).then(
    (asset) => {
      const live = world.getComponent<AppliedRef>(entityId, APPLIED_GEOMETRY_REF);
      if (live?.ref !== meshRef) return;
      if (!deps.adapter.hasMesh(handle)) return;
      const sourceMesh = findFirstMeshOf(asset);
      if (sourceMesh === undefined) {
        console.warn(`[agf] glb "${meshRef}" contains no Mesh; skipping.`);
        world.setComponent(entityId, APPLIED_GEOMETRY_REF, { ref: meshRef, status: "failed" });
        return;
      }
      deps.adapter.setMeshGeometry(handle, sourceMesh.geometry.clone());
      world.setComponent(entityId, APPLIED_GEOMETRY_REF, { ref: meshRef, status: "applied" });
    },
    (error: unknown) => {
      console.error(`[agf] mesh load failed for "${entityId}" → "${meshRef}":`, error);
      const live = world.getComponent<AppliedRef>(entityId, APPLIED_GEOMETRY_REF);
      if (live?.ref === meshRef) {
        world.setComponent(entityId, APPLIED_GEOMETRY_REF, { ref: meshRef, status: "failed" });
      }
    }
  );
}

function reconcileMaterial(
  world: World,
  entityId: EntityId,
  handle: number,
  materialRef: string | undefined,
  deps: MaterialBindingDeps
): void {
  if (materialRef === undefined) {
    if (world.hasComponent(entityId, APPLIED_MATERIAL_REF)) {
      world.removeComponent(entityId, APPLIED_MATERIAL_REF);
    }
    return;
  }
  if (deps.assetRegistry === undefined) return;
  const previous = world.getComponent<AppliedRef>(entityId, APPLIED_MATERIAL_REF);
  if (previous !== undefined && previous.ref === materialRef && previous.status !== "failed") {
    return;
  }
  world.setComponent(entityId, APPLIED_MATERIAL_REF, { ref: materialRef, status: "pending" });

  deps.assetRegistry.get<MaterialManifest>(materialRef).then(
    (manifest) => {
      const live = world.getComponent<AppliedRef>(entityId, APPLIED_MATERIAL_REF);
      if (live?.ref !== materialRef) return;
      if (!deps.adapter.hasMesh(handle)) return;
      const patch: import("../three-render-adapter").MaterialPatch = {
        kind: manifest.shader,
        color: manifest.color
      };
      if (manifest.roughness !== undefined) patch.roughness = manifest.roughness;
      if (manifest.metalness !== undefined) patch.metalness = manifest.metalness;
      if (manifest.emissive !== undefined) patch.emissive = manifest.emissive;
      if (manifest.opacity !== undefined) patch.opacity = manifest.opacity;
      if (manifest.alphaMode === "blend") patch.transparent = true;
      if (manifest.clearcoat !== undefined) patch.clearcoat = manifest.clearcoat;
      if (manifest.clearcoatRoughness !== undefined) patch.clearcoatRoughness = manifest.clearcoatRoughness;
      if (manifest.ior !== undefined) patch.ior = manifest.ior;
      if (manifest.transmission !== undefined) patch.transmission = manifest.transmission;
      if (manifest.thickness !== undefined) patch.thickness = manifest.thickness;
      if (manifest.sheen !== undefined) patch.sheen = manifest.sheen;
      if (manifest.sheenColor !== undefined) patch.sheenColor = manifest.sheenColor;
      if (manifest.iridescence !== undefined) patch.iridescence = manifest.iridescence;
      if (manifest.shininess !== undefined) patch.shininess = manifest.shininess;
      if (manifest.specular !== undefined) patch.specular = manifest.specular;
      // M21-mat-textures: texture refs are project-relative (same shape as
      // the material ref itself, e.g. "runtime/textures/foo.jpg"). Resolve
      // them through the asset registry so they hit the project's
      // assetRoot — three.js TextureLoader would otherwise resolve them
      // against the document URL and miss the project subdirectory.
      const resolveTexture = (ref: string): string =>
        deps.assetRegistry !== undefined ? deps.assetRegistry.urlFor(ref) : ref;
      if (manifest.map !== undefined) patch.map = resolveTexture(manifest.map);
      if (manifest.normalMap !== undefined) patch.normalMap = resolveTexture(manifest.normalMap);
      if (manifest.normalScale !== undefined) patch.normalScale = manifest.normalScale;
      if (manifest.bumpMap !== undefined) patch.bumpMap = resolveTexture(manifest.bumpMap);
      if (manifest.bumpScale !== undefined) patch.bumpScale = manifest.bumpScale;
      if (manifest.roughnessMap !== undefined) patch.roughnessMap = resolveTexture(manifest.roughnessMap);
      if (manifest.metalnessMap !== undefined) patch.metalnessMap = resolveTexture(manifest.metalnessMap);
      if (manifest.emissiveMap !== undefined) patch.emissiveMap = resolveTexture(manifest.emissiveMap);
      if (manifest.emissiveIntensity !== undefined) patch.emissiveIntensity = manifest.emissiveIntensity;
      if (manifest.aoMap !== undefined) patch.aoMap = resolveTexture(manifest.aoMap);
      // M21-mat-custom + M21-mat-shader-files: when an external shader
      // ref is set, fetch the text + use it instead of the inline
      // string. Refs run in parallel so the patch lands as soon as
      // both files resolve.
      if (manifest.vertexShader !== undefined) patch.vertexShader = manifest.vertexShader;
      if (manifest.fragmentShader !== undefined) patch.fragmentShader = manifest.fragmentShader;
      if (manifest.uniforms !== undefined) patch.uniforms = manifest.uniforms;
      if (manifest.defines !== undefined) patch.defines = manifest.defines;
      const refsToLoad: Promise<void>[] = [];
      if (manifest.vertexShaderRef !== undefined) {
        const ref = manifest.vertexShaderRef;
        refsToLoad.push(
          fetchShaderSource(ref).then(
            (source) => {
              patch.vertexShader = source;
            },
            (error) => {
              console.error(`[agf] vertexShaderRef load failed for "${entityId}" → "${ref}":`, error);
            }
          )
        );
      }
      if (manifest.fragmentShaderRef !== undefined) {
        const ref = manifest.fragmentShaderRef;
        refsToLoad.push(
          fetchShaderSource(ref).then(
            (source) => {
              patch.fragmentShader = source;
            },
            (error) => {
              console.error(`[agf] fragmentShaderRef load failed for "${entityId}" → "${ref}":`, error);
            }
          )
        );
      }
      if (refsToLoad.length > 0) {
        Promise.all(refsToLoad).then(() => {
          const stillLive = world.getComponent<AppliedRef>(entityId, APPLIED_MATERIAL_REF);
          if (stillLive?.ref !== materialRef) return;
          if (!deps.adapter.hasMesh(handle)) return;
          deps.adapter.setMeshMaterialPatch(handle, patch);
          world.setComponent(entityId, APPLIED_MATERIAL_REF, { ref: materialRef, status: "applied" });
        });
        return;
      }
      deps.adapter.setMeshMaterialPatch(handle, patch);
      world.setComponent(entityId, APPLIED_MATERIAL_REF, { ref: materialRef, status: "applied" });
    },
    (error: unknown) => {
      console.error(`[agf] material load failed for "${entityId}" → "${materialRef}":`, error);
      const live = world.getComponent<AppliedRef>(entityId, APPLIED_MATERIAL_REF);
      if (live?.ref === materialRef) {
        world.setComponent(entityId, APPLIED_MATERIAL_REF, { ref: materialRef, status: "failed" });
      }
    }
  );
}

// M21-mat-shader-files: minimal text fetch via the browser. Cached per
// URL so a shader shared across N manifests only round-trips once.
const shaderSourceCache = new Map<string, Promise<string>>();
async function fetchShaderSource(ref: string): Promise<string> {
  const cached = shaderSourceCache.get(ref);
  if (cached !== undefined) return cached;
  const promise = fetch(ref).then((response) => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${ref}`);
    }
    return response.text();
  });
  shaderSourceCache.set(ref, promise);
  // Drop the cache entry on failure so a retry can try again.
  promise.catch(() => {
    shaderSourceCache.delete(ref);
  });
  return promise;
}

function findFirstMeshOf(asset: GlbAsset): Mesh | undefined {
  let found: Mesh | undefined;
  asset.scene.traverse((object) => {
    if (found === undefined && (object as Mesh).isMesh === true) {
      found = object as Mesh;
    }
  });
  return found;
}
