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
const RAGDOLL_LIFETIME: ComponentName = "RagdollLifetime";
const RAGDOLL_BODY: ComponentName = "RagdollBody";
const RAGDOLL_JOINT: ComponentName = "RagdollJoint";
const RAGDOLL_MESH_BINDING: ComponentName = "RagdollMeshBinding";
const TRANSFORM: ComponentName = "Transform";

type SpawnRequest = {
  templateKey: string;
  impulse?: readonly [number, number, number];
  meshMap?: Readonly<Record<string, EntityId>>;
  bodyPoses?: Readonly<Record<string, BodyPose>>;
};

type BodyPose = {
  position: readonly [number, number, number];
  rotation?: readonly [number, number, number];
};

const DEG2RAD = Math.PI / 180;

// S136-hotfix — Rapier InteractionGroups packed value:
//   high 16 bits = membership mask  → bit 1 ("ragdoll")
//   low  16 bits = filter mask      → bit 0 only ("default" only)
// Net effect: ragdoll bodies collide with default-group bodies (floor,
// walls, blocks) but NOT with other ragdoll bodies. Eliminates the
// adjacent-body jitter caused by overlapping template anchors
// (torso+upperArm capsules overlap by ~0.075 m and the solver was
// trying to push them apart against the shoulder joint every step).
const RAGDOLL_COLLISION_GROUPS = (0x0002 << 16) | 0x0001;

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
        req.meshMap,
        req.bodyPoses,
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
  meshMap: Readonly<Record<string, EntityId>> | undefined,
  bodyPoses: Readonly<Record<string, BodyPose>> | undefined,
  spawnedAt: number,
  nextBodyId: () => number,
  nextJointId: () => number
): void {
  const bodyEntities: Record<string, EntityId> = {};
  const bodyHandles: Record<string, BodyHandle> = {};
  // S137 — record each body's spawn pose so the joint loop below can
  // re-compute anchorB at non-rest poses; keeps joint constraints
  // satisfied on frame 1 instead of firing a corrective impulse.
  const bodySpawnPoses = new Map<string, { position: readonly [number, number, number]; rotationRad: readonly [number, number, number] }>();
  // S135-hotfix — impulse used to be applied verbatim to every body, so a
  // 10-body bomber template multiplied the requested momentum 10× and the
  // ragdoll launched like an atomic bomb (user playtest, 2026-05-25).
  // Apply it to the first body only ("root" by convention — torso for the
  // kaboom-bomber template). Joints transmit the resulting acceleration
  // to the rest of the chain on subsequent ticks, which is the physically
  // correct behaviour for an impulse arriving at the bomber's centre of
  // mass.
  let impulseApplied = false;
  for (const def of template.bodies) {
    // S133 — pose-snapshot: if bodyPoses[def.name] is provided, use it as
    // the body's spawn pose; otherwise fall back to root.position +
    // template anchor. Rotation in bodyPoses is degrees (mirrors the
    // Transform component convention); convert to radians for Rapier.
    const pose = bodyPoses?.[def.name];
    let position: [number, number, number];
    let rotationRad: readonly [number, number, number] | undefined;
    if (pose !== undefined && Array.isArray(pose.position) && pose.position.length === 3) {
      position = [pose.position[0] ?? 0, pose.position[1] ?? 0, pose.position[2] ?? 0];
      if (pose.rotation !== undefined && Array.isArray(pose.rotation) && pose.rotation.length === 3) {
        rotationRad = [
          (pose.rotation[0] ?? 0) * DEG2RAD,
          (pose.rotation[1] ?? 0) * DEG2RAD,
          (pose.rotation[2] ?? 0) * DEG2RAD
        ];
      }
    } else {
      const anchor = def.anchor ?? [0, 0, 0];
      position = [
        (origin[0] ?? 0) + (anchor[0] ?? 0),
        (origin[1] ?? 0) + (anchor[1] ?? 0),
        (origin[2] ?? 0) + (anchor[2] ?? 0)
      ];
    }
    const handle = adapter.acquireBody({
      kind: "dynamic",
      position,
      ...(rotationRad !== undefined ? { rotation: rotationRad } : {}),
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
    adapter.acquireCollider(handle, {
      ...colliderSpecFor(def),
      collisionGroups: RAGDOLL_COLLISION_GROUPS
    });
    if (impulse !== undefined && !impulseApplied) {
      adapter.applyImpulse(handle, impulse);
      impulseApplied = true;
    }
    const bodyEntityId: EntityId = `${rootId}.body.${def.name}.${nextBodyId()}`;
    world.addEntity(bodyEntityId);
    // Body entity's initial Transform mirrors the spawn pose so the next
    // sync tick has the right starting reference. Rotation is stored in
    // degrees on the Transform component, mirroring the rest of the
    // engine.
    const initialTransform: { position: [number, number, number]; rotation?: [number, number, number] } = {
      position
    };
    if (pose?.rotation !== undefined && Array.isArray(pose.rotation) && pose.rotation.length === 3) {
      initialTransform.rotation = [pose.rotation[0] ?? 0, pose.rotation[1] ?? 0, pose.rotation[2] ?? 0];
    }
    world.setComponent(bodyEntityId, TRANSFORM, initialTransform);
    world.setComponent(bodyEntityId, RAGDOLL_BODY, {
      ownerRoot: rootId,
      bodyName: def.name,
      rapierBodyHandle: handle
    });
    bodyEntities[def.name] = bodyEntityId;
    bodyHandles[def.name] = handle;
    bodySpawnPoses.set(def.name, {
      position,
      rotationRad: rotationRad ?? [0, 0, 0]
    });
  }

  const jointEntities: EntityId[] = [];
  for (const jointDef of template.joints ?? []) {
    const a = bodyHandles[jointDef.bodyA];
    const b = bodyHandles[jointDef.bodyB];
    if (a === undefined || b === undefined) continue;
    // S137 — pose-aware joint anchors. Compute corrected anchorB so the
    // joint world position derived from bodyA's pose equals the one
    // derived from bodyB's pose at frame 0. Without this the constraint
    // solver fires a corrective impulse whenever bodyPoses places the
    // bodies in a non-rest configuration (e.g. dead-mid-walk bomber),
    // producing a visible spring on frame 1.
    const correctedJoint = correctJointAnchors(
      jointDef,
      bodySpawnPoses.get(jointDef.bodyA),
      bodySpawnPoses.get(jointDef.bodyB)
    );
    const jointHandle = acquireJointFromDef(adapter, a, b, correctedJoint);
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

  // S131 mesh handover — for each [bodyName → meshEntityId] in the
  // optional meshMap, write RagdollMeshBinding on the mesh entity so
  // RagdollSyncSystem can mirror the body's Transform onto the mesh.
  // Silently skip entries with unknown bodies or non-existent mesh
  // entities — a partial map still works.
  const meshEntities: EntityId[] = [];
  if (meshMap !== undefined) {
    for (const [bodyName, meshEntityId] of Object.entries(meshMap)) {
      const bodyEntity = bodyEntities[bodyName];
      if (bodyEntity === undefined) continue;
      if (!world.hasEntity(meshEntityId)) continue;
      world.setComponent(meshEntityId, RAGDOLL_MESH_BINDING, {
        ragdollRoot: rootId,
        bodyName,
        bodyEntity
      });
      meshEntities.push(meshEntityId);
    }
  }

  world.setComponent(rootId, RAGDOLL_STATE, {
    templateKey,
    spawnedAt,
    bodyEntities,
    jointEntities,
    meshEntities
  });
  world.setComponent(rootId, RAGDOLL_ACTIVE, {});
  // S136 — auto-teardown countdown. Only stamped when the template
  // declares lifetimeSeconds; otherwise the project handles teardown
  // explicitly via RagdollTeardownRequest.
  if (template.lifetimeSeconds !== undefined && template.lifetimeSeconds > 0) {
    world.setComponent(rootId, RAGDOLL_LIFETIME, {
      secondsRemaining: template.lifetimeSeconds
    });
  }
}

// --- S137 joint-anchor correction ----------------------------------
//
// At spawn time the joint anchor on body A (in A's local frame) maps
// to a world position via bodyA.pose. The joint anchor on body B must
// map to the SAME world position via bodyB.pose, otherwise Rapier's
// constraint solver fires a corrective impulse on frame 1.
//
// For the rest-pose case (no bodyPoses, no body rotation) the math is
// a no-op — the template anchorB already satisfies the constraint and
// the corrected anchor equals the template anchor. The correction only
// matters when bodyPoses places bodies in non-rest configurations
// (e.g. mid-walk pose snapshotted at the death frame).

type SpawnPose = {
  position: readonly [number, number, number];
  rotationRad: readonly [number, number, number];
};

type Quat = { x: number; y: number; z: number; w: number };

function eulerXYZRadToQuat(rotation: readonly [number, number, number]): Quat {
  const c1 = Math.cos(rotation[0] / 2);
  const c2 = Math.cos(rotation[1] / 2);
  const c3 = Math.cos(rotation[2] / 2);
  const s1 = Math.sin(rotation[0] / 2);
  const s2 = Math.sin(rotation[1] / 2);
  const s3 = Math.sin(rotation[2] / 2);
  return {
    x: s1 * c2 * c3 + c1 * s2 * s3,
    y: c1 * s2 * c3 - s1 * c2 * s3,
    z: c1 * c2 * s3 + s1 * s2 * c3,
    w: c1 * c2 * c3 - s1 * s2 * s3
  };
}

function rotateVec3ByQuat(v: readonly [number, number, number], q: Quat): [number, number, number] {
  // Standard formula: v' = q * v * q^-1, expanded for performance.
  const ix = q.w * v[0] + q.y * v[2] - q.z * v[1];
  const iy = q.w * v[1] + q.z * v[0] - q.x * v[2];
  const iz = q.w * v[2] + q.x * v[1] - q.y * v[0];
  const iw = -q.x * v[0] - q.y * v[1] - q.z * v[2];
  return [
    ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x
  ];
}

function correctJointAnchors(
  def: RagdollJointDef,
  poseA: SpawnPose | undefined,
  poseB: SpawnPose | undefined
): RagdollJointDef {
  if (poseA === undefined || poseB === undefined) return def;
  const templateAnchorA = def.anchorA ?? [0, 0, 0];
  const templateAnchorB = def.anchorB ?? [0, 0, 0];
  const qA = eulerXYZRadToQuat(poseA.rotationRad);
  const qB = eulerXYZRadToQuat(poseB.rotationRad);
  // World position of anchor A: bodyA.position + qA * anchorA.
  const aWorldOffset = rotateVec3ByQuat(templateAnchorA, qA);
  const jointWorld: [number, number, number] = [
    poseA.position[0]! + aWorldOffset[0]!,
    poseA.position[1]! + aWorldOffset[1]!,
    poseA.position[2]! + aWorldOffset[2]!
  ];
  // Inverse-rotate the offset from B to that world position into B's
  // local space. Inverse of a unit quaternion is the conjugate.
  const qBInv: Quat = { x: -qB.x, y: -qB.y, z: -qB.z, w: qB.w };
  const offset: [number, number, number] = [
    jointWorld[0] - poseB.position[0]!,
    jointWorld[1] - poseB.position[1]!,
    jointWorld[2] - poseB.position[2]!
  ];
  const correctedAnchorB = rotateVec3ByQuat(offset, qBInv);
  // Sanity check: rest pose without rotation must be a no-op. Tolerate
  // 1e-6 numerical drift; otherwise fall back to the template anchor to
  // avoid surprising callers when the math degenerates.
  const drift = Math.max(
    Math.abs(correctedAnchorB[0] - templateAnchorB[0]!),
    Math.abs(correctedAnchorB[1] - templateAnchorB[1]!),
    Math.abs(correctedAnchorB[2] - templateAnchorB[2]!)
  );
  if (
    poseA.rotationRad[0] === 0 &&
    poseA.rotationRad[1] === 0 &&
    poseA.rotationRad[2] === 0 &&
    poseB.rotationRad[0] === 0 &&
    poseB.rotationRad[1] === 0 &&
    poseB.rotationRad[2] === 0 &&
    drift < 1e-6
  ) {
    // Rest-pose path. Keep the template anchor verbatim so existing
    // tests + downstream consumers see no change.
    return def;
  }
  return { ...def, anchorB: correctedAnchorB };
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
