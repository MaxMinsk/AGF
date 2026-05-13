import type { ComponentData, ComponentName, EntityId } from "../core/ecs/types";
import type { World } from "../core/ecs/world";
import type { TimeContext } from "../core/loop/types";

export type SnapshotEntity = {
  id: EntityId;
  components: Record<ComponentName, ComponentData>;
};

export type WorldSnapshot = {
  entityCount: number;
  entities: SnapshotEntity[];
  time: TimeContext;
};

export function snapshotWorld(world: World, time: Readonly<TimeContext>): WorldSnapshot {
  const componentNames = world.componentNames();
  const entityIds = world.entityIds().sort();
  const entities: SnapshotEntity[] = entityIds.map((id) => {
    const components: Record<ComponentName, ComponentData> = {};
    for (const name of componentNames) {
      if (world.hasComponent(id, name)) {
        components[name] = world.getComponent(id, name);
      }
    }
    return { id, components };
  });

  return {
    entityCount: entities.length,
    entities,
    time: { ...time }
  };
}
