// S102 PROCBOMBER-MESH-TREE-V0 — ECS spawner that builds the 9-pivot +
// 10-mesh bomber tree under a given root entity.
//
// The "tree" lives in ECS Transform.parent chains:
//
//   <root> (existing entity — provided by caller, owns turntable/etc parent)
//   └── <root>.torso (Mesh: procedural:procbomber-torso)
//       ├── <root>.neck (pivot — Transform only)
//       │   └── <root>.head (Mesh: procedural:procbomber-head)
//       ├── <root>.shoulderL (pivot)
//       │   └── <root>.upperArmL (Mesh)
//       │       └── <root>.elbowL (pivot)
//       │           └── <root>.forearmL (Mesh)
//       ├── <root>.shoulderR ... (mirror)
//       ├── <root>.hipL (pivot)
//       │   └── <root>.upperLegL (Mesh)
//       │       └── <root>.kneeL (pivot)
//       │           └── <root>.lowerLegL (Mesh)
//       └── <root>.hipR ... (mirror)
//
// Pivot entities have only `Transform`; mesh entities have `Transform`
// + `MeshRenderer` referencing the per-part procedural mesh key
// (procbomber-torso, procbomber-head, …). After running, the spawner
// writes a `LimbPivots` component on the root carrying entity-id
// references to all nine pivots, so animation systems can lookup
// pivots by name without walking the Transform tree.

import type { EngineCommand } from "../../../engine/core/commands/types";

import type { BomberPartName, BomberPartSizes } from "./generators/bomber-parts";
import { LIMB_PIVOTS, buildLimbPivots, type LimbPivots } from "./limb-pivots";

export type BomberTreeSpawnOptions = {
  /** Existing entity id — must already exist with a Transform. Spawner adds children. */
  rootId: string;
  sizes: BomberPartSizes;
  /** Procedural-mesh-registry key prefix. Defaults to "procbomber". */
  keyPrefix?: string;
};

export type BomberTreeResult = {
  /** LimbPivots written on the root. */
  limbPivots: LimbPivots;
  /** Every part-mesh entity id created (in render order). Useful for the bench's rebuild loop. */
  meshEntities: ReadonlyArray<{ id: string; partName: BomberPartName }>;
  /** Every pivot entity id created. Useful for tests + dispose. */
  pivotEntities: ReadonlyArray<string>;
};

type Vec3 = readonly [number, number, number];

export type PivotMountOffsets = {
  shoulderMountY?: number;
  shoulderMountZ?: number;
  hipMountY?: number;
  hipMountZ?: number;
};

/**
 * Re-emit Transform.position component.set commands for every pivot in
 * the tree, so a size-slider change re-anchors limbs to the new
 * shoulder/hip mounts without re-spawning the whole tree. Mesh
 * entities sit at their parent pivot's origin (local position [0,0,0])
 * so they don't need updates here.
 *
 * S102 PROCBOMBER-RECIPE-PARAMS-16: extra `mounts` argument offsets the
 * shoulder + hip pivot positions on Y (along the torso) and Z (depth).
 * Defaults to {0,0,0,0} so existing callers keep the same layout.
 */
export function buildPivotRepositionCommands(
  rootId: string,
  sizes: BomberPartSizes,
  mounts: PivotMountOffsets = {}
): EngineCommand[] {
  const ent = (suffix: string): string => `${rootId}.${suffix}`;
  const torsoCenterY = sizes.legLength + sizes.torsoHeight / 2;
  const torsoTopY = sizes.torsoHeight / 2;
  const torsoBottomY = -sizes.torsoHeight / 2;
  const halfTorsoX = sizes.torsoWidth / 2;
  const shoulderY = torsoTopY - sizes.armWidth / 2 + (mounts.shoulderMountY ?? 0);
  const shoulderX = halfTorsoX + sizes.armWidth / 2;
  const shoulderZ = mounts.shoulderMountZ ?? 0;
  const hipY = torsoBottomY + sizes.legWidth / 2 + (mounts.hipMountY ?? 0);
  const hipX = halfTorsoX * 0.5;
  const hipZ = mounts.hipMountZ ?? 0;

  const cmds: EngineCommand[] = [];
  const setPos = (id: string, parent: string, pos: Vec3): void => {
    cmds.push({
      kind: "component.set",
      entityId: id,
      component: "Transform",
      data: { parent, position: pos, rotation: [0, 0, 0], scale: [1, 1, 1] }
    });
  };
  setPos(ent("torso"), rootId, [0, torsoCenterY, 0]);
  setPos(ent("neck"), ent("torso"), [0, torsoTopY, 0]);
  setPos(ent("shoulderL"), ent("torso"), [-shoulderX, shoulderY, shoulderZ]);
  setPos(ent("shoulderR"), ent("torso"), [shoulderX, shoulderY, shoulderZ]);
  setPos(ent("elbowL"), ent("upperArmL"), [0, -sizes.armLength, 0]);
  setPos(ent("elbowR"), ent("upperArmR"), [0, -sizes.armLength, 0]);
  setPos(ent("hipL"), ent("torso"), [-hipX, hipY, hipZ]);
  setPos(ent("hipR"), ent("torso"), [hipX, hipY, hipZ]);
  setPos(ent("kneeL"), ent("upperLegL"), [0, -sizes.legLength, 0]);
  setPos(ent("kneeR"), ent("upperLegR"), [0, -sizes.legLength, 0]);
  return cmds;
}

