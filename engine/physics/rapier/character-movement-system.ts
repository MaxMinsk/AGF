// M24-character: collision-resolved kinematic movement.
//
// Runs in fixedUpdate BEFORE PhysicsSyncSystem. For each entity carrying
// CharacterController3D + RigidBody3D (kinematicPosition), the system:
//
//   1. Reads the current ECS Transform.position (what gameplay just
//      wrote — e.g. PlayerInputSystem) and the body's last-known
//      Rapier position.
//   2. Computes `desired = Transform - body` + gravity * fixedDt.
//   3. Calls `adapter.computeCharacterMovement(controller, collider,
//      desired)` to resolve collisions (collide-and-slide, autostep,
//      snap-to-ground).
//   4. Applies the resolved movement via
//      `adapter.setBodyNextKinematicTranslation`. PhysicsSyncSystem.step
//      then advances the body to that target on the same step.
//   5. Writes the resolved position back onto ECS Transform so the next
//      frame's gameplay reads the post-collision state.
//
// Teleports (large position deltas) bypass the controller — Rapier's
// `setBodyTransform` is called directly so the body jumps to the new
// position without trying to slide a 50-metre move through a wall.
//
// PhysicsSyncSystem.phase3 (kinematic push via setBodyTransform) MUST
// skip entities owned by this system; the writeback path
// (PhysicsSyncSystem.phase5) handles the kinematic-with-controller
// position sync.

import type { ComponentName, EntityId } from "../../core/ecs/types";
import type { QueryHandle, World } from "../../core/ecs/world";
import type { System, SystemContext } from "../../core/systems/types";
import type {
  CharacterControllerHandle,
  CharacterControllerSpec,
  RapierAdapter
} from "./rapier-adapter";
import type { PhysicsBodyRegistry } from "./physics-body-registry";

export const CHARACTER_CONTROLLER_3D: ComponentName = "CharacterController3D";
export const RIGID_BODY_3D: ComponentName = "RigidBody3D";
export const TRANSFORM: ComponentName = "Transform";

type Vec3 = ReadonlyArray<number>;

type TransformComponent = {
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
};

type RigidBody3DComponent = { type: string };

type CharacterController3DComponent = {
  offset?: number;
  maxSlopeDegrees?: number;
  snapToGroundDistance?: number;
  applyImpulsesToDynamicBodies?: boolean;
  mass?: number;
  /**
   * When the Transform position jumps by more than this distance in a
   * single fixed step, the system treats it as a teleport and bypasses
   * the controller's collide-and-slide pass. Defaults to 1 metre.
   * Runtime-only; not in the JSON schema.
   */
  teleportThreshold?: number;
};

const DEFAULT_TELEPORT_THRESHOLD = 1;
const DEG2RAD = Math.PI / 180;

export type CharacterMovementSystemHandle = System & {
  /** Live controller count — for diagnostics. */
  size(): number;
};

export type CharacterMovementSystemDeps = {
  registry: PhysicsBodyRegistry;
  adapter: RapierAdapter;
  /** World gravity vector in m/s² — gets multiplied by fixedDt each step. */
  gravity: readonly [number, number, number];
};

