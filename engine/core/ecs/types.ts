export type EntityId = string;

export type ComponentName = string;

export type ComponentData = unknown;

export type SceneEntityInput = {
  id: EntityId;
  components: Readonly<Record<ComponentName, ComponentData>>;
};

export type SceneEnvironmentInput = {
  /** "generated" (M21-env-generated, default) or "none". Future kinds: "hdr", "cube". */
  kind: "generated" | "none";
};

export type SceneInput = {
  id: string;
  entities: ReadonlyArray<SceneEntityInput>;
  /** Optional image-based-lighting environment for PBR materials. Default = `{ kind: "generated" }` applied at runtime if absent. */
  environment?: SceneEnvironmentInput;
};
