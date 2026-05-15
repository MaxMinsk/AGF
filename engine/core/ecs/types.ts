export type EntityId = string;

export type ComponentName = string;

export type ComponentData = unknown;

export type SceneEntityInput = {
  id: EntityId;
  components: Readonly<Record<ComponentName, ComponentData>>;
};

export type SceneEnvironmentInput =
  | { kind: "generated" }
  | { kind: "none" }
  | {
      /** M21-env-hdr: equirectangular HDR file pre-filtered through PMREMGenerator. */
      kind: "hdr";
      /** Path under the project's assets root, e.g. `runtime/sky/forest_2k.hdr`. */
      url: string;
      /** Optional multiplier on `scene.environmentIntensity`. Defaults to 1. */
      intensity?: number;
      /** When true, also assign the HDR as the scene's background sky. Defaults to false. */
      asBackground?: boolean;
      /** Optional sky blurriness in [0, 1] when `asBackground` is true. Defaults to 0 (sharp). */
      backgroundBlurriness?: number;
    }
  | {
      /**
       * M21-env-cube: 6-face cubemap pre-filtered through PMREMGenerator.
       * Six URLs in the order documented by three.js's CubeTextureLoader:
       * [+x, -x, +y, -y, +z, -z].
       */
      kind: "cube";
      faces: readonly [string, string, string, string, string, string];
      /** Optional multiplier on `scene.environmentIntensity`. Defaults to 1. */
      intensity?: number;
      /** When true, also assign the cube map as the scene's background sky. Defaults to false. */
      asBackground?: boolean;
      /** Optional sky blurriness in [0, 1] when `asBackground` is true. Defaults to 0 (sharp). */
      backgroundBlurriness?: number;
    };

export type SceneInput = {
  id: string;
  entities: ReadonlyArray<SceneEntityInput>;
  /** Optional image-based-lighting environment for PBR materials. Default = `{ kind: "generated" }` applied at runtime if absent. */
  environment?: SceneEnvironmentInput;
};
