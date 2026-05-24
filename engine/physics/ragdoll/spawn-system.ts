// S128 KABOOM-RAGDOLL-MODULE — spawn system.
//
// Consumes RagdollSpawnRequest transients on skeleton-root entities,
// looks up the registered RagdollTemplate by key, and creates the
// corresponding Rapier rigid bodies + joints + ECS body / joint
// entities. The root entity gains a RagdollState component (per-
// instance state) + a RagdollActive marker (animation systems honour
// this to stop driving the skeleton while the ragdoll is in flight).
//
// Mesh handover is intentionally OUT of scope — projects decide how
// to bind their visible meshes to the body entities (e.g. by writing
// a parent-of relation, or by re-parenting Three meshes in the
// renderer). The body entities ship with Transform only.

import type { ComponentName, EntityId } from "../../core/ecs/types";
import type { QueryHandle, World } from "../../core/ecs/world";
import type { System, SystemContext } from "../../core/systems/types";
import type { BodyHandle, JointHandle, RapierAdapter } from "../rapier/rapier-adapter";
import {
  getRagdollTemplate,
  type RagdollBodyDef,
  type RagdollJointDef,
  type RagdollTemplate
} from "./template-registry";

const RAGDOLL_SPAWN_REQUEST: ComponentName = "RagdollSpawnRequest";
const RAGDOLL_STATE: ComponentName = "RagdollState";
const RAGDOLL_ACTIVE: ComponentName = "RagdollActive";
const RAGDOLL_BODY: ComponentName = "RagdollBody";
const RAGDOLL_JOINT: ComponentName = "RagdollJoint";
const TRANSFORM: ComponentName = "Transform";

type SpawnRequest = {
  templateKey: string;
  impulse?: readonly [number, number, number];
};

type TransformComponent = {
  position?: readonly [number, number, number];
};

export type RagdollSpawnSystemOptions = {
  adapter: RapierAdapter;
  /** Optional time provider — defaults to performance.now()/1000. */
  nowSeconds?: () => number;
  name?: string;
};

export function createRagdollSpawnSystem(options: RagdollSpawnSystemOptions): System {
  const name = options.name ?? "ragdoll.spawn";
  const nowSeconds =
    options.nowSeconds ??
    ((): number => (typeof performance !== "undefined" ? performance.now() / 1000 : Date.now() / 1000));
  const adapter = options.adapter;

  let cachedWorld: World | undefined;
  let requests: QueryHandle | undefined;
  let bodyCounter = 0;
  let jointCounter = 0;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      requests = world.createQuery([RAGDOLL_SPAWN_REQUEST]);
      cachedWorld = world;
    }
    const requestEntities = [...requests!.run()];
    for (const rootId of requestEntities) {
      const req = world.getComponent<SpawnRequest>(rootId, RAGDOLL_SPAWN_REQUEST);
      // Always strip the request — even on a refused spawn — so the
      // root doesn't keep re-trying every frame.
      world.removeComponent(rootId, RAGDOLL_SPAWN_REQUEST);
      if (req === undefined) continue;
      const template = getRagdollTemplate(req.templateKey);
      if (template === undefined) {
        // Unknown template — silent skip. A future story can pipe this
        // to runtime.diagnostics for visibility.
        continue;
      }
      const rootTransform = world.getComponent<TransformComponent>(rootId, TRANSFORM);
      const origin = rootTransform?.position ?? [0, 0, 0];
      spawnRagdoll(
        world,
        adapter,
        rootId,
        req.templateKey,
        template,
        origin,
        req.impulse,
        nowSeconds(),
        () => {
          bodyCounter += 1;
          return bodyCounter;
        },
        () => {
          jointCounter += 1;
          return jointCounter;
        }
      );
    }
  };

  return { name, fixedUpdate };
}

