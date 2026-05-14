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
    };

export type SceneInput = {
  id: string;
  entities: ReadonlyArray<SceneEntityInput>;
  /** Optional image-based-lighting environment for PBR materials. Default = `{ kind: "generated" }` applied at runtime if absent. */
  environment?: SceneEnvironmentInput;
};
