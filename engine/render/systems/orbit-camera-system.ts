// M21-cam-orbit: resolve `OrbitCamera { target, distance, pitch, yaw }`
// into a Transform `position` + `rotation` each frame so the camera
// always looks at `target` from the given polar coordinates.
//
// The system is input-agnostic — gameplay systems (mouse drag, scripted
// follow, applyCommands from `__agf.dev.tuner`, etc.) mutate
// OrbitCamera fields directly. `minDistance` / `maxDistance` clamp at
// resolve time so external writers don't have to remember to.
//
// Rotation is computed as Euler XYZ degrees (matching the rest of the
// engine's Transform.rotation convention) — pitch around X, yaw around
// Y, no roll.

import type { ComponentName, EntityId } from "../../core/ecs/types";
import type { QueryHandle, World } from "../../core/ecs/world";
import type { System, SystemContext } from "../../core/systems/types";

export const ORBIT_CAMERA: ComponentName = "OrbitCamera";
export const TRANSFORM: ComponentName = "Transform";

type Vec3 = ReadonlyArray<number>;

type OrbitCameraComponent = {
  target: Vec3;
  distance: number;
  pitch?: number;
  yaw?: number;
  minDistance?: number;
  maxDistance?: number;
};

type TransformComponent = {
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
};

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export function createOrbitCameraSystem(options: { name?: string } = {}): System {
  const name = options.name ?? "render.orbit-camera";
  let cachedWorld: World | undefined;
  let query: QueryHandle | undefined;

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      query = world.createQuery([ORBIT_CAMERA, TRANSFORM]);
      cachedWorld = world;
    }
    for (const entityId of query!.run()) {
      const orbit = world.getComponent<OrbitCameraComponent>(entityId, ORBIT_CAMERA);
      if (orbit === undefined) continue;
      const transform = world.getComponent<TransformComponent>(entityId, TRANSFORM);

      const minDist = orbit.minDistance ?? 0.001;
      const maxDist = orbit.maxDistance ?? Number.POSITIVE_INFINITY;
      const distance = Math.min(maxDist, Math.max(minDist, orbit.distance));
      const pitchDeg = orbit.pitch ?? 30;
      const yawDeg = orbit.yaw ?? 0;
      const pitchRad = pitchDeg * DEG2RAD;
      const yawRad = yawDeg * DEG2RAD;

      // Camera position in spherical coords around target. yaw = 0 puts
      // the camera on the +Z side of the target; pitch = 0 = horizontal.
      const cosPitch = Math.cos(pitchRad);
      const tx = orbit.target[0] ?? 0;
      const ty = orbit.target[1] ?? 0;
      const tz = orbit.target[2] ?? 0;
      const px = tx + distance * cosPitch * Math.sin(yawRad);
      const py = ty + distance * Math.sin(pitchRad);
      const pz = tz + distance * cosPitch * Math.cos(yawRad);

      // Look-at: rotation that orients the camera from (px,py,pz) toward
      // target. Three.js cameras look down -Z; with yaw rotating around
      // Y and pitch around X, the world-space rotation is
      // ( -pitch, yaw, 0 ) in the camera frame — the negative pitch
      // because larger orbit.pitch means looking DOWN (camera nods
      // toward target).
      world.setComponent(entityId, TRANSFORM, {
        ...transform,
        position: [px, py, pz],
        rotation: [-pitchDeg, yawDeg, 0]
      });
      // RAD2DEG is unused after the simplification above; quiet the
      // import without dropping it (kept around for future euler math).
      void RAD2DEG;
    }
  };

  return { name, frameUpdate };
}
