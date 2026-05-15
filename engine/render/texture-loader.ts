// S57 ASSET-textures-via-registry: texture refs inside material manifests
// resolve through the same AssetRegistry pipeline the manifest itself uses.
// 404s now emit `AGF_RUNTIME_ASSET_LOAD_FAILED` (the registry's general
// error path) instead of failing silently inside Three.js's TextureLoader.
// HMR's `__agf.reloadAsset(ref)` invalidates one texture cache entry
// without remounting the whole material.

import { TextureLoader, SRGBColorSpace, type Texture } from "three";
import type { AssetLoader } from "../runtime/asset-registry";

const TEXTURE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"];

/**
 * Heuristic: base-colour / emissive maps want sRGB, normal / roughness /
 * metalness / AO / bump maps want linear. The runtime guesses from the
 * filename suffix and the material manifest field is the final authority
 * (the adapter re-tags when binding). Default to linear so a missed
 * heuristic produces wrong-but-not-blown-out colours rather than the
 * other way round.
 */
function isLikelyColorTexture(ref: string): boolean {
  const lower = ref.toLowerCase();
  return (
    lower.includes("diffuse") ||
    lower.includes("albedo") ||
    lower.includes("basecolor") ||
    lower.includes("color") ||
    lower.includes("emissive")
  );
}

export function createTextureLoader(): AssetLoader<Texture> {
  // One TextureLoader per registry instance. Three.js caches the underlying
  // Image fetch via its own `Cache.enabled` machinery — we don't add a
  // second cache layer here; AssetRegistry already dedupes the Promise.
  const loader = new TextureLoader();
  return {
    name: "texture",
    matches(ref) {
      const lower = ref.toLowerCase();
      return TEXTURE_EXTENSIONS.some((ext) => lower.endsWith(ext));
    },
    load(url): Promise<Texture> {
      return new Promise((resolve, reject) => {
        loader.load(
          url,
          (texture) => {
            // Heuristic colorSpace tag — see comment above. The material
            // binding step may overwrite this when the manifest field's
            // role is unambiguous (map → sRGB; normalMap / bumpMap /
            // roughnessMap / metalnessMap / aoMap → linear).
            if (isLikelyColorTexture(url)) {
              texture.colorSpace = SRGBColorSpace;
            }
            resolve(texture);
          },
          undefined,
          (event) => {
            const message =
              event instanceof ErrorEvent
                ? event.message
                : `texture load failed: ${url}`;
            reject(new Error(message));
          }
        );
      });
    }
  };
}
