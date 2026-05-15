// M19-waypoint-mover: generic primitive for moving an entity along a
// pre-authored sequence of world-space positions. Sibling of
// CinematicCamera but for any Transform (not just the active camera) +
// derives yaw from velocity instead of an explicit lookAt.
//
// Authoring shape on the entity:
//
//   "WaypointMover": {
//     waypoints: [
//       { position: [x, y, z], duration: 4.0, ease?: "linear" },
//       ...
//     ],
//     loop?: true,
//     elapsed?: 0,
//     faceForward?: true   // when true, writes yaw = atan2(-dx, -dz)
//                          // so the entity's local -Z always points along
//                          // the path direction. Matches three.js camera
//                          // convention so the same value works for cars,
//                          // followers, etc.
//   }
//
// Lives in `engine/core/systems/` because it has no renderer deps. Runs
// in fixedUpdate so replay reproduces position/rotation per step.

import type { ComponentName, EntityId } from "../ecs/types";
import type { QueryHandle, World } from "../ecs/world";
import type { System, SystemContext } from "./types";

export const WAYPOINT_MOVER: ComponentName = "WaypointMover";
const TRANSFORM: ComponentName = "Transform";

type Vec3 = ReadonlyArray<number>;

type Waypoint = {
  position: Vec3;
  duration: number;
  ease?: "linear" | "easeIn" | "easeOut" | "easeInOut";
};

type WaypointMoverComponent = {
  waypoints: Waypoint[];
  loop?: boolean;
  elapsed?: number;
  faceForward?: boolean;
};

const RAD2DEG = 180 / Math.PI;

function easeFn(kind: Waypoint["ease"], t: number): number {
  switch (kind) {
    case "easeIn":
      return t * t;
    case "easeOut":
      return 1 - (1 - t) * (1 - t);
    case "easeInOut":
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case "linear":
    default:
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

export function createWaypointMoverSystem(options: { name?: string } = {}): System {
  const name = options.name ?? "core.waypoint-mover";
  let cachedWorld: World | undefined;
  let query: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      query = world.createQuery([WAYPOINT_MOVER, TRANSFORM]);
      cachedWorld = world;
    }
    const dt = context.time.dt;
    for (const entityId of query!.run()) {
      advance(world, entityId, dt);
    }
  };

  return { name, fixedUpdate };
}

function advance(world: World, entityId: EntityId, dt: number): void {
  const mover = world.getComponent<WaypointMoverComponent>(entityId, WAYPOINT_MOVER);
  if (mover === undefined) return;
  const waypoints = mover.waypoints;
  if (waypoints.length < 2) return;

  let totalDuration = 0;
  for (let i = 1; i < waypoints.length; i += 1) {
    totalDuration += waypoints[i]?.duration ?? 0;
  }
  if (totalDuration <= 0) return;

  let elapsed = (mover.elapsed ?? 0) + dt;
  let done = false;
  if (elapsed >= totalDuration) {
    if (mover.loop === true) {
      elapsed = elapsed % totalDuration;
    } else {
      elapsed = totalDuration;
      done = true;
    }
  }

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
  const eased = easeFn(curr.ease ?? "linear", t);
  const position = lerp3(prev.position, curr.position, eased);

  const transform =
    world.getComponent<{ position?: Vec3; rotation?: Vec3 }>(entityId, TRANSFORM) ?? {};
  const next: { position: Vec3; rotation?: Vec3 } = { position };
  if (mover.faceForward === true) {
    const dx = (curr.position[0] ?? 0) - (prev.position[0] ?? 0);
    const dz = (curr.position[2] ?? 0) - (prev.position[2] ?? 0);
    if (dx * dx + dz * dz > 1e-6) {
      const yaw = Math.atan2(-dx, -dz) * RAD2DEG;
      next.rotation = [0, yaw, 0];
    } else if (transform.rotation !== undefined) {
      next.rotation = transform.rotation;
    }
  } else if (transform.rotation !== undefined) {
    next.rotation = transform.rotation;
  }
  world.setComponent(entityId, TRANSFORM, { ...transform, ...next });

  if ((mover.elapsed ?? 0) !== elapsed) {
    world.setComponent(entityId, WAYPOINT_MOVER, { ...mover, elapsed });
  }
  if (done && mover.loop !== true) {
    // Strip the mover so the system stops re-touching the transform.
    world.removeComponent(entityId, WAYPOINT_MOVER);
  }
}
