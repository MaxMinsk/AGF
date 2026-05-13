import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Group } from "three";
import type { AssetLoader } from "../runtime/asset-registry";

export type GlbAsset = {
  scene: Group;
};

export function createGlbLoader(): AssetLoader<GlbAsset> {
  const loader = new GLTFLoader();
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