export function createCharacterMovementSystem(
  deps: CharacterMovementSystemDeps,
  options: { name?: string } = {}
): CharacterMovementSystemHandle {
  const name = options.name ?? "physics.character";
  const controllers = new Map<EntityId, CharacterControllerHandle>();
  let cachedWorld: World | undefined;
  let charQuery: QueryHandle | undefined;

  const buildSpec = (config: CharacterController3DComponent): CharacterControllerSpec => {
    const spec: CharacterControllerSpec = {};
    if (config.offset !== undefined) spec.offset = config.offset;
    if (config.maxSlopeDegrees !== undefined) spec.maxSlope = config.maxSlopeDegrees * DEG2RAD;
    if (config.snapToGroundDistance !== undefined && config.snapToGroundDistance > 0) {
      spec.snapToGround = config.snapToGroundDistance;
    }
    if (config.applyImpulsesToDynamicBodies !== undefined) {
      spec.applyImpulsesToDynamicBodies = config.applyImpulsesToDynamicBodies;
    }
    if (config.mass !== undefined) spec.characterMass = config.mass;
    return spec;
  };

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      charQuery = world.createQuery([CHARACTER_CONTROLLER_3D, RIGID_BODY_3D, TRANSFORM]);
      cachedWorld = world;
      // World swap (HMR / scene change). Release controllers; bodies are
      // owned by the body registry, which clears separately.
      for (const handle of controllers.values()) {
        deps.adapter.releaseCharacterController(handle);
      }
      controllers.clear();
    }
    const fixedDt = context.time.fixedDt;
    const dtGravity: readonly [number, number, number] = [
      deps.gravity[0] * fixedDt,
      deps.gravity[1] * fixedDt,
      deps.gravity[2] * fixedDt
    ];

    const ids = charQuery!.run();
    // Release controllers for entities that no longer carry the
    // component (e.g. component removed at runtime).
    const live = new Set<EntityId>(ids);
    for (const [id, handle] of [...controllers]) {
      if (!live.has(id)) {
        deps.adapter.releaseCharacterController(handle);
        controllers.delete(id);
      }
    }

    for (const id of ids) {
      const body = deps.registry.handleFor(id);
      const collider = deps.registry.colliderFor(id);
      if (body === undefined || collider === undefined) continue;
      const rb = world.getComponent<RigidBody3DComponent>(id, RIGID_BODY_3D);
      if (rb?.type !== "kinematicPosition") continue;
      const config = world.getComponent<CharacterController3DComponent>(id, CHARACTER_CONTROLLER_3D);
      if (config === undefined) continue;
      const transform = world.getComponent<TransformComponent>(id, TRANSFORM);
      if (transform === undefined) continue;

      let controller = controllers.get(id);
      if (controller === undefined) {
        controller = deps.adapter.acquireCharacterController(buildSpec(config));
        controllers.set(id, controller);
      }

      const tx = transform.position?.[0] ?? 0;
      const ty = transform.position?.[1] ?? 0;
      const tz = transform.position?.[2] ?? 0;
      const bodyPos = deps.adapter.getBodyTranslation(body);
      if (bodyPos === undefined) continue;
      const dx = tx - bodyPos[0];
      const dy = ty - bodyPos[1];
      const dz = tz - bodyPos[2];

      const teleportThreshold = config.teleportThreshold ?? DEFAULT_TELEPORT_THRESHOLD;
      const distSquared = dx * dx + dy * dy + dz * dz;
      if (distSquared > teleportThreshold * teleportThreshold) {
        // Treat as teleport. Hard-set the body so collision events fire
        // at the new location on the next step.
        deps.adapter.setBodyTransform(body, [tx, ty, tz]);
        continue;
      }

      const desired: readonly [number, number, number] = [
        dx + dtGravity[0],
        dy + dtGravity[1],
        dz + dtGravity[2]
      ];
      const result = deps.adapter.computeCharacterMovement(controller, collider, desired);
      if (result === undefined) continue;
      const nextX = bodyPos[0] + result.movement[0];
      const nextY = bodyPos[1] + result.movement[1];
      const nextZ = bodyPos[2] + result.movement[2];
      deps.adapter.setBodyNextKinematicTranslation(body, [nextX, nextY, nextZ]);
      // Pre-mirror Transform so any frame-update system reading Transform
      // in the same tick sees the resolved position. PhysicsSyncSystem
      // phase 5 will also overwrite this from the post-step body
      // position; the values agree because Rapier moves the body exactly
      // to setBodyNextKinematicTranslation on the next step.
      world.setComponent(id, TRANSFORM, {
        ...transform,
        position: [nextX, nextY, nextZ]
      });
    }
  };

  return {
    name,
    fixedUpdate,
    size(): number {
      return controllers.size;
    }
  };
}
