// S194 KABOOM-CAMERA-ZOOM-ON-ACTION. Slowly widens the active
// orthographic camera's frustum (orthographicSize) when the arena
// gets busy — many live bombs, a freshly-spawned blast tile, sudden
// death active — so the player sees more context. Eases back to the
// authored baseline once things quiet down.
//
// Why not damped follow: the S163 doubling artifact came from camera
// POSITION lerping inside the render frame. orthographicSize is a
// per-camera scalar with no doubling risk — it's read once per frame
// by the renderer when it updates the projection matrix.

import type { ComponentName } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

const CAMERA: ComponentName = "Camera";
const BOMB: ComponentName = "Bomb";
const BLAST_TILE: ComponentName = "BlastTile";
const SUDDEN_DEATH_STATE: ComponentName = "SuddenDeathState";
const ROUND_STATE: ComponentName = "RoundState";

const CAMERA_ENTITY_ID = "camera.main";
const KABOOM_GAME_STATE_ID = "kaboom.game-state";
const ROUND_STATE_ID = "kaboom.round-state";

/** Extra ortho-size added per live bomb beyond the first. */
const BOMB_ZOOM_PER = 0.16;
/** Extra ortho-size added per active blast tile. */
const BLAST_TILE_ZOOM_PER = 0.05;
/** Extra ortho-size added when sudden death is active. */
const SUDDEN_DEATH_BOOST = 0.6;
/** Hard cap on the action boost above baseline (cells). */
const MAX_BOOST = 2.0;
/** S202 — negative ortho delta (zoom-IN) applied while RoundState.phase
 *  is non-"playing" (won/lost/draw). Sells the round-end moment by
 *  pulling the framing tighter for the duration of the banner display.
 *  Returns to baseline automatically when the next round starts and
 *  the phase flips back to "playing". */
const ROUND_RESOLVE_ZOOM_IN = -1.5;
/** Floor on the boost so simultaneous zoom-in signals can't collapse
 *  the frustum to a point. */
const MIN_BOOST = -2.5;
/** Lerp rate per second — `factor * dt` of the gap is closed each tick.
 *  4.0 = half-life ~175ms, smooth without feeling sluggish. */
const LERP_RATE = 4.0;

type CameraComponent = {
  kind?: "perspective" | "orthographic";
  active?: boolean;
  orthographicSize?: number;
};

type SuddenDeathStateComponent = { activated?: boolean };
type RoundStateComponent = { phase?: "playing" | "won" | "lost" | "draw" };

export function createKaboomCameraZoomSystem(): System {
  const name = "kaboom.camera-zoom";
  // Authored orthographicSize captured the first frame we see the
  // camera. Subsequent ticks zoom from this baseline.
  let baseline: number | undefined;
  let cachedWorld: World | undefined;
  let bombs: QueryHandle | undefined;
  let blastTiles: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      bombs = world.createQuery([BOMB]);
      blastTiles = world.createQuery([BLAST_TILE]);
      cachedWorld = world;
      baseline = undefined;
    }
    if (!world.hasEntity(CAMERA_ENTITY_ID)) return;
    const cam = world.getComponent<CameraComponent>(CAMERA_ENTITY_ID, CAMERA);
    if (cam === undefined || cam.kind !== "orthographic") return;
    if (baseline === undefined) {
      baseline = cam.orthographicSize ?? 8;
    }

    let liveBombs = 0;
    for (const _ of bombs!.run()) liveBombs += 1;
    let liveBlastTiles = 0;
    for (const _ of blastTiles!.run()) liveBlastTiles += 1;
    const suddenDeath = world.hasEntity(KABOOM_GAME_STATE_ID)
      ? (world.getComponent<SuddenDeathStateComponent>(KABOOM_GAME_STATE_ID, SUDDEN_DEATH_STATE)?.activated === true)
      : false;
    // S202 — round-end zoom-in signal. Non-"playing" phases (won /
    // lost / draw) pull the framing tighter. Round-restart flips
    // phase back to "playing" → the boost decays naturally via the
    // existing lerp.
    const roundPhase = world.hasEntity(ROUND_STATE_ID)
      ? (world.getComponent<RoundStateComponent>(ROUND_STATE_ID, ROUND_STATE)?.phase ?? "playing")
      : "playing";
    const roundResolved = roundPhase !== "playing";

    const rawBoost =
      Math.max(0, liveBombs - 1) * BOMB_ZOOM_PER
      + liveBlastTiles * BLAST_TILE_ZOOM_PER
      + (suddenDeath ? SUDDEN_DEATH_BOOST : 0)
      + (roundResolved ? ROUND_RESOLVE_ZOOM_IN : 0);
    const targetBoost = Math.max(MIN_BOOST, Math.min(MAX_BOOST, rawBoost));

    const current = (cam.orthographicSize ?? baseline) - baseline;
    const dt = context.time.fixedDt;
    const t = Math.min(1, LERP_RATE * dt);
    const nextBoost = current + (targetBoost - current) * t;
    const nextSize = baseline + nextBoost;
    if (Math.abs(nextSize - (cam.orthographicSize ?? baseline)) > 1e-3) {
      world.setComponent(CAMERA_ENTITY_ID, CAMERA, { ...cam, orthographicSize: nextSize });
    }
  };

  return { name, fixedUpdate };
}
