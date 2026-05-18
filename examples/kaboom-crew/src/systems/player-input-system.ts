// S82 KABOOM-PLAYER-INPUT. Project-local input → GridMover.queuedDirection.
//
// Listens to keyboard events on `window`, maintains a pressed-key set,
// and each frame writes the resolved cardinal direction into every
// PlayerControlled + GridMover entity. Precedence when multiple keys
// are held: right > up > left > down (deterministic order so replay
// recordings stay reproducible).
//
// Release-on-blur: when the window loses focus, the pressed set is
// cleared. Otherwise a key that was held when the user tabbed away
// would stick until they returned + released it.
//
// The system lives under examples/kaboom-crew/src/ — Kaboom-Crew-
// specific. The engine ships GridMover + grid primitives in
// engine/core/; project gameplay wires the input layer.

import type { ComponentName } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

const PLAYER_CONTROLLED: ComponentName = "PlayerControlled";
const GRID_MOVER: ComponentName = "GridMover";
const PLACE_BOMB_REQUEST: ComponentName = "PlaceBombRequest";
const ROUND_RESTART_REQUEST: ComponentName = "RoundRestartRequest";

const MOVE_RIGHT = new Set(["KeyD", "ArrowRight"]);
const MOVE_UP = new Set(["KeyW", "ArrowUp"]);
const MOVE_LEFT = new Set(["KeyA", "ArrowLeft"]);
const MOVE_DOWN = new Set(["KeyS", "ArrowDown"]);
const PLACE_BOMB = new Set(["Space"]);
const ROUND_RESTART = new Set(["KeyR"]);

type GridMoverComponent = {
  speed: number;
  queuedDirection?: { dx: number; dz: number };
  currentLerp?: number;
  targetGx?: number;
  targetGz?: number;
};

export type KaboomPlayerInputSystemOptions = {
  /** EventTarget to listen on. Defaults to `window`. */
  eventTarget?: EventTarget;
  /** Override the pressed-key set (test helper). */
  pressedKeys?: Set<string>;
  name?: string;
};

export type KaboomPlayerInputSystemHandle = System & {
  /** Detach DOM listeners. Safe to call multiple times. */
  dispose(): void;
  /** Inspect the current pressed set (test helper). */
  pressedSnapshot(): ReadonlySet<string>;
};

export function createKaboomPlayerInputSystem(
  options: KaboomPlayerInputSystemOptions = {}
): KaboomPlayerInputSystemHandle {
  const name = options.name ?? "kaboom.player-input";
  const ownsListeners = options.pressedKeys === undefined;
  const pressed = options.pressedKeys ?? new Set<string>();
  const eventTarget = options.eventTarget ?? (typeof window !== "undefined" ? window : undefined);

  const handleKeyDown = (event: Event): void => {
    if (event instanceof KeyboardEvent) pressed.add(event.code);
  };
  const handleKeyUp = (event: Event): void => {
    if (event instanceof KeyboardEvent) pressed.delete(event.code);
  };
  const handleBlur = (): void => {
    pressed.clear();
  };

  let attached = false;
  function attach(): void {
    if (!ownsListeners || eventTarget === undefined || attached) return;
    eventTarget.addEventListener("keydown", handleKeyDown);
    eventTarget.addEventListener("keyup", handleKeyUp);
    eventTarget.addEventListener("blur", handleBlur);
    attached = true;
  }
  function detach(): void {
    if (!attached || eventTarget === undefined) return;
    eventTarget.removeEventListener("keydown", handleKeyDown);
    eventTarget.removeEventListener("keyup", handleKeyUp);
    eventTarget.removeEventListener("blur", handleBlur);
    attached = false;
  }

  attach();

  function resolveDirection(): { dx: number; dz: number } {
    // Deterministic precedence: right > up > left > down.
    for (const code of pressed) {
      if (MOVE_RIGHT.has(code)) return { dx: 1, dz: 0 };
    }
    for (const code of pressed) {
      if (MOVE_UP.has(code)) return { dx: 0, dz: -1 };
    }
    for (const code of pressed) {
      if (MOVE_LEFT.has(code)) return { dx: -1, dz: 0 };
    }
    for (const code of pressed) {
      if (MOVE_DOWN.has(code)) return { dx: 0, dz: 1 };
    }
    return { dx: 0, dz: 0 };
  }

  let cachedWorld: World | undefined;
  let query: QueryHandle | undefined;
  // S82 KABOOM-BOMB-PLACE. Edge-triggered actions: fire once on the
  // frame a key transitions from "not pressed" to "pressed". Stored as
  // the previous frame's snapshot so a held key doesn't spam requests.
  let previousPressed: Set<string> = new Set();

  function someInSet(targets: Set<string>): boolean {
    for (const code of pressed) if (targets.has(code)) return true;
    return false;
  }
  function someInSetNew(targets: Set<string>): boolean {
    for (const code of pressed) {
      if (targets.has(code) && !previousPressed.has(code)) return true;
    }
    return false;
  }

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      query = world.createQuery([PLAYER_CONTROLLED, GRID_MOVER]);
      cachedWorld = world;
    }
    // S85 KABOOM-TITLE-INPUT-PAUSE. Keyboard input stays inert while
    // the title screen / pause overlay is up. Without this, holding D
    // before Space would already nudge player.1, and the very Space
    // press that dismisses the overlay would also fire a
    // PlaceBombRequest because edge-detect runs on the same frame
    // the keydown handler removes the GamePaused marker. Still tick
    // `previousPressed` so the first post-resume keystroke is treated
    // as an edge (otherwise a held key wouldn't move until release).
    if (world.hasComponent("kaboom.game-state", "GamePaused")) {
      previousPressed = new Set(pressed);
      return;
    }
    const direction = resolveDirection();
    const placeBombEdge = someInSetNew(PLACE_BOMB);
    const restartEdge = someInSetNew(ROUND_RESTART);
    for (const entityId of query!.run()) {
      const mover = world.getComponent<GridMoverComponent>(entityId, GRID_MOVER);
      if (mover === undefined) continue;
      const prev = mover.queuedDirection;
      if (prev?.dx !== direction.dx || prev?.dz !== direction.dz) {
        world.setComponent(entityId, GRID_MOVER, { ...mover, queuedDirection: direction });
      }
      // Edge-trigger transients. BombPlacementSystem (and RoundResolveSystem)
      // consume + remove these the same frame they're written.
      if (placeBombEdge && !world.hasComponent(entityId, PLACE_BOMB_REQUEST)) {
        world.setComponent(entityId, PLACE_BOMB_REQUEST, {});
      }
      if (restartEdge && !world.hasComponent(entityId, ROUND_RESTART_REQUEST)) {
        world.setComponent(entityId, ROUND_RESTART_REQUEST, {});
      }
    }
    // Use a copy so test injection of an external pressed set survives
    // (we don't mutate the caller's reference).
    previousPressed = new Set(pressed);
    // Suppress lint: `someInSet` is exposed for future read-only callers
    // (e.g. a HUD widget showing current input state).
    void someInSet;
  };

  return {
    name,
    frameUpdate,
    dispose(): void {
      detach();
    },
    pressedSnapshot(): ReadonlySet<string> {
      return new Set(pressed);
    }
  };
}
