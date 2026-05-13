import type { System, SystemContext } from "../core/systems/types";

type PlayerControlledComponent = {
  speed: number;
};

type TransformComponent = {
  position?: ReadonlyArray<number>;
  rotation?: ReadonlyArray<number>;
  scale?: ReadonlyArray<number>;
};

export type PlayerInputSystemOptions = {
  /** EventTarget to listen on. Defaults to `window`. */
  eventTarget?: EventTarget;
  /** Override the active set of pressed keys (test helper). */
  pressedKeys?: ReadonlySet<string>;
  /**
   * When set, the system stops applying local `Transform` updates and instead
   * forwards the normalised direction vector to this callback every frame the
   * player is moving. Used by the networked Beacon profile so the server's
   * `player.<id>` entity is the authoritative position for the drone.
   */
  onIntent?: (direction: readonly [number, number]) => void;
};

export type PlayerInputSystemHandle = System & {
  /** Detach DOM listeners. Safe to call multiple times. */
  dispose(): void;
};

const MOVE_FORWARD = new Set(["KeyW", "ArrowUp"]);
const MOVE_BACK = new Set(["KeyS", "ArrowDown"]);
const MOVE_LEFT = new Set(["KeyA", "ArrowLeft"]);
const MOVE_RIGHT = new Set(["KeyD", "ArrowRight"]);

export function createPlayerInputSystem(options: PlayerInputSystemOptions = {}): PlayerInputSystemHandle {
  const ownsListeners = options.pressedKeys === undefined;
  const pressed = options.pressedKeys ?? new Set<string>();
  const eventTarget = options.eventTarget ?? (typeof window !== "undefined" ? window : undefined);
  let lastIntentNx = 0;
  let lastIntentNz = 0;
  let lastIntentSent = false;

  const handleKeyDown = (event: Event): void => {
    if (event instanceof KeyboardEvent) {
      (pressed as Set<string>).add(event.code);
    }
  };
  const handleKeyUp = (event: Event): void => {
    if (event instanceof KeyboardEvent) {
      (pressed as Set<string>).delete(event.code);
    }
  };

  if (ownsListeners && eventTarget !== undefined) {
    eventTarget.addEventListener("keydown", handleKeyDown);
    eventTarget.addEventListener("keyup", handleKeyUp);
  }

  return {
    name: "player-input",
    frameUpdate({ time, world }: SystemContext): void {
      const dx = (anyPressed(pressed, MOVE_RIGHT) ? 1 : 0) - (anyPressed(pressed, MOVE_LEFT) ? 1 : 0);
      const dz = (anyPressed(pressed, MOVE_BACK) ? 1 : 0) - (anyPressed(pressed, MOVE_FORWARD) ? 1 : 0);

      let nx = 0;
      let nz = 0;
      if (dx !== 0 || dz !== 0) {
        const length = Math.hypot(dx, dz);
        nx = dx / length;
        nz = dz / length;
      }

      if (options.onIntent !== undefined) {
        const changed = nx !== lastIntentNx || nz !== lastIntentNz;
        if (changed || (!lastIntentSent && (nx !== 0 || nz !== 0))) {
          options.onIntent([nx, nz]);
          lastIntentNx = nx;
          lastIntentNz = nz;
          lastIntentSent = true;
        }
        // Fall through: also apply local prediction so the player sees instant
        // motion. The server's snapshot will reconcile any drift.
      }

      if (nx === 0 && nz === 0) {
        return;
      }

      const entities = world.query(["PlayerControlled", "Transform"]);
      if (entities.length === 0) {
        return;
      }

      for (const entityId of entities) {
        const player = world.getComponent<PlayerControlledComponent>(entityId, "PlayerControlled");
        const transform = world.getComponent<TransformComponent>(entityId, "Transform");
        if (player === undefined || transform === undefined) {
          continue;
        }
        const speed = player.speed;
        const stepX = nx * speed * time.dt;
        const stepZ = nz * speed * time.dt;
        const px = transform.position?.[0] ?? 0;
        const py = transform.position?.[1] ?? 0;
        const pz = transform.position?.[2] ?? 0;

        world.setComponent(entityId, "Transform", {
          ...transform,
          position: [px + stepX, py, pz + stepZ]
        });
      }
    },
    dispose(): void {
      if (ownsListeners && eventTarget !== undefined) {
        eventTarget.removeEventListener("keydown", handleKeyDown);
        eventTarget.removeEventListener("keyup", handleKeyUp);
      }
    }
  };
}

function anyPressed(active: ReadonlySet<string>, candidates: ReadonlySet<string>): boolean {
  for (const code of candidates) {
    if (active.has(code)) {
      return true;
    }
  }
  return false;
}
