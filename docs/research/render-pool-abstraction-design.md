# Render-pool abstraction design (S52)

Status: design memo for a future sprint. The actual code refactor was
scoped out of S52 — see "Why deferred" below.

Origin: carried from Sprint 48's task #34. The motivation is that the
adapter (`engine/render/three-render-adapter.ts`) ships three near-
identical pool patterns that have grown independently:

| Pool                  | Acquire spec                          | Handle              | Backing object  | Live-instance set       |
|-----------------------|---------------------------------------|---------------------|-----------------|-------------------------|
| `buckets` (M17)       | `BucketAcquireSpec`                   | `BucketHandle`      | `InstancedMesh` | `BucketEntry.liveSlots` |
| `batchedBuckets`      | `BatchedBucketAcquireSpec`            | `BatchedBucketHandle`| `BatchedMesh`  | `BatchedBucketEntry.liveInstances` |
| `particlePools` (M19) | `ParticlePoolAcquireSpec`             | `ParticlePoolHandle`| `InstancedMesh` (additive) | `ParticlePoolEntry.liveSlots` |

Each one keeps its own:
- monotonic handle counter (`nextBucketHandle`, `nextBatchedBucketHandle`, etc.);
- live-slot bookkeeping (`Set<InstanceIndex>`);
- capacity bookkeeping (`capacity` field on each entry);
- scene-attach / scene-detach plumbing (`scene.add` / `scene.remove`);
- dispose pattern (`mesh.dispose()` + `disposeMaterial(mesh.material)`).

The methods on the adapter mirror each pool's contract (`acquireBucket` /
`acquireBatchedBucket` / `acquireParticlePool`, `addBucketInstance` /
`addBatchedInstance`, `setBucketInstanceTransform` /
`setBatchedInstanceTransform`, etc.). The shape is the same; the only
real differences are the InstancedMesh-vs-BatchedMesh-vs-additive-pool
allocator and the per-instance set-of-properties (transform, color,
geometry id).

## Proposed unified shape

Step 1 — extract a generic registry:

```ts
class RenderPoolRegistry<Spec, Entry> {
  private next = 0;
  private entries = new Map<number, Entry>();
  acquire(spec: Spec, build: (spec: Spec) => Entry): number {
    const handle = ++this.next;
    this.entries.set(handle, build(spec));
    return handle;
  }
  release(handle: number, dispose: (entry: Entry) => void): void {
    const e = this.entries.get(handle);
    if (e === undefined) return;
    dispose(e);
    this.entries.delete(handle);
  }
  get(handle: number): Entry | undefined { return this.entries.get(handle); }
  liveCount(): number { return this.entries.size; }
}
```

Step 2 — wrap each pool variant around a single registry, so the
adapter has three registries (`instancedBuckets`, `batchedBuckets`,
`particlePools`) sharing bookkeeping but keeping their distinct
allocators. Reuses ~150 lines that are currently triplicated.

Step 3 — collapse the public adapter API onto a `PoolHandle`
discriminated union + `BucketSpec` dispatcher:

```ts
type BucketSpec =
  | { kind: "instanced"; geometry: BufferGeometry; ... }
  | { kind: "batched"; maxInstances: number; ... }
  | { kind: "particle"; capacity: number; ... };

type PoolHandle =
  | { kind: "instanced"; handle: BucketHandle }
  | { kind: "batched"; handle: BatchedBucketHandle }
  | { kind: "particle"; handle: ParticlePoolHandle };
```

`adapter.acquirePool(spec)` returns a tagged `PoolHandle`; downstream
calls (`adapter.setInstanceTransform(handle, slot, world)` etc.) take
the handle and dispatch internally based on its `kind`.

Step 4 — gate the unified path behind the existing call sites:
BatchingSystem keeps calling `adapter.acquireBucket(...)` / etc. The
new `acquirePool` is for new call sites that don't want to know the
underlying pool kind upfront (e.g., a future generic LOD switch system
that needs to live-migrate entities between pools as their distance
crosses thresholds).

## Why deferred

S52 shipped 8 concrete deliverables (lighting × 2, materials,
composition, sky, static-caster-tag, doctor section, FXAA probe,
tuner persistence) plus this design memo. A 3-pool refactor with
~150 lines of touch + at least 4 dependent systems (BatchingSystem,
MeshTransformSyncSystem, ParticleEmitterSystem, three-renderer.ts
fallback) is too much regression surface to land on top of that
without a separate test pass.

Pulling it into Sprint 53 also pairs naturally with two other
backlog candidates that depend on the same surface:

- `RENDER-bucket-key-architecture` — typed BucketSpec + hash-based
  registry to replace the string-keyed bucket lookups in
  `BatchingSystem`. Phase 3 of the unification above.
- `M17-bvh-extension` — `@three.ez/batched-mesh-extensions` adds a
  BVH-augmented BatchedMesh that could flip the `path: "batched"`
  crossover for small scenes. Slotting it in is much cleaner once
  pools share a registry.

## Acceptance for the implementation sprint

When this lands:
- Three pool variants share a single `RenderPoolRegistry<Spec, Entry>`
  helper. Existing public API methods keep working (no caller
  changes).
- New `acquirePool(spec: BucketSpec): PoolHandle` dispatcher returns
  a tagged handle. Unit test demonstrates a single call site
  routing between InstancedMesh + BatchedMesh purely by spec.kind.
- `BatchingSystem` + `ParticleEmitterSystem` left untouched — the
  refactor is internal-only at landing.
- Adapter line count drops by at least 100 lines net.

## References

- `engine/render/three-render-adapter.ts:847` — `acquireBucket`
- `engine/render/three-render-adapter.ts:1020` — `acquireParticlePool`
- `engine/render/three-render-adapter.ts:1076` — `acquireBatchedBucket`
- S50 doc on bucket-key shape: `docs/research/m17-three-batching-references.md`
- S51 doc on BatchedMesh trade-offs: `docs/research/m17-batched-vs-instanced-shadows-bench.md`
