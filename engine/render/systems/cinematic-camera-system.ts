// M21-cam-cinematic: scripted camera waypoint playback.
//
// Each entity carrying `CinematicCamera { waypoints[], elapsed, playing, loop }`
// interpolates Transform.position + rotation through the waypoint chain.
// Each segment runs for `waypoints[i].duration` seconds, the position
// blends between `waypoints[i-1].position` and `waypoints[i].position`,
// the look-at target blends between the previous and current `lookAt`,
// using the requested easing.
//
// Replay-safe: `elapsed` lives on the component, so a snapshot fully
// captures playback state. Gameplay can pause via applyCommands setting
// `playing: false`, or seek by writing `elapsed`. When all segments
// have played, the system stops the camera (unless `loop: true`).

import type { ComponentName, EntityId } from "../../core/ecs/types";
import type { QueryHandle, World } from "../../core/ecs/world";
import type { System, SystemContext } from "../../core/systems/types";

export const CINEMATIC_CAMERA: ComponentName = "CinematicCamera";
const TRANSFORM: ComponentName = "Transform";

type Vec3 = ReadonlyArray<number>;

type Waypoint = {
  position: Vec3;
  lookAt: Vec3;
  duration: number;
  ease?: "linear" | "easeIn" | "easeOut" | "easeInOut";
};

type CinematicCameraComponent = {
  waypoints: Waypoint[];
  loop?: boolean;
  autoplay?: boolean;
  playing?: boolean;
  elapsed?: number;
};

const RAD2DEG = 180 / Math.PI;

function easeFn(kind: Waypoint["ease"], t: number): number {
  switch (kind) {
    case "easeIn":
      return t * t;
    case "easeOut":
      return 1 - (1 - t) * (1 - t);
    case "easeInOut":
    default:
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case "linear":
      return t;
  }
}

function lerp3(a: Vec3, b: Vec3, t: number): [number, number, number] {
  return [
    (a[0] ?? 0) + ((b[0] ?? 0) - (a[0] ?? 0)) * t,
    (a[1] ?? 0) + ((b[1] ?? 0) - (a[1] ?? 0)) * t,
    (a[2] ?? 0) + ((b[2] ?? 0) - (a[2] ?? 0)) * t
  ];
}

function lookAtEuler(from: Vec3, target: Vec3): [number, number, number] {
  const dx = (target[0] ?? 0) - (from[0] ?? 0);
  const dy = (target[1] ?? 0) - (from[1] ?? 0);
  const dz = (target[2] ?? 0) - (from[2] ?? 0);
  const planar = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dx, -dz) * RAD2DEG;
  const pitch = Math.atan2(dy, planar) * RAD2DEG;
  return [pitch, yaw, 0];
}

export function createCinematicCameraSystem(options: { name?: string } = {}): System {
  const name = options.name ?? "render.cinematic-camera";
  let cachedWorld: World | undefined;
  let query: QueryHandle | undefined;

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      query = world.createQuery([CINEMATIC_CAMERA, TRANSFORM]);
      cachedWorld = world;
    }
    const dt = context.time.dt;
    for (const entityId of query!.run()) {
      advance(world, entityId, dt);
    }
  };

  return { name, frameUpdate };
}

function advance(world: World, entityId: EntityId, dt: number): void {
  const cinematic = world.getComponent<CinematicCameraComponent>(entityId, CINEMATIC_CAMERA);
  if (cinematic === undefined) return;
  const playing = cinematic.playing ?? cinematic.autoplay ?? true;
  if (!playing) return;
  const waypoints = cinematic.waypoints;
  if (waypoints.length < 2) return;

  // Total length of one cycle = sum of segment durations.
  let totalDuration = 0;
  for (let i = 1; i < waypoints.length; i += 1) {
    totalDuration += waypoints[i]?.duration ?? 0;
  }
  if (totalDuration <= 0) return;

  let elapsed = (cinematic.elapsed ?? 0) + dt;
  let done = false;

  if (elapsed >= totalDuration) {
    if (cinematic.loop === true) {
      elapsed = elapsed % totalDuration;
    } else {
      elapsed = totalDuration;
      done = true;
    }
  }

  // Find current segment.
  let segmentStart = 0;
  let segmentIndex = 1;
  for (let i = 1; i < waypoints.length; i += 1) {
    const segDuration = waypoints[i]?.duration ?? 0;
    if (elapsed <= segmentStart + segDuration || i === waypoints.length - 1) {
      segmentIndex = i;
      break;
    }
    segmentStart += segDuration;
  }
  const prev = waypoints[segmentIndex - 1]!;
  const curr = waypoints[segmentIndex]!;
  const segElapsed = elapsed - segmentStart;
  const segDuration = curr.duration;
  const t = Math.max(0, Math.min(1, segElapsed / segDuration));
  const eased = easeFn(curr.ease ?? "easeInOut", t);

  const position = lerp3(prev.position, curr.position, eased);
  const lookAt = lerp3(prev.lookAt, curr.lookAt, eased);
  const rotation = lookAtEuler(position, lookAt);

  const transform = world.getComponent<{ position?: Vec3; rotation?: Vec3 }>(entityId, TRANSFORM);
  world.setComponent(entityId, TRANSFORM, {
    ...transform,
    position,
    rotation
  });

  if (done) {
    world.setComponent(entityId, CINEMATIC_CAMERA, {
      ...cinematic,
      elapsed,
      playing: false
    });
  } else if ((cinematic.elapsed ?? 0) !== elapsed) {
    world.setComponent(entityId, CINEMATIC_CAMERA, {
      ...cinematic,
      elapsed,
      playing: true
    });
  }
}
