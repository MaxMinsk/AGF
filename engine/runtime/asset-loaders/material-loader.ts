import type { AssetLoader } from "../asset-registry";

/** M21-mat-physical + M21-mat-custom: extend the manifest beyond MeshStandardMaterial. */
export type MaterialShader =
  | "standard"
  | "physical"
  | "lambert"
  | "phong"
  | "basic"
  | "custom";

export type MaterialUniformValue = number | string | ReadonlyArray<number>;

export type MaterialManifest = {
  id: string;
  shader: MaterialShader;
  color: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  alphaMode?: "opaque" | "blend";
  opacity?: number;
  /** MeshPhysicalMaterial fields. */
  clearcoat?: number;
  clearcoatRoughness?: number;
  ior?: number;
  transmission?: number;
  thickness?: number;
  sheen?: number;
  sheenColor?: string;
  iridescence?: number;
  /** MeshPhongMaterial fields. */
  shininess?: number;
  specular?: string;
  /** M21-mat-textures: texture map URLs. */
  map?: string;
  normalMap?: string;
  normalScale?: number;
  roughnessMap?: string;
  metalnessMap?: string;
  emissiveMap?: string;
  emissiveIntensity?: number;
  aoMap?: string;
  /** M21-mat-custom: ShaderMaterial source + uniforms (only used when shader === "custom"). */
  vertexShader?: string;
  fragmentShader?: string;
  /** M21-mat-shader-files: external `.vert` / `.glsl` paths under the project's assets root. */
  vertexShaderRef?: string;
  fragmentShaderRef?: string;
  uniforms?: Record<string, MaterialUniformValue>;
  defines?: Record<string, string>;
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
