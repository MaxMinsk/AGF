// S183 KABOOM-STEP-JUMP-LANDING-FX — small dust puff when a bomber
// lands a ±1 step-jump. Detects cell crossings whose height delta is
// exactly 1 and spawns a short-lived ParticleEmitter at the landing
// cell. Pure presentation; no gameplay state touched.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import { getCellHeight } from "../../../../engine/grid/height-query";

const TRANSFORM: ComponentName = "Transform";
const GRID_POSITION: ComponentName = "GridPosition";
const BOMBER_STATS: ComponentName = "BomberStats";
const PARTICLE_EMITTER: ComponentName = "ParticleEmitter";

type GridPos = { gx: number; gz: number };

let emitterCounter = 0;

export function createKaboomStepJumpFxSystem(): System {
  const name = "kaboom.step-jump-fx";
  // Last seen GridPosition + cell height per bomber. Used to detect
  // the discrete cell-crossing moment.
  const lastCell = new Map<EntityId, { gx: number; gz: number; h: number }>();
  let cachedWorld: World | undefined;
  let bombers: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      bombers = world.createQuery([BOMBER_STATS, GRID_POSITION, TRANSFORM]);
      cachedWorld = world;
      lastCell.clear();
    }

    for (const id of bombers!.run()) {
      const pos = world.getComponent<GridPos>(id, GRID_POSITION);
      if (pos === undefined) continue;
      const currentH = getCellHeight(world, pos.gx, pos.gz);
      const prev = lastCell.get(id);
      lastCell.set(id, { gx: pos.gx, gz: pos.gz, h: currentH });
      if (prev === undefined) continue;
      if (prev.gx === pos.gx && prev.gz === pos.gz) continue;
      // Cell crossed. Only puff when the height delta reads as a step-jump.
      if (Math.abs(currentH - prev.h) !== 1) continue;
      spawnDustPuff(world, pos.gx, pos.gz, currentH);
    }

    // GC: drop entries for entities that no longer exist.
    for (const id of [...lastCell.keys()]) {
      if (!world.hasEntity(id)) lastCell.delete(id);
    }
  };

  return { name, fixedUpdate };
}

function spawnDustPuff(world: World, gx: number, gz: number, cellHeight: number): void {
  emitterCounter += 1;
  const emitterId = `kaboom.step-jump-fx.${emitterCounter}`;
  world.addEntity(emitterId);
  world.setComponent(emitterId, TRANSFORM, {
    position: [gx, cellHeight + 0.05, gz],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  });
  world.setComponent(emitterId, PARTICLE_EMITTER, {
    preset: "spark",
    lifetime: 0.25,
    elapsed: 0,
    rate: 24,
    maxParticles: 8
  });
}
