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
      /** S57 GROUND-skybox: vendored `GroundedSkybox` helper. When set, the renderer mounts a curved-bottom sky mesh at the given height + radius so the HDR meets a virtual ground instead of dropping straight to the horizon. */
      groundedSkybox?: { height: number; radius: number };
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
      /** S57 GROUND-skybox: same as the HDR path. */
      groundedSkybox?: { height: number; radius: number };
    };

export type SceneInstanceInput = {
  /** Entity id after expansion; must be unique in the scene. */
  id: string;
  /** Project-local prefab id (kebab-case). */
  prefab: string;
  /** Shallow per-component override map merged on top of the prefab. */
  overrides?: Record<string, unknown>;
};

export type SceneInput = {
  id: string;
  entities: ReadonlyArray<SceneEntityInput>;
  /** Optional image-based-lighting environment for PBR materials. Default = `{ kind: "generated" }` applied at runtime if absent. */
  environment?: SceneEnvironmentInput;
  /** Optional prefab instances. `expandScenePrefabs` flattens them into regular entities at scene-load time. */
  instances?: ReadonlyArray<SceneInstanceInput>;
  /**
   * S173 GDP-2026-05-28-010 — optional scene-level shortcut for
   * variable cell height. Outer index is gz, inner is gx; entries are
   * integer cell heights (0..4). At scene-load the project bootstrap
   * promotes this into a Heightmap component on the Grid singleton so
   * gameplay systems can query heights via `engine/grid/height-query`.
   */
  heightmap?: ReadonlyArray<ReadonlyArray<number>>;
  /**
   * S176 GDP-2026-05-28-012 — optional scene-level shortcut for the
   * floor-terrain family per cell. Outer index is gz, inner is gx;
   * entries are project-defined family-name strings (e.g. 'floor',
   * 'grass'). Engine treats this as an opaque ReadonlyArray of
   * ReadonlyArray of strings — the meaning of the entries is a
   * project-level concern. The Kaboom Crew bootstrap reads this field
   * and spawns per-cell overlay entities for non-default cells. Scenes
   * without a `terrainmap` render with the project's single stretched-
   * box floor backdrop and pay zero per-cell overhead.
   */
  terrainmap?: ReadonlyArray<ReadonlyArray<string>>;
};
