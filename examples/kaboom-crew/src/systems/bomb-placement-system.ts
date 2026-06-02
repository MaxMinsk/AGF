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
import { getCellHeight } from "../../../../engine/grid/height-query";
import { spawnPuff } from "./spawn-puff";
import { bomberPuffColor } from "./bomber-palette";

const BOMBER_STATS: ComponentName = "BomberStats";
const GRID_POSITION: ComponentName = "GridPosition";
const PLACE_BOMB_REQUEST: ComponentName = "PlaceBombRequest";
const BOMB: ComponentName = "Bomb";
const TRANSFORM: ComponentName = "Transform";
const MESH_RENDERER: ComponentName = "MeshRenderer";
const GRID_OCCUPANT: ComponentName = "GridOccupant";
const TWEENS: ComponentName = "Tweens";
const RIGID_BODY_3D: ComponentName = "RigidBody3D";
const COLLIDER_3D: ComponentName = "Collider3D";

// S095 KABOOM-SPAWN-POP-TWEEN — bombs grow from a single point to full
// size with a small overshoot on spawn. Drives the engine Tween system
// via the `Tweens` component; the system removes itself on completion.
const SPAWN_POP_DURATION_S = 0.2;
// S99 KABOOM-BOMB-FUSE-WIGGLE-BASESCALE-FIX — exported so the
// fuse-system can multiply the wiggle ratio by the same baseline,
// not overwrite Transform.scale with the ratio itself.
export const BOMB_FINAL_SCALE: ReadonlyArray<number> = [0.35, 0.35, 0.35];

type BomberStats = {
  maxBombs: number;
  range: number;
  activeBombs?: number;
  alive?: boolean;
  // S100 KABOOM-REMOTE-DETONATE-PUP — when > 0, the next bomb this
  // bomber places is spawned with fuseRemaining=Infinity (paused) and
  // this counter decrements. Player triggers all paused bombs via
  // RemoteDetonateRequest.
  remoteDetonateCharges?: number;
  // S142 KABOOM-PIERCE-BOMB — when true, the NEXT placed bomb's blast
  // walks through the first soft block in each direction. Carried at
  // placement time → Bomb.pierce, so the owner can lose pierce later
  // without stripping the in-flight bomb. Stays sticky on the bomber
  // until a future Pierce-consume mechanic resets it (currently never).
  pierce?: boolean;
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
      // S173 GDP-2026-05-28-010 — bomb sits on top of its cell when the
      // arena has a heightmap; on flat arenas (no heightmap) the lookup
      // returns 0 and the Y stays at the authored 0.35.
      const cellHeight = getCellHeight(world, pos.gx, pos.gz);
      world.setComponent(bombId, TRANSFORM, {
        position: [pos.gx, 0.35 + cellHeight, pos.gz],
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
      // S138 KABOOM-BOMB-COLLIDER — static Rapier body so ragdoll
      // limbs bounce off live bombs instead of clipping through. The
      // 0.175 radius matches the bomb's final visual (sphere geometry
      // r=0.5 × BOMB_FINAL_SCALE 0.35). The radius stays at 0.175 even
      // during the spawn-pop tween — nothing collides with a bomb in
      // its first 0.2 s on the floor so the size mismatch is invisible.
      world.setComponent(bombId, RIGID_BODY_3D, { type: "fixed" });
      world.setComponent(bombId, COLLIDER_3D, { kind: "sphere", radius: 0.175 });
      // S100 KABOOM-REMOTE-DETONATE-PUP — if the bomber has charges,
      // consume one + spawn the bomb paused (fuseRemaining=Infinity).
      // Player triggers all paused bombs via RemoteDetonateRequest;
      // bomb-fuse-system reads that + drops fuseRemaining to 0.
      const charges = stats.remoteDetonateCharges ?? 0;
      const usesRemote = charges > 0;
      // S142 KABOOM-PIERCE-BOMB — copy owner's pierce flag at placement
      // time so the bomb keeps the property even if the owner loses
      // pierce afterwards (no mechanism today, but reserved for future
      // negative pickups / debuffs).
      const bombDef: { fuseRemaining: number; range: number; ownerId: string; pierce?: boolean } = {
        fuseRemaining: usesRemote ? Number.POSITIVE_INFINITY : fuseSeconds,
        range: stats.range,
        ownerId: entityId
      };
      if (stats.pierce === true) bombDef.pierce = true;
      world.setComponent(bombId, BOMB, bombDef);

      world.setComponent(entityId, BOMBER_STATS, {
        ...stats,
        activeBombs: active + 1,
        remoteDetonateCharges: usesRemote ? charges - 1 : charges
      });

      // S243 KABOOM-BOMB-SPAWN-PUFF (S247 — via shared `spawnPuff`;
      // S257 — tinted to the placer's palette so "which bot bombed?"
      // reads at a glance in chaotic moments).
      const puffOpts: {
        id: string;
        position: [number, number, number];
        preset: string;
        lifetime: number;
        rate: number;
        maxParticles: number;
        color?: string;
      } = {
        id: `${bombId}.puff`,
        position: [pos.gx, 0.5 + cellHeight, pos.gz],
        preset: "spark",
        lifetime: 0.3,
        rate: 30,
        maxParticles: 8
      };
      const tint = bomberPuffColor(world, entityId);
      if (tint !== undefined) puffOpts.color = tint;
      spawnPuff(world, puffOpts);
    }
  };

  return { name, frameUpdate };
}
