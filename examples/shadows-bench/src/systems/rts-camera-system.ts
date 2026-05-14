// examples/shadows-bench — strategy-style camera. Pan with WASD/arrows,
// zoom in/out with mouse wheel (or Q/E). Writes Transform.position
// directly; ignores rotation (the scene authors the tilt once).
//
// Component shape (RtsCamera) is project-specific — it lives here, not
// in engine/, per "project code never in engine/".

import type { EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

export const RTS_CAMERA: string = "RtsCamera";
export const TRANSFORM: string = "Transform";

type RtsCameraComponent = {
  panSpeed?: number;
  zoomSpeed?: number;
  minHeight?: number;
  maxHeight?: number;
};

type TransformComponent = {
  position?: ReadonlyArray<number>;
  rotation?: ReadonlyArray<number>;
  scale?: ReadonlyArray<number>;
};

export function createRtsCameraSystem(): System {
  let cachedWorld: World | undefined;
  let cameraQuery: QueryHandle | undefined;

  const pressed = new Set<string>();
  let pendingZoomDelta = 0;

  const onKeyDown = (event: KeyboardEvent): void => {
    pressed.add(event.code);
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    pressed.delete(event.code);
  };
  const onWheel = (event: WheelEvent): void => {
    pendingZoomDelta += event.deltaY * 0.01;
  };

  if (typeof window !== "undefined") {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("wheel", onWheel, { passive: true });
  }

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      cameraQuery = world.createQuery([RTS_CAMERA, TRANSFORM]);
      cachedWorld = world;
    }
    const dt = context.time.dt;
    if (dt <= 0) return;

    const ids: EntityId[] = cameraQuery!.run();
    for (const id of ids) {
      const config = world.getComponent<RtsCameraComponent>(id, RTS_CAMERA);
      if (config === undefined) continue;
      const transform = world.getComponent<TransformComponent>(id, TRANSFORM);
      if (transform === undefined) continue;
      const pos = transform.position ?? [0, 0, 0];

      const panSpeed = config.panSpeed ?? 12;
      const zoomSpeed = config.zoomSpeed ?? 6;
      const minH = config.minHeight ?? 6;
      const maxH = config.maxHeight ?? 45;

      let dx = 0;
      let dz = 0;
      if (pressed.has("KeyW") || pressed.has("ArrowUp")) dz -= 1;
      if (pressed.has("KeyS") || pressed.has("ArrowDown")) dz += 1;
      if (pressed.has("KeyA") || pressed.has("ArrowLeft")) dx -= 1;
      if (pressed.has("KeyD") || pressed.has("ArrowRight")) dx += 1;
      const len = Math.hypot(dx, dz);
      if (len > 0) {
        dx /= len;
        dz /= len;
      }

      // Keyboard zoom — Q/E mirrors the wheel for keyboards without one.
      let zoomDelta = pendingZoomDelta;
      if (pressed.has("KeyQ")) zoomDelta -= zoomSpeed * dt;
      if (pressed.has("KeyE")) zoomDelta += zoomSpeed * dt;
      pendingZoomDelta = 0;

      const nextX = (pos[0] ?? 0) + dx * panSpeed * dt;
      const nextY = Math.min(maxH, Math.max(minH, (pos[1] ?? 22) + zoomDelta));
      // RTS feel — pan keeps the same Y/Z tilt; zoom adjusts both Y AND Z
      // proportionally so the camera tracks where it is looking.
      const ratio = nextY / Math.max(0.0001, pos[1] ?? 22);
      const nextZ = (pos[2] ?? 22) + dz * panSpeed * dt;
      const nextZScaled = nextZ * ratio;

      world.setComponent(id, TRANSFORM, {
        ...transform,
        position: [nextX, nextY, nextZScaled]
      });
    }
  };

  return {
    name: "rts-camera",
    frameUpdate
  };
}
