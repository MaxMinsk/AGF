// S102 PROCBOMBER-LIMB-PIVOTS-COMPONENT — TypeScript surface for the
// project-local LimbPivots ECS component. The schema entry lives in
// schemas/scene-extensions.schema.json; this file exposes the type +
// helpers so animation + bench code reads pivots without sprinkling
// raw component lookups across the project.

export const LIMB_PIVOTS = "LimbPivots";

export type LimbPivotName =
  | "neck"
  | "shoulderL"
  | "shoulderR"
  | "elbowL"
  | "elbowR"
  | "hipL"
  | "hipR"
  | "kneeL"
  | "kneeR";

export type LimbPivots = Record<LimbPivotName, string>;

export const LIMB_PIVOT_NAMES: ReadonlyArray<LimbPivotName> = [
  "neck",
  "shoulderL",
  "shoulderR",
  "elbowL",
  "elbowR",
  "hipL",
  "hipR",
  "kneeL",
  "kneeR"
];

export function isLimbPivotName(value: unknown): value is LimbPivotName {
  return typeof value === "string" && (LIMB_PIVOT_NAMES as ReadonlyArray<string>).includes(value);
}

/** Convenience constructor — fill a LimbPivots record with one id resolver. */
export function buildLimbPivots(resolve: (name: LimbPivotName) => string): LimbPivots {
  return {
    neck: resolve("neck"),
    shoulderL: resolve("shoulderL"),
    shoulderR: resolve("shoulderR"),
    elbowL: resolve("elbowL"),
    elbowR: resolve("elbowR"),
    hipL: resolve("hipL"),
    hipR: resolve("hipR"),
    kneeL: resolve("kneeL"),
    kneeR: resolve("kneeR")
  };
}
