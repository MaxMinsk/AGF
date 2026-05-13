import type {
  ComponentData,
  ComponentName,
  EntityId,
  SceneInput
} from "../ecs/types";

export type EntityCreateCommand = {
  kind: "entity.create";
  entityId: EntityId;
  components?: Readonly<Record<ComponentName, ComponentData>>;
};

export type EntityDeleteCommand = {
  kind: "entity.delete";
  entityId: EntityId;
};

export type ComponentSetCommand = {
  kind: "component.set";
  entityId: EntityId;
  component: ComponentName;
  data: ComponentData;
};

export type ComponentRemoveCommand = {
  kind: "component.remove";
  entityId: EntityId;
  component: ComponentName;
};

export type SceneLoadCommand = {
  kind: "scene.load";
  scene: SceneInput;
};

export type EngineCommand =
  | EntityCreateCommand
  | EntityDeleteCommand
  | ComponentSetCommand
  | ComponentRemoveCommand
  | SceneLoadCommand;

export type CommandLogEntry = {
  index: number;
  command: EngineCommand;
};
