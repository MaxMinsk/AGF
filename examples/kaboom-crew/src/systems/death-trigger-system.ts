// S132 KABOOM-DEATH-TRIGGER — replaces the S105 procedural-spring
// DeathAnim path. Watches BomberStats.alive transitions; on the
// true→false edge, fires the engine ragdoll module (S126-S131) by
// writing a RagdollSpawnRequest with a 10-entry meshMap that ties the
// kaboom-bomber template's body names to the procedural-character
// generator's mesh entity ids.
//
// Trigger sequence (per dying bomber):
//   1. Detach each of the 10 mesh entities from their parent pivot
//      (Transform.parent = undefined). Engine sync writes world-space
//      transforms onto bound meshes; if parents persisted, the renderer
//      would compose parent + child and the meshes would render in the
//      wrong place.
//   2. Build meshMap { torso → "<root>.torso", head → "<root>.head",
//      "upperArm.l" → "<root>.upperArmL", ... } — the 10-entry map
//      that pairs engine body names with the procedural mesh entity
//      ids.
//   3. Read DeathImpulse if present (blast direction + magnitude).
//      Default to -Z at magnitude 1 when the bomber dies without a
//      blast origin (corner case — instant kill from some non-blast
//      source).
//   4. world.setComponent(rootId, "RagdollSpawnRequest", { ... }).
//      The engine spawn-system consumes the transient next tick and
//      writes RagdollMeshBinding on each mesh + RagdollActive on the
//      root.
//
// Pure ECS — no Rapier import. The engine ragdoll module owns the
// physics integration; this trigger just writes data the engine
// already understands.

import type { ComponentName, EntityId } from "../../../../engine/core/ecs/types";
import type { QueryHandle, World } from "../../../../engine/core/ecs/world";
import type { System, SystemContext } from "../../../../engine/core/systems/types";

const BOMBER_STATS: ComponentName = "BomberStats";
const DEATH_IMPULSE: ComponentName = "DeathImpulse";
const RAGDOLL_SPAWN_REQUEST: ComponentName = "RagdollSpawnRequest";
const TRANSFORM: ComponentName = "Transform";
const LOCAL_TO_WORLD: ComponentName = "LocalToWorld";
const RAD2DEG = 180 / Math.PI;

const KABOOM_BOMBER_TEMPLATE_KEY = "kaboom-bomber";
const DEFAULT_IMPULSE_MAGNITUDE = 1.0;
const DEFAULT_IMPULSE_Y = 0.5; // a little lift so the ragdoll doesn't slide flat along the floor
// S135-hotfix — live playtest showed the post-fix impulse still felt
// too aggressive (ragdolls cleared the arena). Scale to 0.5× so the
// blast feels punchy without launching bombers off the map. Pair with
// the spawn-system fix (impulse → first body only, joints transmit).
const IMPULSE_SCALE = 0.5;

// Engine ragdoll body name → mesh entity suffix mapping. The 10
// entries match the kaboom-bomber template (engine body names use
// dots; the procedural character generator uses camelCase suffixes).
const BODY_TO_MESH_SUFFIX: ReadonlyArray<{ body: string; suffix: string }> = [
  { body: "torso", suffix: "torso" },
  { body: "head", suffix: "head" },
  { body: "upperArm.l", suffix: "upperArmL" },
  { body: "forearm.l", suffix: "forearmL" },
  { body: "upperArm.r", suffix: "upperArmR" },
  { body: "forearm.r", suffix: "forearmR" },
  { body: "upperLeg.l", suffix: "upperLegL" },
  { body: "lowerLeg.l", suffix: "lowerLegL" },
  { body: "upperLeg.r", suffix: "upperLegR" },
  { body: "lowerLeg.r", suffix: "lowerLegR" }
];

type BomberStatsComponent = { alive?: boolean };

type DeathImpulseComponent = {
  blastOriginGx?: number;
  blastOriginGz?: number;
  magnitude?: number;
};

type TransformComponent = {
  position?: readonly [number, number, number];
  rotation?: readonly [number, number, number];
  scale?: readonly [number, number, number];
  parent?: EntityId;
};

type LocalToWorldComponent = {
  position?: readonly [number, number, number];
  rotation?: readonly [number, number, number];
  scale?: readonly [number, number, number];
};

type BodyPoseEntry = {
  position: [number, number, number];
  rotation?: [number, number, number];
};

export type KaboomDeathTriggerSystemOptions = {
  name?: string;
};

