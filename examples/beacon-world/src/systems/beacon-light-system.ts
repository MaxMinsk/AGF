// BeaconLightSystem — drives the intensity of a point Light tied to a beacon
// by reading the beacon's Repairable.repaired flag. Broken beacon → light goes
// dark; repaired beacon → light blazes at full brightness. Demonstrates the
// agent-first pattern: a project-specific system reading authoring components
// (`BeaconLight` + `Light` + `Repairable`) and writing only the gameplay-facing
// piece (`Light.intensity`). The renderer's M21-light-directional-point
// pipeline picks the change up on the next frame.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

export const BEACON_LIGHT: ComponentName = "BeaconLight";
export const LIGHT: ComponentName = "Light";

type BeaconLightComponent = {
  beaconId: EntityId;
  repairedIntensity?: number;
  brokenIntensity?: number;
};

type RepairableComponent = {
  repaired?: boolean;
};

type LightComponent = Record<string, unknown> & { intensity?: number };

const DEFAULT_REPAIRED = 12;
const DEFAULT_BROKEN = 0;

export function createBeaconLightSystem(options: { name?: string } = {}): System {
  const name = options.name ?? "beacon.light";
  let cachedWorld: World | undefined;
  let beaconLightQuery: QueryHandle | undefined;

  return {
    name,
    frameUpdate(context: SystemContext): void {
      const world = context.world;
      if (world !== cachedWorld) {
        beaconLightQuery = world.createQuery([BEACON_LIGHT, LIGHT]);
        cachedWorld = world;
      }
      for (const id of beaconLightQuery!.run()) {
        const link = world.getComponent<BeaconLightComponent>(id, BEACON_LIGHT);
        const light = world.getComponent<LightComponent>(id, LIGHT);
        if (link === undefined || light === undefined) continue;
        const repairable = world.getComponent<RepairableComponent>(link.beaconId, "Repairable");
        const desired = repairable?.repaired === true
          ? link.repairedIntensity ?? DEFAULT_REPAIRED
          : link.brokenIntensity ?? DEFAULT_BROKEN;
        if (light.intensity === desired) continue;
        world.setComponent(id, LIGHT, { ...light, intensity: desired });
      }
    }
  };
}
