// S128 KABOOM-RAGDOLL-MODULE — teardown system.
//
// Two triggers: (1) explicit teardown via [RagdollState, RagdollTeardownRequest]
// on the root, and (2) cascading teardown when a root entity has been
// deleted but its body / joint entities still reference it.
//
// On either path: walk the body + joint entity lists from RagdollState,
// call adapter.releaseJoint then releaseBody (Rapier cleans the
// colliders attached to a body for us), then world.removeEntity for
// each body + joint entity, then strip RagdollState + RagdollActive
// + the teardown request from the root (if it still exists).

import type { ComponentName, EntityId } from "../../core/ecs/types";
import type { QueryHandle, World } from "../../core/ecs/world";
import type { System, SystemContext } from "../../core/systems/types";
import type { RapierAdapter } from "../rapier/rapier-adapter";

const RAGDOLL_STATE: ComponentName = "RagdollState";
const RAGDOLL_ACTIVE: ComponentName = "RagdollActive";
const RAGDOLL_BODY: ComponentName = "RagdollBody";
const RAGDOLL_JOINT: ComponentName = "RagdollJoint";
const RAGDOLL_MESH_BINDING: ComponentName = "RagdollMeshBinding";
const RAGDOLL_TEARDOWN_REQUEST: ComponentName = "RagdollTeardownRequest";

type RagdollStateComponent = {
  templateKey?: string;
  spawnedAt?: number;
  bodyEntities?: Record<string, EntityId>;
  jointEntities?: EntityId[];
  meshEntities?: EntityId[];
};

type RagdollBodyComponent = {
  ownerRoot?: string;
  bodyName?: string;
  rapierBodyHandle?: number;
};

type RagdollJointComponent = {
  ownerRoot?: string;
  jointName?: string;
  rapierJointHandle?: number;
};

export type RagdollTeardownSystemOptions = {
  adapter: RapierAdapter;
  name?: string;
};

export function createRagdollTeardownSystem(options: RagdollTeardownSystemOptions): System {
  const name = options.name ?? "ragdoll.teardown";
  const adapter = options.adapter;
  let cachedWorld: World | undefined;
  let teardownRequests: QueryHandle | undefined;
  let bodies: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      teardownRequests = world.createQuery([RAGDOLL_STATE, RAGDOLL_TEARDOWN_REQUEST]);
      bodies = world.createQuery([RAGDOLL_BODY]);
      cachedWorld = world;
    }
    // Path 1: explicit teardown on a root with both RagdollState +
    // RagdollTeardownRequest.
    const explicit = [...teardownRequests!.run()];
    for (const rootId of explicit) {
      const state = world.getComponent<RagdollStateComponent>(rootId, RAGDOLL_STATE);
      if (state !== undefined) disposeRagdoll(world, adapter, rootId, state);
      // Always clear the request transient.
      if (world.hasEntity(rootId)) {
        world.removeComponent(rootId, RAGDOLL_TEARDOWN_REQUEST);
      }
    }
    // Path 2: cascading teardown — body entities whose ownerRoot no
    // longer exists in the world. Group them so we dispose once per
    // missing root rather than once per orphaned body.
    const orphans = new Map<string, EntityId[]>();
    for (const bodyEntity of bodies!.run()) {
      const body = world.getComponent<RagdollBodyComponent>(bodyEntity, RAGDOLL_BODY);
      if (body?.ownerRoot === undefined) continue;
      if (world.hasEntity(body.ownerRoot)) continue;
      const list = orphans.get(body.ownerRoot) ?? [];
      list.push(bodyEntity);
      orphans.set(body.ownerRoot, list);
    }
    for (const [, bodyEntities] of orphans) {
      // Without RagdollState we don't know the joint list — but each
      // body entity already owns its Rapier handle, and Rapier auto-
      // cleans joints when one of their endpoint bodies is removed.
      for (const bodyEntity of bodyEntities) {
        const body = world.getComponent<RagdollBodyComponent>(bodyEntity, RAGDOLL_BODY);
        if (body?.rapierBodyHandle !== undefined) {
          adapter.releaseBody(body.rapierBodyHandle);
        }
        world.removeEntity(bodyEntity);
      }
    }
  };

  return { name, fixedUpdate };
}

function disposeRagdoll(
  world: World,
  adapter: RapierAdapter,
  rootId: EntityId,
  state: RagdollStateComponent
): void {
  // Joints first so their Rapier resources release while the bodies
  // are still around (Rapier doesn't mandate this order, but it makes
  // for fewer "removing a body with active joints" log lines).
  for (const jointEntity of state.jointEntities ?? []) {
    const joint = world.getComponent<RagdollJointComponent>(jointEntity, RAGDOLL_JOINT);
    if (joint?.rapierJointHandle !== undefined) {
      adapter.releaseJoint(joint.rapierJointHandle);
    }
    if (world.hasEntity(jointEntity)) world.removeEntity(jointEntity);
  }
  for (const bodyEntity of Object.values(state.bodyEntities ?? {})) {
    const body = world.getComponent<RagdollBodyComponent>(bodyEntity, RAGDOLL_BODY);
    if (body?.rapierBodyHandle !== undefined) {
      adapter.releaseBody(body.rapierBodyHandle);
    }
    if (world.hasEntity(bodyEntity)) world.removeEntity(bodyEntity);
  }
  // S131 — clear mesh bindings. Projects own the mesh entities so we
  // strip the binding component but leave the entity + its last
  // Transform alone.
  for (const meshEntity of state.meshEntities ?? []) {
    if (world.hasEntity(meshEntity)) {
      world.removeComponent(meshEntity, RAGDOLL_MESH_BINDING);
    }
  }
  if (world.hasEntity(rootId)) {
    world.removeComponent(rootId, RAGDOLL_STATE);
    world.removeComponent(rootId, RAGDOLL_ACTIVE);
  }
}
