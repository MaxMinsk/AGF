// M21-c: pick the active camera + sync its params/transform into the
// adapter. Reads Camera + LocalToWorld; writes the renderer-internal
// ActiveCamera marker component on the chosen entity.
//
// The policy ("first Camera with active === true, otherwise first Camera
// found") used to live inside `ThreeRenderer.refreshCamera`. Hoisting it
// into a System makes the choice visible in `window.__agf.snapshot()` (an
// agent can ask "which entity is the camera?") and makes future
// extensions — render targets per camera, priority-ordered draws — slot
// in as additional fields on the same marker.

import type { EntityId } from "../../core/ecs/types";
import type { System, SystemContext } from "../../core/systems/types";

export const CAMERA: string = "Camera";
export const ACTIVE_CAMERA: string = "ActiveCamera";
export const LOCAL_TO_WORLD: string = "LocalToWorld";

type CameraComponent = {
  kind: "perspective" | "orthographic";
  active?: boolean;
  fov?: number;
  near?: number;
  far?: number;
};

export type CameraSyncSystemHandle = System & {
  /** Last picked active camera entity, or undefined if no camera is present. */
  activeEntityId(): EntityId | undefined;
};

/**
 * Build a `frameUpdate` System that picks the active camera and tags it
 * with `ActiveCamera` ({}). The previous active marker is removed if the
 * pick changed. The adapter binding (acquireCamera / setCameraParams /
 * setCameraTransform / setActiveCamera) is still owned by ThreeRenderer
 * during the M21 transition — `M21-c` only moves the *policy*, not the
 * Three.js calls. M21-f will move the adapter calls out.
 */
export function createCameraSyncSystem(options: { name?: string } = {}): CameraSyncSystemHandle {
  const name = options.name ?? "render.camera-sync";
  let lastActive: EntityId | undefined;

  const frameUpdate = (context: SystemContext): void => {
    const world = context.world;
    const cameras = world.query([CAMERA]);

    // Pick: first explicit active === true; else first camera entity.
    let picked: EntityId | undefined;
    for (const id of cameras) {
      const component = world.getComponent<CameraComponent>(id, CAMERA);
      if (component?.active === true) {
        picked = id;
        break;
      }
    }
    if (picked === undefined) {
      picked = cameras[0];
    }

    // Clear the prior marker if the pick moved.
    if (lastActive !== undefined && lastActive !== picked) {
      if (world.hasComponent(lastActive, ACTIVE_CAMERA)) {
        world.removeComponent(lastActive, ACTIVE_CAMERA);
      }
    }

    if (picked !== undefined) {
      // Idempotent: setComponent on the same payload bumps revision but
      // doesn't change marker shape. Downstream readers only care about
      // presence/absence anyway.
      world.setComponent(picked, ACTIVE_CAMERA, {});
    }

    // Sweep up stragglers: an unrelated entity could have an old
    // ActiveCamera marker (HMR, test fixture, manual command pipeline).
    // Keep exactly one.
    for (const id of world.query([ACTIVE_CAMERA])) {
      if (id !== picked) {
        world.removeComponent(id, ACTIVE_CAMERA);
      }
    }

    lastActive = picked;
  };

  return {
    name,
    frameUpdate,
    activeEntityId(): EntityId | undefined {
      return lastActive;
    }
  };
}