export function spawnBomberTree(
  applyCommands: (commands: ReadonlyArray<EngineCommand>) => void,
  options: BomberTreeSpawnOptions
): BomberTreeResult {
  const { rootId, sizes } = options;
  const keyPrefix = options.keyPrefix ?? "procbomber";

  const commands: EngineCommand[] = [];
  const meshEntities: { id: string; partName: BomberPartName }[] = [];
  const pivotEntities: string[] = [];

  const ent = (suffix: string): string => `${rootId}.${suffix}`;

  const addPivot = (id: string, parent: string, localPos: Vec3): void => {
    pivotEntities.push(id);
    commands.push({ kind: "entity.create", entityId: id });
    commands.push({
      kind: "component.set",
      entityId: id,
      component: "Transform",
      data: { parent, position: localPos, rotation: [0, 0, 0], scale: [1, 1, 1] }
    });
  };
  const addMesh = (
    id: string,
    parent: string,
    localPos: Vec3,
    partName: BomberPartName
  ): void => {
    meshEntities.push({ id, partName });
    commands.push({ kind: "entity.create", entityId: id });
    commands.push({
      kind: "component.set",
      entityId: id,
      component: "Transform",
      data: { parent, position: localPos, rotation: [0, 0, 0], scale: [1, 1, 1] }
    });
    commands.push({
      kind: "component.set",
      entityId: id,
      component: "MeshRenderer",
      data: { mesh: `procedural:${keyPrefix}-${partName}` }
    });
  };

  // Y coordinate layout — see GDP-2026-05-21-001 acceptance.
  // Torso center sits above the legs, head above the torso.
  const torsoCenterY = sizes.legLength + sizes.torsoHeight / 2;
  const torsoTopY = sizes.torsoHeight / 2;     // relative to torso local
  const torsoBottomY = -sizes.torsoHeight / 2; // relative to torso local
  const halfTorsoX = sizes.torsoWidth / 2;

  // Torso anchored at the root's local origin (root is the "ground" anchor).
  const torsoId = ent("torso");
  addMesh(torsoId, rootId, [0, torsoCenterY, 0], "torso");

  // Neck + head: pivot at top-center of torso, head hangs above neck.
  const neckId = ent("neck");
  addPivot(neckId, torsoId, [0, torsoTopY, 0]);
  addMesh(ent("head"), neckId, [0, sizes.headSize / 2, 0], "head");

  // Shoulder + arm chains. Pivot at upper outer edge of torso.
  // upperArm hangs DOWN from shoulder (mesh Y in [-armLength..0] from part-builder).
  // forearm hangs DOWN from elbow (which sits at the bottom of upperArm in local space).
  const shoulderY = torsoTopY - sizes.armWidth / 2;  // slight inset from the very top
  const shoulderX = halfTorsoX + sizes.armWidth / 2;
  for (const side of ["L", "R"] as const) {
    const sign = side === "L" ? -1 : 1;
    const shoulderId = ent(`shoulder${side}`);
    const upperArmId = ent(`upperArm${side}`);
    const elbowId = ent(`elbow${side}`);
    const forearmId = ent(`forearm${side}`);
    addPivot(shoulderId, torsoId, [sign * shoulderX, shoulderY, 0]);
    addMesh(upperArmId, shoulderId, [0, 0, 0], "upperArm");
    // Elbow sits at the bottom of the upperArm (local Y = -armLength).
    addPivot(elbowId, upperArmId, [0, -sizes.armLength, 0]);
    addMesh(forearmId, elbowId, [0, 0, 0], "forearm");
  }

  // Hip + leg chains. Pivot at bottom outer of torso, leg hangs DOWN.
  const hipY = torsoBottomY + sizes.legWidth / 2;
  const hipX = halfTorsoX * 0.5;
  for (const side of ["L", "R"] as const) {
    const sign = side === "L" ? -1 : 1;
    const hipId = ent(`hip${side}`);
    const upperLegId = ent(`upperLeg${side}`);
    const kneeId = ent(`knee${side}`);
    const lowerLegId = ent(`lowerLeg${side}`);
    addPivot(hipId, torsoId, [sign * hipX, hipY, 0]);
    addMesh(upperLegId, hipId, [0, 0, 0], "upperLeg");
    addPivot(kneeId, upperLegId, [0, -sizes.legLength, 0]);
    addMesh(lowerLegId, kneeId, [0, 0, 0], "lowerLeg");
  }

  // LimbPivots written on the root.
  const limbPivots = buildLimbPivots((name) => {
    switch (name) {
      case "neck":      return ent("neck");
      case "shoulderL": return ent("shoulderL");
      case "shoulderR": return ent("shoulderR");
      case "elbowL":    return ent("elbowL");
      case "elbowR":    return ent("elbowR");
      case "hipL":      return ent("hipL");
      case "hipR":      return ent("hipR");
      case "kneeL":     return ent("kneeL");
      case "kneeR":     return ent("kneeR");
    }
  });
  commands.push({
    kind: "component.set",
    entityId: rootId,
    component: LIMB_PIVOTS,
    data: limbPivots
  });

  applyCommands(commands);

  return { limbPivots, meshEntities, pivotEntities };
}
