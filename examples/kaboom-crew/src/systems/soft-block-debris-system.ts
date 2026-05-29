// S192 KABOOM-SOFT-BLOCK-DEBRIS. When a soft block is destroyed by a
// blast, spawn a handful of small box-debris chunks at the cell. The
// chunks fly outward + arc with gravity + fade out via the existing
// engine AccessoryDebris integration in accessory-detach-system —
// we just stamp the components; the integrator owns the kinematics.
//
// Reads SoftBlockDestroyedEvent transients emitted by
// blast-propagation-system. Doesn't consume them — pickup-spawn-system
// also reads the same events.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";
import { getCellHeight } from "../../../../engine/grid/height-query";
import { ARENA_THEMES, isArenaThemeKey, type ArenaThemeKey } from "../themes/theme-table";

const TRANSFORM: ComponentName = "Transform";
const MESH_RENDERER: ComponentName = "MeshRenderer";
const ACCESSORY_DEBRIS: ComponentName = "AccessoryDebris";
const SOFT_BLOCK_DESTROYED_EVENT: ComponentName = "SoftBlockDestroyedEvent";
const ARENA_THEME_COMPONENT: ComponentName = "ArenaTheme";

const KABOOM_GAME_STATE_ID = "kaboom.game-state";

/** Six chunks reads as a satisfying burst without flooding the screen. */
const DEBRIS_PER_BLOCK = 6;
/** Cells / sec. Tuned to feel like a chunky pop rather than a wispy puff. */
const SPEED_MIN = 1.4;
const SPEED_MAX = 3.0;
/** Vertical kick — debris launches up before gravity pulls it back. */
const VY_MIN = 1.6;
const VY_MAX = 3.2;
/** Chunk side length in cells. */
const CHUNK_SIZE = 0.18;
const DEBRIS_LIFETIME_MS = 700;

type SoftBlockDestroyedEvent = { gx: number; gz: number };
type ArenaThemeComponent = { themeKey?: string };

let chunkCounter = 0;

export function createKaboomSoftBlockDebrisSystem(): System {
  const name = "kaboom.soft-block-debris";
  let cachedWorld: World | undefined;
  let events: QueryHandle | undefined;
  // Per-event idempotency — multiple ticks can see the same event before
  // it's removed; we only burst once.
  const handledEvents = new Set<EntityId>();

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      events = world.createQuery([SOFT_BLOCK_DESTROYED_EVENT]);
      cachedWorld = world;
      handledEvents.clear();
    }
    const themeKey = readActiveThemeKey(world);
    const accentColor = ARENA_THEMES[themeKey].softBlockPalette.primary;
    for (const eventId of events!.run()) {
      if (handledEvents.has(eventId)) continue;
      const ev = world.getComponent<SoftBlockDestroyedEvent>(eventId, SOFT_BLOCK_DESTROYED_EVENT);
      if (ev === undefined) continue;
      handledEvents.add(eventId);
      burstAt(world, ev.gx, ev.gz, accentColor);
    }
    // GC handled events that have since been removed.
    for (const id of [...handledEvents]) {
      if (!world.hasEntity(id)) handledEvents.delete(id);
    }
  };

  return { name, fixedUpdate };
}

function burstAt(world: World, gx: number, gz: number, color: string): void {
  const cellH = getCellHeight(world, gx, gz);
  const cellTopY = cellH + 0.5; // soft block authored at y=0.45-0.5 on flat
  for (let i = 0; i < DEBRIS_PER_BLOCK; i += 1) {
    chunkCounter += 1;
    const id: EntityId = `kaboom.soft-debris.${chunkCounter}.${gx}.${gz}`;
    world.addEntity(id);
    // Random unit-radius outward direction in XZ.
    const angle = (i / DEBRIS_PER_BLOCK + Math.random() * (1 / DEBRIS_PER_BLOCK)) * Math.PI * 2;
    const speed = randRange(SPEED_MIN, SPEED_MAX);
    const vx = Math.cos(angle) * speed;
    const vz = Math.sin(angle) * speed;
    const vy = randRange(VY_MIN, VY_MAX);
    world.setComponent(id, TRANSFORM, {
      position: [gx, cellTopY, gz],
      rotation: [Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI],
      scale: [CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE]
    });
    world.setComponent(id, MESH_RENDERER, { mesh: "box", color });
    world.setComponent(id, ACCESSORY_DEBRIS, {
      vx,
      vy,
      vz,
      spinX: randRange(-720, 720),
      spinY: randRange(-720, 720),
      spinZ: randRange(-720, 720),
      elapsedMs: 0,
      lifetimeMs: DEBRIS_LIFETIME_MS,
      fadeMs: 250,
      gravity: 9.8
    });
  }
}

function readActiveThemeKey(world: World): ArenaThemeKey {
  if (!world.hasEntity(KABOOM_GAME_STATE_ID)) return "warehouse";
  const comp = world.getComponent<ArenaThemeComponent>(KABOOM_GAME_STATE_ID, ARENA_THEME_COMPONENT);
  return isArenaThemeKey(comp?.themeKey) ? (comp.themeKey as ArenaThemeKey) : "warehouse";
}

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
