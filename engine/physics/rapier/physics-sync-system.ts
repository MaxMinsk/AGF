// M24-sync: ECS ↔ Rapier sync. Runs in fixed update (NOT frame update).
// Pipeline per step:
//
//   1. consume world.consumeDirty('RigidBody3D') / 'Collider3D' → release
//      removed entries + acquire newcomers via the registry.
//   2. For kinematic bodies, push the ECS Transform onto Rapier before the
//      step (kinematic = ECS owns the position).
//   3. adapter.step() — advance the world by fixedDt.
//   4. For dynamic bodies, read Rapier translation/rotation back into the
//      ECS Transform. (Fixed bodies never write back.)
//
// What this system does NOT cover yet (deferred):
//   - M24-sensors: collision events (Rapier event queue, runtime-only
//     OverlappingTriggers3D / Grounded3D).
//   - M24-raycast: physics.raycast API.
//   - M24-character: kinematic capsule controller.
//
// AGENTS.md rules in effect: cached createQuery, no per-frame Three.js
// resource allocation, no `world.query` in hot path (the registry is the
// hot lookup), Rapier types stay inside this folder.

import type { ComponentName, EntityId } from "../../core/ecs/types";

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const degToRad = (d: number): number => d * DEG2RAD;
const radToDeg = (r: number): number => r * RAD2DEG;
import type { QueryHandle, World } from "../../core/ecs/world";
import type { System, SystemContext } from "../../core/systems/types";
import type {
  BodyAcquireSpec,
  BodyKind,
  ColliderAcquireSpec,
  ColliderKind
} from "./rapier-adapter";
import type { PhysicsBodyRegistry } from "./physics-body-registry";

export const RIGID_BODY_3D: ComponentName = "RigidBody3D";
export const COLLIDER_3D: ComponentName = "Collider3D";
export const TRANSFORM: ComponentName = "Transform";
/** M24-sensors: runtime-only components written by PhysicsSyncSystem from Rapier collision events. Hidden from default __agf.snapshot(). Never authored. */
export const CURRENT_CONTACTS_3D: ComponentName = "CurrentContacts3D";
export const OVERLAPPING_TRIGGERS_3D: ComponentName = "OverlappingTriggers3D";

type Vec3 = ReadonlyArray<number>;

type TransformComponent = {
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
};

type RigidBody3DComponent = {
  type: BodyKind;
  mass?: number;
  gravityScale?: number;
  linearDamping?: number;
  angularDamping?: number;
  lockRotations?: boolean;
  ccd?: boolean;
  canSleep?: boolean;
};

type Collider3DComponent = {
  kind: ColliderKind;
  size?: Vec3;
  radius?: number;
  halfHeight?: number;
  offset?: Vec3;
  rotation?: Vec3;
  sensor?: boolean;
  friction?: number;
  restitution?: number;
};

export type PhysicsSyncSystemHandle = System & {
  size(): number;
};

