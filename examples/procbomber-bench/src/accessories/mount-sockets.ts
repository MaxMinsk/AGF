// S106 KABOOM-ACCESSORY-MOUNT-SOCKETS — 5 named mount socket positions
// on the bomber tree.
//
// Each socket is a LOCAL position in its parent mesh's frame:
//   - head.crown  — top centre of the head mesh (positive Y)
//   - head.eyes   — front face of the head mesh (positive Z)
//   - torso.back  — back face of the torso mesh (negative Z)
//   - torso.sideL — left face of the torso mesh (negative X)
//   - torso.sideR — right face of the torso mesh (positive X)
//
// Computed from the bomber's BomberPartSizes so a slider drag re-anchors
// the socket without re-spawning anything.

import type { BomberPartSizes } from "../generators/bomber-parts";

export type MountSocketName =
  | "head.crown"
  | "head.eyes"
  | "torso.back"
  | "torso.sideL"
  | "torso.sideR";

export type MountSocket = {
  /** Name of the socket. */
  name: MountSocketName;
  /** Parent mesh-part entity suffix (the spawner appends to the bomber root id). */
  parentSuffix: "head" | "torso";
  /** Local position in the parent mesh's frame. */
  position: readonly [number, number, number];
};

export const MOUNT_SOCKET_NAMES: ReadonlyArray<MountSocketName> = [
  "head.crown",
  "head.eyes",
  "torso.back",
  "torso.sideL",
  "torso.sideR"
];

export function isMountSocketName(value: unknown): value is MountSocketName {
  return typeof value === "string" && (MOUNT_SOCKET_NAMES as ReadonlyArray<string>).includes(value);
}

/** Compute the local position for every socket, given the current part sizes. */
export function computeMountSockets(sizes: BomberPartSizes): Record<MountSocketName, MountSocket> {
  const headHalf = sizes.headSize / 2;
  const torsoHalfWidth = sizes.torsoWidth / 2;
  const torsoHalfDepth = (sizes.torsoWidth * 0.65) / 2; // torso uses Z scale 0.65
  const torsoHalfHeight = sizes.torsoHeight / 2;
  return {
    "head.crown": {
      name: "head.crown",
      parentSuffix: "head",
      position: [0, headHalf, 0]
    },
    "head.eyes": {
      name: "head.eyes",
      parentSuffix: "head",
      // Front face at +Z half-extent; eye height slightly above centre.
      position: [0, headHalf * 0.15, headHalf]
    },
    "torso.back": {
      name: "torso.back",
      parentSuffix: "torso",
      // Back face at -Z half-extent; vertical centre of torso.
      position: [0, 0, -torsoHalfDepth]
    },
    "torso.sideL": {
      name: "torso.sideL",
      parentSuffix: "torso",
      position: [-torsoHalfWidth, torsoHalfHeight * 0.2, 0]
    },
    "torso.sideR": {
      name: "torso.sideR",
      parentSuffix: "torso",
      position: [torsoHalfWidth, torsoHalfHeight * 0.2, 0]
    }
  };
}
