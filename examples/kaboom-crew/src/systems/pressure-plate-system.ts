// S151 KABOOM-PRESSURE-PLATE — third arena hazard module after the
// S146 Conveyor Belt and S149 Warp Hole.
//
// A pressure plate is a single grid cell tagged with a PressurePlate
// component. When any alive bomber or active bomb stands on the cell,
// the configured triggerAction fires (with per-plate cooldown). v1
// ships the 'spawn-bomb' action only — the other two GDP §3 actions
// ('open-gate', 'arena-event') are deferred to follow-up sprints to
// keep this sprint focused on the trigger+cooldown pattern.
//
// Plate cells don't block movement. They survive blasts. Multiple
// plates triggered in the same tick fire independently in plateId
// order (deterministic).

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import type { GridOccupancyQuery } from "../../../../engine/core/systems/grid-occupancy-system";

const PRESSURE_PLATE: ComponentName = "PressurePlate";
const GRID_POSITION: ComponentName = "GridPosition";
const TRANSFORM: ComponentName = "Transform";
const MESH_RENDERER: ComponentName = "MeshRenderer";
const GRID_OCCUPANT: ComponentName = "GridOccupant";
const BOMB: ComponentName = "Bomb";
const BOMBER_STATS: ComponentName = "BomberStats";
const RIGID_BODY_3D: ComponentName = "RigidBody3D";
const COLLIDER_3D: ComponentName = "Collider3D";

const DEFAULT_COOLDOWN_MS = 1000;
const DEFAULT_PLATE_BOMB_RANGE = 2;
const DEFAULT_PLATE_BOMB_FUSE_S = 2.0;

type TriggerAction = "spawn-bomb";

type PressurePlateComponent = {
  plateId: number;
  triggerAction: TriggerAction;
  cooldownMs?: number;
  actionPayload?: {
    spawnGx?: number;
    spawnGz?: number;
    range?: number;
    fuseS?: number;
  };
  lastTriggerAt?: number;
};

type GridPos = { gx: number; gz: number };

export function createKaboomPressurePlateSystem(options: {
  occupancy: GridOccupancyQuery;
  name?: string;
  /** Optional id generator for tests; defaults to `plate-bomb.<plateId>.<counter>`. */
  nextBombId?: (plateId: number) => EntityId;
}): System {
  const name = options.name ?? "kaboom.pressure-plate";
  const occupancy = options.occupancy;
  let cachedWorld: World | undefined;
  let plates: QueryHandle | undefined;
  let simTime = 0;
  let bombCounter = 0;
  const nextBombId = options.nextBombId ?? ((plateId: number): EntityId => {
    bombCounter += 1;
    return `plate-bomb.${plateId}.${bombCounter}`;
  });

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      plates = world.createQuery([PRESSURE_PLATE, GRID_POSITION]);
      cachedWorld = world;
      simTime = 0;
      bombCounter = 0;
    }
    simTime += Math.max(0, context.time.fixedDt);

    const plateIds = [...plates!.run()];
    // Sort by plateId so simultaneous triggers fire in a deterministic
    // order. Stable across runs + small N (typically <8).
    const platesSorted = plateIds
      .map((id) => ({ id, comp: world.getComponent<PressurePlateComponent>(id, PRESSURE_PLATE) }))
      .filter((p): p is { id: EntityId; comp: PressurePlateComponent } => p.comp !== undefined)
      .sort((a, b) => a.comp.plateId - b.comp.plateId);

    for (const { id: plateId, comp: plate } of platesSorted) {
      const pos = world.getComponent<GridPos>(plateId, GRID_POSITION);
      if (pos === undefined) continue;
      // Plate is "occupied" when any ALIVE bomber or active (non-zero
      // fuse) bomb sits on it. Dead bombers and mid-detonation bombs
      // don't count — same rule the warp-hole-system uses.
      let occupied = false;
      for (const occupantId of occupancy.occupants(pos.gx, pos.gz)) {
        if (world.hasComponent(occupantId, BOMBER_STATS)) {
          const stats = world.getComponent<{ alive?: boolean }>(occupantId, BOMBER_STATS);
          if (stats?.alive !== false) { occupied = true; break; }
        } else if (world.hasComponent(occupantId, BOMB)) {
          const bomb = world.getComponent<{ fuseRemaining?: number }>(occupantId, BOMB);
          if ((bomb?.fuseRemaining ?? 0) > 0) { occupied = true; break; }
        }
      }
      if (!occupied) continue;

      const cooldownS = Math.max(0.5, (plate.cooldownMs ?? DEFAULT_COOLDOWN_MS) / 1000);
      const last = plate.lastTriggerAt ?? -Infinity;
      if (simTime - last < cooldownS) continue;

      // Fire the action.
      switch (plate.triggerAction) {
        case "spawn-bomb":
          spawnBomb(world, plateId, plate, nextBombId);
          break;
      }
      world.setComponent(plateId, PRESSURE_PLATE, { ...plate, lastTriggerAt: simTime });
    }
  };

  return { name, fixedUpdate };
}

function spawnBomb(
  world: World,
  plateId: EntityId,
  plate: PressurePlateComponent,
  nextBombId: (plateId: number) => EntityId
): void {
  const gx = plate.actionPayload?.spawnGx;
  const gz = plate.actionPayload?.spawnGz;
  if (gx === undefined || gz === undefined) return;
  const range = plate.actionPayload?.range ?? DEFAULT_PLATE_BOMB_RANGE;
  const fuseS = plate.actionPayload?.fuseS ?? DEFAULT_PLATE_BOMB_FUSE_S;
  const bombId = nextBombId(plate.plateId);
  if (world.hasEntity(bombId)) return;
  world.addEntity(bombId);
  world.setComponent(bombId, TRANSFORM, {
    position: [gx, 0.35, gz],
    rotation: [0, 0, 0],
    scale: [0.35, 0.35, 0.35]
  });
  world.setComponent(bombId, MESH_RENDERER, { mesh: "sphere", color: "#1a1a1a" });
  world.setComponent(bombId, GRID_POSITION, { gx, gz });
  world.setComponent(bombId, GRID_OCCUPANT, { layer: "bomb", blocksMovement: false, blocksBlast: false });
  world.setComponent(bombId, RIGID_BODY_3D, { type: "fixed" });
  world.setComponent(bombId, COLLIDER_3D, { kind: "sphere", radius: 0.175 });
  // ownerId is the plate's own entity id — plate-spawned bombs are
  // unowned w.r.t. any bomber's activeBombs counter. Blast still
  // attributes a "kill" to the plate id, but downstream death
  // accounting tolerates plate-owned bombs (no entry in BomberStats).
  world.setComponent(bombId, BOMB, {
    fuseRemaining: fuseS,
    range,
    ownerId: plateId
  });
}
