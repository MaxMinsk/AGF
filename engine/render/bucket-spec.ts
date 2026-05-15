// S53 RENDER-bucket-spec-typed.
//
// Replaces the hand-rolled `instanced|<mesh>|<material>|<shadow>|<group>`
// and `batched|<shadow>|<group>` string bucket keys that grew across
// S34–S52 with a typed discriminated union. The hash form is identical
// to the previous string keys so existing tests + adapter call sites
// keep working unchanged; new code (story 3's `acquirePool` dispatcher,
// the doctor's pool section, the BVH path) routes through the typed
// spec.

export type BucketSpec =
  | InstancedBucketSpec
  | BatchedBucketSpec
  | BatchedBvhBucketSpec;

export type InstancedBucketSpec = {
  kind: "instanced";
  /** Primitive name (`box` / `sphere` / `plane`) or external mesh ref (`.glb` / `.gltf`). */
  mesh: string;
  /**
   * Material-manifest profile key (`std|R<roughness>|M<metalness>|E<emissive>`).
   * Absent → default `useInstanceColor` Standard material.
   */
  materialProfile?: string;
  shadowCast: boolean;
  shadowReceive: boolean;
  /** Optional `Batchable.group` hint forces a separate bucket even when the rest matches. */
  group?: string;
};

export type BatchedBucketSpec = {
  kind: "batched";
  shadowCast: boolean;
  shadowReceive: boolean;
  group?: string;
};

/**
 * S53 M17-bvh-extension: BatchedMesh variant from
 * `@three.ez/batched-mesh-extensions`. Same shape as `batched`; the
 * `kind` discriminant routes to the BVH-augmented adapter path.
 * Decision lives behind `project.json#render.batching.path: "batched-bvh"`.
 */
export type BatchedBvhBucketSpec = {
  kind: "batched-bvh";
  shadowCast: boolean;
  shadowReceive: boolean;
  group?: string;
};

/**
 * Stable string hash for use as a `Map<string, BucketRecord>` key.
 *
 * Format matches the legacy hand-rolled keys exactly so:
 * - Existing batching-system tests asserting on bucket dedup keep passing.
 * - The S53 migration can land incrementally — string keys and typed
 *   specs interoperate.
 *
 * Fields are serialised in a fixed order so equal-content specs always
 * hash to the same string.
 */
export function bucketSpecHash(spec: BucketSpec): string {
  switch (spec.kind) {
    case "instanced":
      return `instanced|${spec.mesh}|${spec.materialProfile ?? "_"}|${spec.shadowCast ? "1" : "0"}:${spec.shadowReceive ? "1" : "0"}|${spec.group ?? ""}`;
    case "batched":
      return `batched|${spec.shadowCast ? "1" : "0"}:${spec.shadowReceive ? "1" : "0"}|${spec.group ?? ""}`;
    case "batched-bvh":
      return `batched-bvh|${spec.shadowCast ? "1" : "0"}:${spec.shadowReceive ? "1" : "0"}|${spec.group ?? ""}`;
  }
}
