// S53 RENDER-bucket-spec-typed + RENDER-pool-handle-union — covers
// the typed `BucketSpec` discriminated union, the stable hash, and
// the tagged `PoolHandle` shape returned by `adapter.acquirePool`.

import { describe, expect, it } from "vitest";

import { bucketSpecHash, type BucketSpec } from "../../engine/render/bucket-spec";

describe("bucketSpecHash (S53)", () => {
  it("produces the legacy `instanced|...` string for instanced specs", () => {
    const spec: BucketSpec = {
      kind: "instanced",
      mesh: "box",
      shadowCast: true,
      shadowReceive: true,
      group: "rocks"
    };
    expect(bucketSpecHash(spec)).toBe("instanced|box|_|1:1|rocks");
  });

  it("inlines the manifest profile into the instanced hash", () => {
    const spec: BucketSpec = {
      kind: "instanced",
      mesh: "runtime/models/beacon.glb",
      materialProfile: "std|R0.4|M0.2|E#7a4a08",
      shadowCast: true,
      shadowReceive: false
    };
    expect(bucketSpecHash(spec)).toBe(
      "instanced|runtime/models/beacon.glb|std|R0.4|M0.2|E#7a4a08|1:0|"
    );
  });

  it("produces the legacy `batched|...` string for the BatchedMesh variant", () => {
    const spec: BucketSpec = {
      kind: "batched",
      shadowCast: true,
      shadowReceive: true,
      group: "alpha"
    };
    expect(bucketSpecHash(spec)).toBe("batched|1:1|alpha");
  });

  it("tags the BVH variant with a distinct prefix", () => {
    const a: BucketSpec = { kind: "batched", shadowCast: true, shadowReceive: true };
    const b: BucketSpec = { kind: "batched-bvh", shadowCast: true, shadowReceive: true };
    expect(bucketSpecHash(a)).not.toBe(bucketSpecHash(b));
    expect(bucketSpecHash(b)).toBe("batched-bvh|1:1|");
  });

  it("is stable: equal-content specs hash to identical strings", () => {
    const a: BucketSpec = {
      kind: "instanced",
      mesh: "box",
      shadowCast: true,
      shadowReceive: true
    };
    const b: BucketSpec = {
      kind: "instanced",
      mesh: "box",
      shadowCast: true,
      shadowReceive: true
    };
    expect(bucketSpecHash(a)).toBe(bucketSpecHash(b));
  });

  it("distinguishes shadow flag combinations", () => {
    const onOn: BucketSpec = { kind: "instanced", mesh: "box", shadowCast: true, shadowReceive: true };
    const offOn: BucketSpec = { kind: "instanced", mesh: "box", shadowCast: false, shadowReceive: true };
    const onOff: BucketSpec = { kind: "instanced", mesh: "box", shadowCast: true, shadowReceive: false };
    const hashes = new Set([bucketSpecHash(onOn), bucketSpecHash(offOn), bucketSpecHash(onOff)]);
    expect(hashes.size).toBe(3);
  });
});
