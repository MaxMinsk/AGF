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
const BOMBER_STATS: ComponentName = "BomberStats";
const PLACE_BOMB_REQUEST: ComponentName = "PlaceBombRequest";
const ROUND_RESTART_REQUEST: ComponentName = "RoundRestartRequest";
const REMOTE_DETONATE_REQUEST: ComponentName = "RemoteDetonateRequest";
const PICKUP_BOMB_REQUEST: ComponentName = "PickupBombRequest";
const THROW_BOMB_REQUEST: ComponentName = "ThrowBombRequest";
const GRID_POSITION: ComponentName = "GridPosition";
const BOMB: ComponentName = "Bomb";
// S098 AGF-PROBE-INPUT-INJECT — engine-side transient written by
// runtime.injectInput. The player-input-system reads + clears it
// each frameUpdate and fires the same downstream effect as a real
// keyboard event would.
const INPUT_ACTION: ComponentName = "InputAction";

const MOVE_RIGHT = new Set(["KeyD", "ArrowRight"]);
const MOVE_UP = new Set(["KeyW", "ArrowUp"]);
const MOVE_LEFT = new Set(["KeyA", "ArrowLeft"]);
const MOVE_DOWN = new Set(["KeyS", "ArrowDown"]);
// S108 KABOOM-REMOTE-DETONATE-PRESS-SPLIT. Space is no longer the
// dedicated PLACE_BOMB key — its branch decides place vs detonate
// based on the bomber's BomberStats (activeBombs vs maxBombs).
const SPACE_OR_PLACE_FALLBACK = new Set(["Space"]);
const ROUND_RESTART = new Set(["KeyR"]);
// S100 KABOOM-REMOTE-DETONATE-PUP — F triggers all paused bombs.
// S104 KABOOM-REMOTE-DETONATE-SPACE-BIND. Space also detonates paused
// bombs: PLACE_BOMB and REMOTE_DETONATE both fire on Space, so the
// same press places a new paused bomb (if slots remain) AND detonates
// every paused bomb already in the world. F stays as the explicit
// single-purpose detonate trigger.
// S100 KABOOM-REMOTE-DETONATE-PUP. F key always fires remote-detonate.
// Space is dual-purpose — see the Space branch below for the
// place-vs-detonate dispatch.
const REMOTE_DETONATE_EXPLICIT = new Set(["KeyF"]);
// S144 KABOOM-THROW-GLOVE — T key picks up the bomb under the bomber
// (when canThrow=true + standing on own bomb), or throws the carried
// bomb when already carrying. Edge-triggered.
const THROW_GLOVE = new Set(["KeyT"]);

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

/**
 * S144 — find a bomb at (gx, gz) owned by `ownerId`. Returns the
 * bomb entity id or undefined when no own bomb sits on the cell.
 * Linear scan — bombs are short-lived + small in count, so iterating
 * the bomb query each T-press is fine.
 */
