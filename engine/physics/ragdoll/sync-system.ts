// S128 KABOOM-RAGDOLL-MODULE — sync system.
//
// Each fixedUpdate, after the physics step, copy each RagdollBody's
// Rapier transform back to its ECS Transform. Mirrors the static-body
// half of physics-sync-system.ts but scoped to the RagdollBody
// surface so this system doesn't depend on RigidBody3D.
//
// Note: this system writes Transform.position + Transform.rotation
// in Euler degrees (mirroring the existing engine convention) — the
// quat→euler conversion is identical to the one inside physics-sync-
// system's body-readback loop. Keeping a sibling copy here avoids a
// cross-module helper-export at this stage.

import type { ComponentName, EntityId } from "../../core/ecs/types";
import type { QueryHandle, World } from "../../core/ecs/world";
import type { System, SystemContext } from "../../core/systems/types";
import type { RapierAdapter } from "../rapier/rapier-adapter";

const RAGDOLL_BODY: ComponentName = "RagdollBody";
const RAGDOLL_MESH_BINDING: ComponentName = "RagdollMeshBinding";
const TRANSFORM: ComponentName = "Transform";
const RAD2DEG = 180 / Math.PI;

type RagdollBodyComponent = {
  ownerRoot: string;
  bodyName: string;
  rapierBodyHandle?: number;
};

type RagdollMeshBindingComponent = {
  ragdollRoot: EntityId;
  bodyName: string;
  bodyEntity: EntityId;
};

type TransformComponent = {
  position?: readonly [number, number, number];
  rotation?: readonly [number, number, number];
  scale?: readonly [number, number, number];
};

export type RagdollSyncSystemOptions = {
  adapter: RapierAdapter;
  name?: string;
};

export function createRagdollSyncSystem(options: RagdollSyncSystemOptions): System {
  const name = options.name ?? "ragdoll.sync";
  const adapter = options.adapter;
  let cachedWorld: World | undefined;
  let bodies: QueryHandle | undefined;
  let meshBindings: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      bodies = world.createQuery([RAGDOLL_BODY, TRANSFORM]);
      meshBindings = world.createQuery([RAGDOLL_MESH_BINDING, TRANSFORM]);
      cachedWorld = world;
    }
    for (const entityId of bodies!.run()) {
      const body = world.getComponent<RagdollBodyComponent>(entityId, RAGDOLL_BODY);
      if (body?.rapierBodyHandle === undefined) continue;
      const t = adapter.getBodyTranslation(body.rapierBodyHandle);
      const r = adapter.getBodyRotation(body.rapierBodyHandle);
      if (t === undefined) continue;
      // Quaternion → Euler (XYZ order, degrees) — matches the engine's
      // physics-sync-system convention.
      let rotationDeg: [number, number, number] | undefined;
      if (r !== undefined) {
        const [x, y, z, w] = r;
        // Adapted from THREE.Euler.setFromQuaternion(q, 'XYZ').
        const m11 = 1 - 2 * (y! * y! + z! * z!);
        const m12 = 2 * (x! * y! - z! * w!);
        const m13 = 2 * (x! * z! + y! * w!);
        const m22 = 1 - 2 * (x! * x! + z! * z!);
        const m23 = 2 * (y! * z! - x! * w!);
        const m33 = 1 - 2 * (x! * x! + y! * y!);
        const eulerY = Math.asin(Math.max(-1, Math.min(1, m13)));
        let eulerX: number;
        let eulerZ: number;
        if (Math.abs(m13) < 0.9999999) {
          eulerX = Math.atan2(-m23, m33);
          eulerZ = Math.atan2(-m12, m11);
        } else {
          eulerX = Math.atan2(m23, m22);
          eulerZ = 0;
        }
        rotationDeg = [eulerX * RAD2DEG, eulerY * RAD2DEG, eulerZ * RAD2DEG];
      }
      const existing = world.getComponent<{ position?: number[]; rotation?: number[]; scale?: number[] }>(
        entityId,
        TRANSFORM
      );
      world.setComponent(entityId, TRANSFORM, {
        ...(existing ?? {}),
        position: [t[0], t[1], t[2]],
        ...(rotationDeg !== undefined ? { rotation: rotationDeg } : {})
      });
    }

    // S131 mesh handover — mirror each bound body's Transform onto its
    // mesh entity. The body's Transform was just refreshed in the loop
    // above so this is a pure ECS read; no extra Rapier round-trip.
    for (const meshEntityId of meshBindings!.run()) {
      const binding = world.getComponent<RagdollMeshBindingComponent>(meshEntityId, RAGDOLL_MESH_BINDING);
      if (binding === undefined) continue;
      const bodyTransform = world.getComponent<TransformComponent>(binding.bodyEntity, TRANSFORM);
      if (bodyTransform?.position === undefined) continue;
      const existing = world.getComponent<TransformComponent>(meshEntityId, TRANSFORM) ?? {};
      world.setComponent(meshEntityId, TRANSFORM, {
        ...existing,
        position: [bodyTransform.position[0], bodyTransform.position[1], bodyTransform.position[2]],
        ...(bodyTransform.rotation !== undefined
          ? {
              rotation: [bodyTransform.rotation[0], bodyTransform.rotation[1], bodyTransform.rotation[2]]
            }
          : {})
      });
    }
  };

  return { name, fixedUpdate };
}
