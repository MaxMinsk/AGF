// S109 KABOOM-MULTIPLAYER-FOUNDATION.
//
// Spawns + tears down a procbomber tree for every server-owned remote
// player. Modelled on beacon-world's remote-presence-decorator-system,
// but spawns the Kaboom-Crew bomber tree (19 entities: 1 root + 9
// pivots + 10 mesh parts + accessories) instead of a single drone
// mesh.
//
// Trigger: the WsNetworkAdapter applies world.snapshot as
// entity.create commands. The decorator queries entities that have the
// `Presence` component AND whose Presence.playerId !== localPlayerId,
// and spawns the bomber tree under each one. When the server drops a
// player (snapshot omits the entity → adapter emits entity.delete),
// the entity disappears from the query and we tear down its tree.
//
// Recipe: the spike chose Option A — seed-derived from the player id.
// `resolveRecipeFromSeed("remote." + playerId)` keeps the remote
// bomber visually stable across snapshots and distinct from the local
// player. No protocol-schema changes.

import { applyCommand } from "../../../../engine/core/commands/command-queue";
import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import { resolveRecipeFromSeed } from "../../../procbomber-bench/src/character-recipe";
import { spawnBomberFor } from "../procbomber-integration";

const PRESENCE: ComponentName = "Presence";
const TRANSFORM: ComponentName = "Transform";
const REMOTE_BOMBER_OWNED: ComponentName = "RemoteBomberOwned";

type Presence = { playerId: string };

export type KaboomRemoteBomberDecoratorOptions = {
  /** The local player id; used to skip "decorating" the local bomber. */
  localPlayerId: string;
  name?: string;
};

/**
 * Each spawned tree records the set of entity ids it created so we can
 * delete them on player-leave. The root entity itself (`player.<id>`)
 * is owned by the server snapshot path — we DON'T delete that.
 */
type SpawnedTree = {
  rootId: EntityId;
  childIds: ReadonlyArray<EntityId>;
};

export function createKaboomRemoteBomberDecoratorSystem(
  options: KaboomRemoteBomberDecoratorOptions
): System {
  const name = options.name ?? "kaboom.remote-bomber-decorator";
  const localPlayerId = options.localPlayerId;
  let cachedWorld: World | undefined;
  let query: QueryHandle | undefined;
  // Per-world spawned trees keyed by root entity id.
  const spawned = new Map<EntityId, SpawnedTree>();

  function clearAll(world: World): void {
    for (const tree of spawned.values()) {
      for (const childId of tree.childIds) {
        if (world.hasEntity(childId)) world.removeEntity(childId);
      }
    }
    spawned.clear();
  }

  return {
    name,
    fixedUpdate(context: SystemContext): void {
      const world = context.world;
      if (world !== cachedWorld) {
        // The world changed (test seam OR scene.load wiped everything).
        // Drop our spawn record; the next pass re-spawns from the new
        // snapshot stream.
        if (cachedWorld !== undefined) spawned.clear();
        query = world.createQuery([PRESENCE, TRANSFORM]);
        cachedWorld = world;
      }

      const currentRoots = new Set<EntityId>();
      for (const rootId of query!.run()) {
        const presence = world.getComponent<Presence>(rootId, PRESENCE);
        if (presence === undefined) continue;
        if (presence.playerId === localPlayerId) continue;
        currentRoots.add(rootId);
        if (spawned.has(rootId)) continue;

        // First time we see this remote player — spawn the bomber tree.
        const recipe = resolveRecipeFromSeed(`remote.${presence.playerId}`);
        const collected: EntityId[] = [];
        spawnBomberFor(
          (cmds) => {
            for (const cmd of cmds) {
              if (cmd.kind === "entity.create" && cmd.entityId !== rootId) {
                collected.push(cmd.entityId);
              }
              applyCommand(world, cmd);
            }
          },
          rootId,
          recipe
        );
        // S109 — mark the root so other systems (interpolator,
        // animation driver) can opt into / out of remote bombers via a
        // dedicated component. Today it's a flag only; tomorrow it can
        // carry derived recipe data if we sync Option B.
        world.setComponent(rootId, REMOTE_BOMBER_OWNED, { playerId: presence.playerId });
        spawned.set(rootId, { rootId, childIds: collected });
      }

      // Sweep: any spawned root that's no longer in the snapshot →
      // tear down the tree.
      for (const [rootId, tree] of [...spawned.entries()]) {
        if (currentRoots.has(rootId)) continue;
        for (const childId of tree.childIds) {
          if (world.hasEntity(childId)) world.removeEntity(childId);
        }
        spawned.delete(rootId);
      }
    },
    dispose(): void {
      if (cachedWorld !== undefined) clearAll(cachedWorld);
    }
  } as System & { dispose(): void };
}