export function createKaboomDeathTriggerSystem(
  options: KaboomDeathTriggerSystemOptions = {}
): System {
  const name = options.name ?? "kaboom.death-trigger";
  const prevAlive = new Map<EntityId, boolean>();
  let cachedWorld: World | undefined;
  let bombers: QueryHandle | undefined;

  const fixedUpdate = (context: SystemContext): void => {
    const world = context.world;
    if (world !== cachedWorld) {
      bombers = world.createQuery([BOMBER_STATS]);
      cachedWorld = world;
      prevAlive.clear();
    }
    const current = new Map<EntityId, boolean>();
    for (const id of bombers!.run()) {
      const stats = world.getComponent<BomberStatsComponent>(id, BOMBER_STATS);
      current.set(id, stats?.alive !== false);
    }
    for (const [id, nowAlive] of current) {
      const wasAlive = prevAlive.get(id) ?? true;
      if (wasAlive && !nowAlive) triggerRagdoll(world, id);
    }
    // Prune dropped bomber ids from prevAlive so they can re-trigger if
    // somehow respawned with the same id.
    for (const id of prevAlive.keys()) {
      if (!current.has(id)) prevAlive.delete(id);
    }
    for (const [id, alive] of current) prevAlive.set(id, alive);
  };

  return { name, fixedUpdate };
}

function triggerRagdoll(world: World, rootId: EntityId): void {
  // Skip if a request was already written this tick for this entity
  // (defensive — re-entry guard).
  if (world.hasComponent(rootId, RAGDOLL_SPAWN_REQUEST)) return;

  // S133 pose-snapshot: BEFORE detaching parents, read each mesh's
  // LocalToWorld so the engine ragdoll spawns each body at the mesh's
  // current world position+rotation. Falls back to the template anchor
  // for any mesh without LTW (e.g. the renderer hasn't ticked yet).
  // LTW rotation is in radians; the schema declares degrees, so we
  // convert here.
  const meshMap: Record<string, EntityId> = {};
  const bodyPoses: Record<string, BodyPoseEntry> = {};
  for (const { body, suffix } of BODY_TO_MESH_SUFFIX) {
    const meshId: EntityId = `${rootId}.${suffix}`;
    if (!world.hasEntity(meshId)) continue;
    meshMap[body] = meshId;
    const ltw = world.getComponent<LocalToWorldComponent>(meshId, LOCAL_TO_WORLD);
    if (ltw?.position !== undefined) {
      const entry: BodyPoseEntry = {
        position: [ltw.position[0] ?? 0, ltw.position[1] ?? 0, ltw.position[2] ?? 0]
      };
      if (ltw.rotation !== undefined) {
        entry.rotation = [
          (ltw.rotation[0] ?? 0) * RAD2DEG,
          (ltw.rotation[1] ?? 0) * RAD2DEG,
          (ltw.rotation[2] ?? 0) * RAD2DEG
        ];
      }
      bodyPoses[body] = entry;
    }
    const t = world.getComponent<TransformComponent>(meshId, TRANSFORM);
    if (t?.parent !== undefined) {
      const next: TransformComponent = { ...t };
      delete (next as { parent?: EntityId }).parent;
      world.setComponent(meshId, TRANSFORM, next);
    }
  }

  // Compute impulse from DeathImpulse (blast direction) if present.
  const impulse = computeImpulse(world, rootId);

  const request: {
    templateKey: string;
    impulse: readonly [number, number, number];
    meshMap: Record<string, EntityId>;
    bodyPoses?: Record<string, BodyPoseEntry>;
  } = {
    templateKey: KABOOM_BOMBER_TEMPLATE_KEY,
    impulse,
    meshMap
  };
  if (Object.keys(bodyPoses).length > 0) request.bodyPoses = bodyPoses;
  world.setComponent(rootId, RAGDOLL_SPAWN_REQUEST, request);
}

function computeImpulse(world: World, rootId: EntityId): readonly [number, number, number] {
  const di = world.getComponent<DeathImpulseComponent>(rootId, DEATH_IMPULSE);
  const baseMagnitude = di?.magnitude ?? DEFAULT_IMPULSE_MAGNITUDE;
  const magnitude = baseMagnitude * IMPULSE_SCALE;
  const liftY = DEFAULT_IMPULSE_Y * IMPULSE_SCALE;
  if (di === undefined || di.blastOriginGx === undefined || di.blastOriginGz === undefined) {
    return [0, liftY, -1 * magnitude];
  }
  const t = world.getComponent<TransformComponent>(rootId, TRANSFORM);
  const px = t?.position?.[0] ?? 0;
  const pz = t?.position?.[2] ?? 0;
  const dx = px - di.blastOriginGx;
  const dz = pz - di.blastOriginGz;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) {
    return [0, liftY, -1 * magnitude];
  }
  const nx = dx / len;
  const nz = dz / len;
  return [nx * magnitude, liftY, nz * magnitude];
}
