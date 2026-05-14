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

export type SnapshotOptions = {
  /**
   * Include renderer-internal components (`LocalToWorld`, `RenderMeshHandle`,
   * `AppliedGeometryRef`, `AppliedMaterialRef`, `ActiveCamera`) in the
   * output. Defaults to false so agent inspection matches scene authoring
   * shape. Set to true for renderer-pipeline debugging.
   */
  includeRenderInternals?: boolean;
};

/**
 * Component names that exist purely to wire the renderer Systems (M21-b..f)
 * together. They are derived from authoring components (`Transform`,
 * `MeshRenderer`, `Camera`) and excluded from the default snapshot view so
 * agents don't see them as authorable surfaces.
 */
export const RENDER_INTERNAL_COMPONENTS: ReadonlySet<ComponentName> = new Set([
  "LocalToWorld",
  "RenderMeshHandle",
  "AppliedGeometryRef",
  "AppliedMaterialRef",
  "ActiveCamera",
  // M17-bucketer: derived bucket handle, not authored.
  "BatchedMeshHandle",
  "RenderLightHandle",
  // M24-sensors: runtime-only collision state populated by PhysicsSyncSystem.
  "CurrentContacts3D",
  "OverlappingTriggers3D"
]);

export function snapshotWorld(
  world: World,
  time: Readonly<TimeContext>,
  options: SnapshotOptions = {}
): WorldSnapshot {
  const includeInternals = options.includeRenderInternals === true;
  const componentNames = world.componentNames().filter((name) =>
    includeInternals || !RENDER_INTERNAL_COMPONENTS.has(name)
  );
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