function spawnRagdoll(
  world: World,
  adapter: RapierAdapter,
  rootId: EntityId,
  templateKey: string,
  template: RagdollTemplate,
  origin: readonly [number, number, number],
  impulse: readonly [number, number, number] | undefined,
  spawnedAt: number,
  nextBodyId: () => number,
  nextJointId: () => number
): void {
  const bodyEntities: Record<string, EntityId> = {};
  const bodyHandles: Record<string, BodyHandle> = {};
  for (const def of template.bodies) {
    const anchor = def.anchor ?? [0, 0, 0];
    const position: [number, number, number] = [
      (origin[0] ?? 0) + (anchor[0] ?? 0),
      (origin[1] ?? 0) + (anchor[1] ?? 0),
      (origin[2] ?? 0) + (anchor[2] ?? 0)
    ];
    const handle = adapter.acquireBody({
      kind: "dynamic",
      position,
      ...(def.mass !== undefined ? { mass: def.mass } : {}),
      ...(def.linearDamping !== undefined
        ? { linearDamping: def.linearDamping }
        : template.linearDamping !== undefined
          ? { linearDamping: template.linearDamping }
          : {}),
      ...(def.angularDamping !== undefined
        ? { angularDamping: def.angularDamping }
        : template.angularDamping !== undefined
          ? { angularDamping: template.angularDamping }
          : {})
    });
    adapter.acquireCollider(handle, colliderSpecFor(def));
    if (impulse !== undefined) {
      adapter.applyImpulse(handle, impulse);
    }
    const bodyEntityId: EntityId = `${rootId}.body.${def.name}.${nextBodyId()}`;
    world.addEntity(bodyEntityId);
    world.setComponent(bodyEntityId, TRANSFORM, { position });
    world.setComponent(bodyEntityId, RAGDOLL_BODY, {
      ownerRoot: rootId,
      bodyName: def.name,
      rapierBodyHandle: handle
    });
    bodyEntities[def.name] = bodyEntityId;
    bodyHandles[def.name] = handle;
  }

  const jointEntities: EntityId[] = [];
  for (const jointDef of template.joints ?? []) {
    const a = bodyHandles[jointDef.bodyA];
    const b = bodyHandles[jointDef.bodyB];
    if (a === undefined || b === undefined) continue;
    const jointHandle = acquireJointFromDef(adapter, a, b, jointDef);
    if (jointHandle === undefined) continue;
    const jointEntityId: EntityId = `${rootId}.joint.${jointDef.name}.${nextJointId()}`;
    world.addEntity(jointEntityId);
    world.setComponent(jointEntityId, RAGDOLL_JOINT, {
      ownerRoot: rootId,
      jointName: jointDef.name,
      rapierJointHandle: jointHandle
    });
    jointEntities.push(jointEntityId);
  }

  world.setComponent(rootId, RAGDOLL_STATE, {
    templateKey,
    spawnedAt,
    bodyEntities,
    jointEntities
  });
  world.setComponent(rootId, RAGDOLL_ACTIVE, {});
}

function colliderSpecFor(def: RagdollBodyDef): {
  kind: "box" | "sphere" | "capsule";
  size?: [number, number, number];
  radius?: number;
  halfHeight?: number;
} {
  switch (def.shape) {
    case "box":
      return { kind: "box", size: [def.dimensions[0], def.dimensions[1], def.dimensions[2]] };
    case "sphere":
      return { kind: "sphere", radius: def.dimensions[0] };
    case "capsule":
      return { kind: "capsule", radius: def.dimensions[0], halfHeight: def.dimensions[1] };
  }
}

function acquireJointFromDef(
  adapter: RapierAdapter,
  bodyA: BodyHandle,
  bodyB: BodyHandle,
  def: RagdollJointDef
): JointHandle | undefined {
  const anchorA = def.anchorA ?? [0, 0, 0];
  const anchorB = def.anchorB ?? [0, 0, 0];
  switch (def.type) {
    case "ball":
      return adapter.acquireJoint(bodyA, bodyB, { type: "ball", anchorA, anchorB });
    case "fixed":
      return adapter.acquireJoint(bodyA, bodyB, { type: "fixed", anchorA, anchorB });
    case "revolute":
      if (def.axis === undefined) return undefined;
      return adapter.acquireJoint(bodyA, bodyB, {
        type: "revolute",
        anchorA,
        anchorB,
        axis: def.axis
      });
  }
}