export function createPhysicsSyncSystem(
  registry: PhysicsBodyRegistry,
  adapter: import("./rapier-adapter").RapierAdapter,
  options: { name?: string } = {}
): PhysicsSyncSystemHandle {
  const name = options.name ?? "physics.sync";
  let cachedWorld: World | undefined;
  let bodyQuery: QueryHandle | undefined;
  /** Last body kind we acquired per entity. Kind change → release + reacquire. */
  const acquiredKind = new Map<EntityId, BodyKind>();
  // M24-interpolation: state at the END of the previous + current fixed
  // step. frameUpdate lerps between them by `time.physicsAlpha` so a
  // 120 Hz display doesn't show 60 Hz pulses for dynamic bodies.
  type Vec3T = readonly [number, number, number];
  type RotEulerDeg = readonly [number, number, number];
  type InterpEntry = {
    prevPos: Vec3T;
    currPos: Vec3T;
    prevRot: RotEulerDeg | undefined;
    currRot: RotEulerDeg | undefined;
  };
  const interpolation = new Map<EntityId, InterpEntry>();

  const buildBodySpec = (
    body: RigidBody3DComponent,
    transform: TransformComponent | undefined
  ): BodyAcquireSpec => {
    const pos = transform?.position;
    const rot = transform?.rotation;
    const spec: BodyAcquireSpec = {
      kind: body.type,
      position: [pos?.[0] ?? 0, pos?.[1] ?? 0, pos?.[2] ?? 0]
    };
    if (rot !== undefined) {
      spec.rotation = [
        degToRad(rot[0] ?? 0),
        degToRad(rot[1] ?? 0),
        degToRad(rot[2] ?? 0)
      ];
    }
    if (body.mass !== undefined) spec.mass = body.mass;
    if (body.gravityScale !== undefined) spec.gravityScale = body.gravityScale;
    if (body.linearDamping !== undefined) spec.linearDamping = body.linearDamping;
    if (body.angularDamping !== undefined) spec.angularDamping = body.angularDamping;
    if (body.lockRotations !== undefined) spec.lockRotations = body.lockRotations;
    if (body.ccd !== undefined) spec.ccd = body.ccd;
    if (body.canSleep !== undefined) spec.canSleep = body.canSleep;
    return spec;
  };

  const buildColliderSpec = (collider: Collider3DComponent): ColliderAcquireSpec => {
    const spec: ColliderAcquireSpec = { kind: collider.kind };
    if (collider.size !== undefined) {
      spec.size = [collider.size[0] ?? 1, collider.size[1] ?? 1, collider.size[2] ?? 1];
    }
    if (collider.radius !== undefined) spec.radius = collider.radius;
    if (collider.halfHeight !== undefined) spec.halfHeight = collider.halfHeight;
    if (collider.offset !== undefined) {
      spec.offset = [collider.offset[0] ?? 0, collider.offset[1] ?? 0, collider.offset[2] ?? 0];
    }
    if (collider.rotation !== undefined) {
      spec.rotation = [
        degToRad(collider.rotation[0] ?? 0),
        degToRad(collider.rotation[1] ?? 0),
        degToRad(collider.rotation[2] ?? 0)
      ];
    }
    if (collider.sensor !== undefined) spec.sensor = collider.sensor;
    if (collider.friction !== undefined) spec.friction = collider.friction;
    if (collider.restitution !== undefined) spec.restitution = collider.restitution;
    return spec;
  };

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      bodyQuery = world.createQuery([RIGID_BODY_3D]);
      cachedWorld = world;
      // World swap (HMR / scene change). Drop everything; the new world's
      // fresh dirty queue will trigger re-acquire below.
      registry.clear();
      acquiredKind.clear();
    }

    const liveBodies = new Set<EntityId>(bodyQuery!.run());

    // Phase 1: release entities that lost their RigidBody3D.
    for (const id of [...registry.entityIds()]) {
      if (!liveBodies.has(id)) {
        registry.release(id);
        acquiredKind.delete(id);
      }
    }

    // Phase 2: acquire newcomers + re-acquire on kind change.
    for (const id of liveBodies) {
      const body = world.getComponent<RigidBody3DComponent>(id, RIGID_BODY_3D);
      if (body === undefined) continue;
      const previousKind = acquiredKind.get(id);
      if (previousKind !== undefined && previousKind !== body.type) {
        registry.release(id);
        acquiredKind.delete(id);
      }
      if (registry.handleFor(id) === undefined) {
        const transform = world.getComponent<TransformComponent>(id, TRANSFORM);
        registry.acquireFor(id, buildBodySpec(body, transform));
        acquiredKind.set(id, body.type);
        const collider = world.getComponent<Collider3DComponent>(id, COLLIDER_3D);
        if (collider !== undefined) {
          registry.setCollider(id, buildColliderSpec(collider));
        }
      }
    }

    // Phase 3: kinematic ECS-push → Rapier (before step).
    for (const id of liveBodies) {
      const body = world.getComponent<RigidBody3DComponent>(id, RIGID_BODY_3D);
      if (body?.type !== "kinematicPosition") continue;
      const handle = registry.handleFor(id);
      if (handle === undefined) continue;
      const transform = world.getComponent<TransformComponent>(id, TRANSFORM);
      if (transform === undefined) continue;
      const pos = transform.position;
      const rot = transform.rotation;
      adapter.setBodyTransform(
        handle,
        [pos?.[0] ?? 0, pos?.[1] ?? 0, pos?.[2] ?? 0],
        rot !== undefined
          ? [
              degToRad(rot[0] ?? 0),
              degToRad(rot[1] ?? 0),
              degToRad(rot[2] ?? 0)
            ]
          : undefined
      );
    }

    // Phase 4: advance Rapier.
    adapter.step();

    // Phase 4b (M24-sensors): drain collision events into runtime-only
    // components. We keep a frame-scoped pair set rather than a persistent
    // contact graph — v0 just exposes "who's currently overlapping who"
    // through OverlappingTriggers3D / CurrentContacts3D. Gameplay systems
    // turn that into commands (damage, pickup, etc.) on their own tick.
    const sensorOverlaps = new Map<EntityId, Set<EntityId>>();
    const solidContacts = new Map<EntityId, Set<EntityId>>();
    for (const event of adapter.drainEvents()) {
      const a = registry.entityForCollider(event.handle1);
      const b = registry.entityForCollider(event.handle2);
      if (a === undefined || b === undefined) continue;
      const aIsSensor = isSensorCollider(world, a);
      const bIsSensor = isSensorCollider(world, b);
      const target = aIsSensor || bIsSensor ? sensorOverlaps : solidContacts;
      if (event.started) {
        addPair(target, a, b);
      }
    }
    // Drop stale per-frame components on entities that no longer overlap
    // anything (consumer logic decides when to act on the most recent
    // started==true event; v0 doesn't model continuous "stay" events).
    writeContactComponents(world, OVERLAPPING_TRIGGERS_3D, sensorOverlaps);
    writeContactComponents(world, CURRENT_CONTACTS_3D, solidContacts);

    // Phase 5: dynamic Rapier → interpolation state. The frameUpdate
    // hook below lerps prev → curr by time.physicsAlpha and writes the
    // result onto Transform. Storing prev/curr instead of writing
    // Transform directly gives smooth visuals at refresh rates higher
    // than the fixed step (M24-interpolation).
    const liveInterpolated = new Set<EntityId>();
    for (const id of liveBodies) {
      const body = world.getComponent<RigidBody3DComponent>(id, RIGID_BODY_3D);
      if (body?.type !== "dynamic") continue;
      const handle = registry.handleFor(id);
      if (handle === undefined) continue;
      const pos = adapter.getBodyTranslation(handle);
      const rot = adapter.getBodyRotation(handle);
      if (pos === undefined) continue;
      const currPos: Vec3T = [pos[0], pos[1], pos[2]];
      const currRot: RotEulerDeg | undefined =
        rot === undefined
          ? undefined
          : [radToDeg(rot[0]), radToDeg(rot[1]), radToDeg(rot[2])];
      const previous = interpolation.get(id);
      interpolation.set(id, {
        prevPos: previous?.currPos ?? currPos,
        currPos,
        prevRot: previous?.currRot ?? currRot,
        currRot
      });
      liveInterpolated.add(id);
    }
    // Forget bodies that left the dynamic set so we don't leak entries
    // and we don't apply stale interpolation if a body becomes fixed.
    for (const id of [...interpolation.keys()]) {
      if (!liveInterpolated.has(id)) interpolation.delete(id);
    }
  };

  /**
   * M24-interpolation frame update. Reads `time.physicsAlpha` and
   * lerps the cached (prev, curr) pair into the ECS Transform once
   * per render frame.
   */
  const frameUpdate = (context: SystemContext): void => {
    if (interpolation.size === 0) return;
    const alpha = context.time.physicsAlpha ?? 0;
    const world = context.world;
    for (const [id, entry] of interpolation) {
      const transform = world.getComponent<TransformComponent>(id, TRANSFORM);
      const x = entry.prevPos[0] + (entry.currPos[0] - entry.prevPos[0]) * alpha;
      const y = entry.prevPos[1] + (entry.currPos[1] - entry.prevPos[1]) * alpha;
      const z = entry.prevPos[2] + (entry.currPos[2] - entry.prevPos[2]) * alpha;
      const next: TransformComponent = {
        ...transform,
        position: [x, y, z]
      };
      if (entry.currRot !== undefined && entry.prevRot !== undefined) {
        // Linear blend in degrees — fine for the small per-step rotation
        // deltas Rapier produces at 60 Hz. Full slerp would require
        // converting back to quaternions; skip until a visible artifact
        // shows up.
        next.rotation = [
          entry.prevRot[0] + (entry.currRot[0] - entry.prevRot[0]) * alpha,
          entry.prevRot[1] + (entry.currRot[1] - entry.prevRot[1]) * alpha,
          entry.prevRot[2] + (entry.currRot[2] - entry.prevRot[2]) * alpha
        ];
      }
      world.setComponent(id, TRANSFORM, next);
    }
  };

  return {
    name,
    fixedUpdate,
    frameUpdate,
    size(): number {
      return registry.size();
    }
  };
}

function isSensorCollider(world: World, entityId: EntityId): boolean {
  const collider = world.getComponent<Collider3DComponent>(entityId, COLLIDER_3D);
  return collider?.sensor === true;
}

function addPair(target: Map<EntityId, Set<EntityId>>, a: EntityId, b: EntityId): void {
  let setA = target.get(a);
  if (setA === undefined) {
    setA = new Set();
    target.set(a, setA);
  }
  setA.add(b);
  let setB = target.get(b);
  if (setB === undefined) {
    setB = new Set();
    target.set(b, setB);
  }
  setB.add(a);
}

function writeContactComponents(
  world: World,
  component: ComponentName,
  pairs: Map<EntityId, Set<EntityId>>
): void {
  for (const [entityId, partners] of pairs) {
    world.setComponent(entityId, component, { entities: [...partners] });
  }
}