function findOwnBombAt(
  world: World,
  ownerId: string,
  gx: number,
  gz: number
): string | undefined {
  // T-key throw-glove pickup fires at most once per player keypress
  // (not per frame), so a cached query would just store stale results.
  // agf-allow: world.query
  for (const id of world.query([BOMB, GRID_POSITION])) {
    const pos = world.getComponent<{ gx?: number; gz?: number }>(id, GRID_POSITION);
    if (pos?.gx !== gx || pos?.gz !== gz) continue;
    const bomb = world.getComponent<{ ownerId?: string; airborne?: boolean; carriedBy?: string }>(id, BOMB);
    if (bomb?.ownerId !== ownerId) continue;
    if (bomb.airborne === true || typeof bomb.carriedBy === "string") continue;
    return id;
  }
  return undefined;
}

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
  // S85 KABOOM-TITLE-INPUT-PAUSE. Track GamePaused across frames so the
  // transition paused → unpaused can "consume" currently-held keys —
  // otherwise a Space that ALSO dismissed the title overlay would fire
  // a fresh edge on the unpause frame and spawn a bomb on (1,1).
  // Default false because unit tests without a game-state entity must
  // see normal edge-detect from frame 0.
  let wasPaused = false;

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
    // the title-screen / pause overlay is up. The transition frame
    // (paused → unpaused) also has to be inert: the very Space press
    // that dismissed the overlay is otherwise observed as a fresh edge
    // and spawns a bomb on the player's starting cell. `wasPaused`
    // captures the previous frame's state; the unpause frame swallows
    // currently-held keys into `previousPressed` so the NEXT genuine
    // keystroke (released + re-pressed) is the first edge.
    const isPaused = world.hasComponent("kaboom.game-state", "GamePaused");
    if (isPaused || wasPaused) {
      wasPaused = isPaused;
      previousPressed = new Set(pressed);
      return;
    }
    const direction = resolveDirection();
    const spaceEdge = someInSetNew(SPACE_OR_PLACE_FALLBACK);
    const restartEdge = someInSetNew(ROUND_RESTART);
    const fKeyDetonateEdge = someInSetNew(REMOTE_DETONATE_EXPLICIT);
    const throwEdge = someInSetNew(THROW_GLOVE);
    for (const entityId of query!.run()) {
      const mover = world.getComponent<GridMoverComponent>(entityId, GRID_MOVER);
      if (mover === undefined) continue;
      // S108 — dead bombers don't respond to input. Without this guard
      // the ragdoll arc keeps logging queuedDirection updates and the
      // corpse "steers" in midair when keys are pressed.
      const stats = world.getComponent<{ alive?: boolean }>(entityId, BOMBER_STATS);
      if (stats?.alive === false) {
        // Drop any stale queued direction + restart-only edges so
        // R-key restart still works for the dead-player UX.
        if (mover.queuedDirection !== undefined && (mover.queuedDirection.dx !== 0 || mover.queuedDirection.dz !== 0)) {
          world.setComponent(entityId, GRID_MOVER, { ...mover, queuedDirection: { dx: 0, dz: 0 } });
        }
        if ((restartEdge || world.hasComponent(entityId, INPUT_ACTION)) && !world.hasComponent(entityId, ROUND_RESTART_REQUEST)) {
          world.setComponent(entityId, ROUND_RESTART_REQUEST, {});
        }
        continue;
      }

      // S098 AGF-PROBE-INPUT-INJECT — read + consume an injected
      // InputAction BEFORE the keyboard path so a probe-driven action
      // wins over no-keys-pressed default state. Keyboard edges still
      // fire if they coincide; the action injection is additive.
      let injectedDirection: { dx: number; dz: number } | undefined;
      let injectedPlaceBomb = false;
      let injectedRestart = false;
      let injectedRemoteDetonate = false;
      const injection = world.getComponent<{ action: string; value?: unknown }>(entityId, INPUT_ACTION);
      if (injection !== undefined) {
        switch (injection.action) {
          case "place-bomb":
            injectedPlaceBomb = true;
            break;
          case "restart":
            injectedRestart = true;
            break;
          case "remote-detonate":
            // S100 KABOOM-REMOTE-DETONATE-PUP — probe-fired equivalent
            // of the F key. bomb-fuse-system reads RemoteDetonateRequest
            // and drops every paused bomb owned by this entity to fuse=0.
            injectedRemoteDetonate = true;
            break;
          case "move-right":
            injectedDirection = { dx: 1, dz: 0 };
            break;
          case "move-up":
            injectedDirection = { dx: 0, dz: -1 };
            break;
          case "move-left":
            injectedDirection = { dx: -1, dz: 0 };
            break;
          case "move-down":
            injectedDirection = { dx: 0, dz: 1 };
            break;
          case "stop":
            injectedDirection = { dx: 0, dz: 0 };
            break;
          default:
            // Unknown action — leave as-is; the probe-side validator
            // already accepts any string so projects can grow new
            // verbs without engine changes.
            break;
        }
        world.removeComponent(entityId, INPUT_ACTION);
      }

      const targetDirection = injectedDirection ?? direction;
      const prev = mover.queuedDirection;
      if (prev?.dx !== targetDirection.dx || prev?.dz !== targetDirection.dz) {
        world.setComponent(entityId, GRID_MOVER, { ...mover, queuedDirection: targetDirection });
      }
      // Edge-trigger transients. BombPlacementSystem (and RoundResolveSystem)
      // consume + remove these the same frame they're written.
      if ((restartEdge || injectedRestart) && !world.hasComponent(entityId, ROUND_RESTART_REQUEST)) {
        world.setComponent(entityId, ROUND_RESTART_REQUEST, {});
      }
      // F key always fires remote-detonate explicitly.
      // Space (or probe place-bomb action) is dual-purpose: when the
      // bomber has a free bomb slot it PLACES; otherwise (slots full
      // with paused bombs) it DETONATES. The two cases are exclusive
      // so we never trigger place + detonate on the same press.
      const spaceTriggered = spaceEdge || injectedPlaceBomb;
      let wantPlace = false;
      let wantDetonate = fKeyDetonateEdge || injectedRemoteDetonate;
      if (spaceTriggered) {
        const stats = world.getComponent<{ activeBombs?: number; maxBombs?: number }>(
          entityId,
          BOMBER_STATS
        );
        const active = stats?.activeBombs ?? 0;
        const max = stats?.maxBombs ?? 1;
        if (active < max) {
          wantPlace = true;
        } else {
          wantDetonate = true;
        }
      }
      if (wantPlace && !world.hasComponent(entityId, PLACE_BOMB_REQUEST)) {
        world.setComponent(entityId, PLACE_BOMB_REQUEST, {});
      }
      if (wantDetonate && !world.hasComponent(entityId, REMOTE_DETONATE_REQUEST)) {
        world.setComponent(entityId, REMOTE_DETONATE_REQUEST, {});
      }
      // S144 KABOOM-THROW-GLOVE — T key dispatches pickup vs throw
      // based on the bomber's current state. Only fires when canThrow
      // is set; tap with canThrow=false is a silent no-op.
      if (throwEdge) {
        const tStats = world.getComponent<{
          canThrow?: boolean;
          carryingBombId?: string;
        }>(entityId, BOMBER_STATS);
        if (tStats?.canThrow === true) {
          if (typeof tStats.carryingBombId === "string" && tStats.carryingBombId.length > 0) {
            // Carrying → throw. Request consumed by bomb-throw-system.
            if (!world.hasComponent(entityId, THROW_BOMB_REQUEST)) {
              world.setComponent(entityId, THROW_BOMB_REQUEST, {});
            }
          } else {
            // Not carrying → check if standing on own bomb. Pickup
            // request carries the bomb id so bomb-pickup-system can
            // validate the cell match the same fixedUpdate.
            const pos = world.getComponent<{ gx?: number; gz?: number }>(entityId, GRID_POSITION);
            if (pos?.gx !== undefined && pos?.gz !== undefined) {
              const ownBomb = findOwnBombAt(world, entityId, pos.gx, pos.gz);
              if (ownBomb !== undefined && !world.hasComponent(entityId, PICKUP_BOMB_REQUEST)) {
                world.setComponent(entityId, PICKUP_BOMB_REQUEST, { bombId: ownBomb });
              }
            }
          }
        }
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
