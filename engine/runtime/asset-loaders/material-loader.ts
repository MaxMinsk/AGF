import type { AssetLoader } from "../asset-registry";

export type MaterialManifest = {
  id: string;
  shader: "standard";
  color: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  alphaMode?: "opaque" | "blend";
};

export function createMaterialLoader(): AssetLoader<MaterialManifest> {
  return {
    name: "material",
    matches(ref) {
      return ref.endsWith(".material.json");
    },
    async load(url) {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load material "${url}": HTTP ${response.status}.`);
      }
      const manifest = (await response.json()) as MaterialManifest;
      return manifest;
    }
  };
}
