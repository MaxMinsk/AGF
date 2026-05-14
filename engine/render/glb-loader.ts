import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Group, WebGLRenderer } from "three";
import type { AssetLoader } from "../runtime/asset-registry";
import {
  getDracoLoader,
  getKtx2Loader,
  getMeshoptDecoder,
  type DecoderOptions
} from "./asset-decoders/decoders";

export type GlbAsset = {
  scene: Group;
};

export type GlbLoaderOptions = DecoderOptions & {
  /**
   * The active WebGLRenderer — required to wire KTX2Loader's GPU-caps
   * detection (`detectSupport`). Optional: when absent, KTX2 transcoding
   * stays off and GLBs that depend on it will fall back to their
   * uncompressed assets or fail at load time.
   */
  renderer?: WebGLRenderer;
  /** Opt in to DRACO geometry decompression. Default off. */
  draco?: boolean;
  /** Opt in to KTX2 texture transcoding. Requires `renderer`. Default off. */
  ktx2?: boolean;
  /** Opt in to Meshopt decompression. Default off. */
  meshopt?: boolean;
};

/**
 * Construct a GLTF/GLB asset loader. Decoders (Draco / KTX2 / Meshopt)
 * are process-wide singletons — see `engine/runtime/asset-loaders/decoders.ts`
 * — so multiple `createGlbLoader` calls share the same Web Worker
 * pools instead of forking new ones per asset registry.
 */
export function createGlbLoader(options: GlbLoaderOptions = {}): AssetLoader<GlbAsset> {
  const loader = new GLTFLoader();
  // M25 / ASSET-compression: decoder hooks default-on. Three.js only
  // engages a decoder when the GLB declares the matching extension
  // (KHR_draco_mesh_compression / EXT_meshopt_compression), so
  // uncompressed assets pay zero cost. Set `draco: false` /
  // `meshopt: false` to skip the singleton init explicitly (e.g. tests
  // that don't want the worker pool to spin up).
  if (options.draco !== false) {
    loader.setDRACOLoader(getDracoLoader(options));
  }
  if (options.meshopt !== false) {
    loader.setMeshoptDecoder(getMeshoptDecoder());
  }
  // KTX2 needs the renderer reference (`detectSupport`); stays opt-in
  // until a project starts shipping `.ktx2` textures.
  if (options.ktx2 === true && options.renderer !== undefined) {
    loader.setKTX2Loader(getKtx2Loader(options.renderer, options));
  }
  return {
    name: "glb",
    matches(ref) {
      return ref.endsWith(".glb") || ref.endsWith(".gltf");
    },
    load(url) {
      return new Promise<GlbAsset>((resolve, reject) => {
        loader.load(
          url,
          (gltf) => resolve({ scene: gltf.scene }),
          undefined,
          (event) => reject(new Error(`GLTFLoader failed to load "${url}": ${String(event)}`))
        );
      });
    }
  };
}
