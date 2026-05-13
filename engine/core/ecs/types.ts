export type EntityId = string;

export type ComponentName = string;

export type ComponentData = unknown;

export type SceneEntityInput = {
  id: EntityId;
  components: Readonly<Record<ComponentName, ComponentData>>;
};

export type SceneInput = {
  id: string;
  entities: ReadonlyArray<SceneEntityInput>;
};
