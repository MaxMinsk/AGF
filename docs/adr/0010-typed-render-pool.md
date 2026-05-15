# ADR-0010: Typed render pool — `BucketSpec` + `PoolHandle` + `RenderPoolRegistry`

## Status

Accepted (2026-05-15). Shipped Sprint 53 (`RENDER-pool-registry` / `RENDER-bucket-spec-typed` / `RENDER-pool-handle-union` / `RENDER-bucket-key-architecture-finalize`).

## Context

S34–S51 grew three parallel render pools — `InstancedMesh` buckets, `BatchedMesh` buckets, and `BatchedMesh-BVH` (S53 `M17-bvh-extension`). Each one was keyed by a hand-rolled string like `instanced|<mesh>|<material>|<shadow>|<group>`. Acquire / release / live-count lived as three near-identical methods on the adapter (one per pool kind). Two consequences:

1. Adding a new bucket kind meant copy-paste at 4 sites (acquire / release / liveCount / dispatch).
2. The string-keyed map drifted: a `|`-separated string vs an object meant typos compiled, and a malformed key returned `undefined` at runtime instead of erroring at type-check time.

## Decision

Three pieces ship together:

1. **`BucketSpec` discriminated union** (`engine/render/bucket-spec.ts`):

   ```ts
   type BucketSpec =
     | { kind: "instanced"; meshRef: string; materialRef?: string; shadowFlags: ShadowFlags; group?: string }
     | { kind: "batched";   materialRef?: string; shadowFlags: ShadowFlags; group?: string }
     | { kind: "batched-bvh"; materialRef?: string; shadowFlags: ShadowFlags; group?: string };
   ```

   Plus a pure `bucketSpecHash(spec): string` that produces the same bytes the old hand-rolled keys did (so existing tests and bucket-key-by-string callers stay consumable during the migration).

2. **`PoolHandle` discriminated union**:

   ```ts
   type PoolHandle =
     | { kind: "instanced"; ref: InstancedMeshHandle }
     | { kind: "batched"; ref: BatchedMeshHandle }
     | { kind: "batched-bvh"; ref: BatchedMeshHandle };
   ```

   Pattern-match by `kind` instead of three sibling adapter methods.

3. **`RenderPoolRegistry<Entry>`** (`engine/render/render-pool-registry.ts`) — small generic pool helper. Keeps the bucket map + reverse `EntityId ↔ bucketKey` table; exposes typed `acquire / release / get / liveCount / drain`. The adapter holds one registry per pool kind, but they share the same shape.

The adapter exposes one typed dispatcher:

```ts
adapter.acquirePool(spec, opts): PoolHandle;
adapter.poolLiveCount(handle): number;
adapter.releasePool(handle): void;
```

Plus the per-kind methods stay public for back-compat. `BatchingSystem` already routes through `acquirePool`. Caller migration off the per-kind methods is a future-sprint follow-up.

## Consequences

Pro:

- Adding a new bucket kind is now ~15 lines (add to `BucketSpec` / `PoolHandle` / hash, register a `RenderPoolRegistry`).
- Bucket keys are type-checked; typos at construction become compile errors.
- The doctor `Batching:` section reports pool distribution from a single source.

Con:

- `BucketSpec` discriminated union is verbose at call sites; helper factories may emerge.
- The per-kind methods are still publicly available, so the adapter API surface is bigger than it needs to be. Cleanup deferred to `render-pool-caller-migration` (parking lot).

## Validation

- `tests/unit/bucket-spec.test.ts` (6 cases) covers hash equality with the old key format.
- `tests/unit/render-pool-registry.test.ts` (8 cases) pins handle monotonicity, no-reuse-after-release, drain.
- S53 perf-probe results recorded in `docs/research/m17-batched-vs-instanced-shadows-bench.md` confirm the typed dispatch path is performance-identical to the hand-rolled string path.

## Alternatives Considered

- **String keys only with stricter validation.** Loses type-checking on bucket spec mutation.
- **One unified `Pool` class via inheritance.** Three.js's bucket entries differ enough (InstancedMesh has per-instance matrices in a `InstancedBufferAttribute`; BatchedMesh has registered geometries) that an inheritance hierarchy would leak details. The discriminated union keeps each kind in its own typed lane.
- **Reverse-key map keyed by `PoolHandle.ref` instead of bucket key.** The hash form is needed for de-duplication (different entities with the same spec must share a bucket); kept it.
