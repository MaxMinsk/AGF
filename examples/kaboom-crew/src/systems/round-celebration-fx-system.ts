// S199 KABOOM-ROUND-CELEBRATION-FX. On the tick that RoundState.phase
// transitions from "playing" to "won" or "lost", spawn a short-lived
// celebratory particle burst at the winning bomber's Transform
// position. Pure presentation; no gameplay state touched.
//
// "won" + winnerId set → burst at that bomber.
// "lost" → no fx (the surviving bot already has its own ragdoll/win
// state and the player feels it more if THEIR end is quiet).
// "draw" → small subtle burst in the arena centre so the moment
// reads as decisive even without a victor.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

const TRANSFORM: ComponentName = "Transform";
const ROUND_STATE: ComponentName = "RoundState";
const PARTICLE_EMITTER: ComponentName = "ParticleEmitter";
const GRID: ComponentName = "Grid";

const ROUND_STATE_ID = "kaboom.round-state";

type RoundStateComponent = {
  phase?: "playing" | "won" | "lost" | "draw";
  winnerId?: EntityId;
};

type TransformComponent = { position?: ReadonlyArray<number> };
type GridComponent = { sizeX?: number; sizeZ?: number };

let counter = 0;

export function createKaboomRoundCelebrationFxSystem(): System {
  const name = "kaboom.round-celebration-fx";
  let cachedWorld: World | undefined;
  let roundQuery: QueryHandle | undefined;
  let lastPhase: "playing" | "won" | "lost" | "draw" | undefined = "playing";

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      roundQuery = world.createQuery([ROUND_STATE]);
      cachedWorld = world;
      lastPhase = "playing";
    }
    const state = readRoundState(world, roundQuery!);
    if (state === undefined) {
      lastPhase = undefined;
      return;
    }
    const phase = state.phase ?? "playing";
    if (phase === lastPhase) return;
    lastPhase = phase;
    if (phase === "won") {
      const winner = state.winnerId;
      if (winner !== undefined && world.hasEntity(winner)) {
        const t = world.getComponent<TransformComponent>(winner, TRANSFORM);
        if (t?.position !== undefined) {
          spawnVictoryBurst(world, t.position);
        }
      }
    } else if (phase === "draw") {
      const center = readArenaCenter(world);
      spawnDrawBurst(world, center);
    }
    // "lost" intentionally produces no FX — see header.
  };

  return { name, fixedUpdate };
}

function readRoundState(world: World, query: QueryHandle): RoundStateComponent | undefined {
  // First try the canonical singleton id; fall back to any entity
  // carrying the component (defensive in case a future refactor moves it).
  if (world.hasEntity(ROUND_STATE_ID)) {
    const s = world.getComponent<RoundStateComponent>(ROUND_STATE_ID, ROUND_STATE);
    if (s !== undefined) return s;
  }
  for (const id of query.run()) {
    const s = world.getComponent<RoundStateComponent>(id, ROUND_STATE);
    if (s !== undefined) return s;
  }
  return undefined;
}

function readArenaCenter(world: World): [number, number, number] {
  for (const id of world.entityIds()) {
    if (!world.hasComponent(id, GRID)) continue;
    const g = world.getComponent<GridComponent>(id, GRID);
    if (g === undefined) continue;
    return [((g.sizeX ?? 15) - 1) / 2, 0.4, ((g.sizeZ ?? 11) - 1) / 2];
  }
  return [7, 0.4, 5];
}

function spawnVictoryBurst(world: World, position: ReadonlyArray<number>): void {
  // Big, ~1.0s 'pulse' burst right above the winner — the pulse preset
  // throws particles in a wider spread + warmer hue than spark/glow.
  counter += 1;
  const emitterId = `kaboom.round-celebration.victory.${counter}`;
  world.addEntity(emitterId);
  world.setComponent(emitterId, TRANSFORM, {
    position: [position[0] ?? 0, (position[1] ?? 0.4) + 0.3, position[2] ?? 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  });
  world.setComponent(emitterId, PARTICLE_EMITTER, {
    preset: "pulse",
    lifetime: 1.1,
    elapsed: 0,
    rate: 60,
    maxParticles: 80
  });
}

function spawnDrawBurst(world: World, position: ReadonlyArray<number>): void {
  // Smaller + neutral 'spark' so the draw reads as a decisive end
  // without taking the 'someone won' visual weight.
  counter += 1;
  const emitterId = `kaboom.round-celebration.draw.${counter}`;
  world.addEntity(emitterId);
  world.setComponent(emitterId, TRANSFORM, {
    position: [position[0] ?? 0, position[1] ?? 0.4, position[2] ?? 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  });
  world.setComponent(emitterId, PARTICLE_EMITTER, {
    preset: "spark",
    lifetime: 0.5,
    elapsed: 0,
    rate: 30,
    maxParticles: 24
  });
}
