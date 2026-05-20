// S82 KABOOM-BOMB-PLACE. Consumes `PlaceBombRequest` transients written
// by the player input + bot AI systems and spawns a bomb entity on the
// requester's grid cell. Enforces BomberStats.maxBombs cap + refuses to
// stack two bombs on the same cell. Removes the transient at the end
// of the frame (always — even on a refused request — so the player
// doesn't keep retrying every frame while the cap is full).

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import type { GridOccupancyQuery } from "../../../../engine/core/systems/grid-occupancy-system";

const BOMBER_STATS: ComponentName = "BomberStats";
const GRID_POSITION: ComponentName = "GridPosition";
const PLACE_BOMB_REQUEST: ComponentName = "PlaceBombRequest";
const BOMB: ComponentName = "Bomb";
const TRANSFORM: ComponentName = "Transform";
const MESH_RENDERER: ComponentName = "MeshRenderer";
const GRID_OCCUPANT: ComponentName = "GridOccupant";
const TWEENS: ComponentName = "Tweens";

// S095 KABOOM-SPAWN-POP-TWEEN — bombs grow from a single point to full
// size with a small overshoot on spawn. Drives the engine Tween system
// via the `Tweens` component; the system removes itself on completion.
const SPAWN_POP_DURATION_S = 0.2;
const BOMB_FINAL_SCALE: ReadonlyArray<number> = [0.35, 0.35, 0.35];

type BomberStats = {
  maxBombs: number;
  range: number;
  activeBombs?: number;
  alive?: boolean;
};
type GridPos = { gx: number; gz: number };

const DEFAULT_FUSE_SECONDS = 2.5;

export type BombPlacementSystemOptions = {
  occupancy: GridOccupancyQuery;
  /** Override the default fuse for tests. */
  fuseSeconds?: number;
  name?: string;
  /**
   * Optional id factory — tests inject a deterministic counter to keep
   * assertions readable. Defaults to `"bomb.<owner>.<n>"` using an
   * internal counter.
   */
  nextBombId?: (owner: EntityId) => EntityId;
};

export function createKaboomBombPlacementSystem(
  options: BombPlacementSystemOptions
): System {
  const name = options.name ?? "kaboom.bomb-placement";
  const fuseSeconds = options.fuseSeconds ?? DEFAULT_FUSE_SECONDS;
  let counter = 0;
  const defaultNextId = (owner: EntityId): EntityId => {
    counter += 1;
    return `bomb.${owner}.${counter}`;
  };
  const nextBombId = options.nextBombId ?? defaultNextId;

  let cachedWorld: World | undefined;
  let requests: QueryHandle | undefined;

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      requests = world.createQuery([PLACE_BOMB_REQUEST, BOMBER_STATS, GRID_POSITION]);
      cachedWorld = world;
    }
    // S84 KABOOM-TITLE-SCREEN — drop any in-flight place requests while
    // the title screen is up so a stray bot decision doesn't spawn a
    // bomb before the player has even started.
    if (world.hasComponent("kaboom.game-state", "GamePaused")) {
      for (const entityId of requests!.run()) {
        world.removeComponent(entityId, PLACE_BOMB_REQUEST);
      }
      return;
    }
    for (const entityId of requests!.run()) {
      const stats = world.getComponent<BomberStats>(entityId, BOMBER_STATS);
      const pos = world.getComponent<GridPos>(entityId, GRID_POSITION);
      // Always clear the request — refused or honoured. Without this a
      // held-down bomb key would re-fire every frame once stats free up.
      world.removeComponent(entityId, PLACE_BOMB_REQUEST);
      if (stats === undefined || pos === undefined) continue;
      if (stats.alive === false) continue;
      const active = stats.activeBombs ?? 0;
      if (active >= stats.maxBombs) continue;
      if (options.occupancy.occupants(pos.gx, pos.gz, "bomb").length > 0) continue;

      // Spawn the bomb directly into the world. We don't go through a
      // command queue here — the bomb pipeline runs inside the engine
      // frame, not against an external authority.
      const bombId = nextBombId(entityId);
      if (world.hasEntity(bombId)) continue;
      world.addEntity(bombId);
      world.setComponent(bombId, TRANSFORM, {
        position: [pos.gx, 0.35, pos.gz],
        rotation: [0, 0, 0],
        scale: [0, 0, 0]
      });
      // S095 KABOOM-SPAWN-POP-TWEEN — drive scale 0 → final with
      // easeOutBack so the bomb visibly pops into existence.
      world.setComponent(bombId, TWEENS, [
        {
          component: TRANSFORM,
          property: "scale",
          from: [0, 0, 0],
          to: BOMB_FINAL_SCALE,
          duration: SPAWN_POP_DURATION_S,
          ease: "easeOutBack"
        }
      ]);
      world.setComponent(bombId, MESH_RENDERER, { mesh: "sphere", color: "#1a1a1a" });
      world.setComponent(bombId, GRID_POSITION, { gx: pos.gx, gz: pos.gz });
      world.setComponent(bombId, GRID_OCCUPANT, { layer: "bomb", blocksMovement: false, blocksBlast: false });
      world.setComponent(bombId, BOMB, {
        fuseRemaining: fuseSeconds,
        range: stats.range,
        ownerId: entityId
      });

      world.setComponent(entityId, BOMBER_STATS, { ...stats, activeBombs: active + 1 });
    }
  };

  return { name, frameUpdate };
}
