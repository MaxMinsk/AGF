# M17-static-merge-spike

Date: 2026-05-14
Owner: M17 batching

## Question

For scenes that ship **static scenery** (Beacon's ground tiles, shadows-bench's village buildings, future heightfield terrain), is the right next batching primitive:

- **(A) BufferGeometryUtils.mergeGeometries** at build time — collapse N meshes into ONE draw, lose per-entity identity.
- **(B) Runtime-merged scratch buffer**, keep per-entity transforms accessible via instance index, reverse-mapped through an `EntityId ↔ instanceId` table (mirrors `M17-bucketer`'s InstancedMesh approach).
- **(C) BatchedMesh path** (already shipped in S38 / S40) — handles varied-geometry + shared-material; just nudge gameplay to use it where appropriate.

## Today's coverage

- `M17-bucketer` (S35) — InstancedMesh per `(mesh + material + shadow + group)` bucket.
- `M17-batched-mesh-system` (S40) — BatchedMesh per `(material + shadow + group)`; mesh-ref varies, geometries registered per-bucket on first use.
- `M17-instance-picking` (S41) — Raycaster against the per-entity Mesh map. **Does NOT yet resolve `instanceId → entityId` for bucket members.**

So gameplay-driven static scenery already has two batching paths. The hole is per-entity *picking* + *transform updates* against bucket members.

## When option A actually helps

`mergeGeometries` is the right tool when:
1. Every member is **truly static for the session** (no Transform writes, no removal until level unload).
2. Per-entity addressability is not needed (no picking, no hover, no per-piece damage / colour change).
3. Author wants the absolute minimum draw call count + has no need for frustum culling per piece.

For Beacon today: ground (1 mesh) + beacons (2) + cores (2) + hazards (2) = 7 meshes total. mergeGeometries would save 6 draws but lose pickability for cores + beacons. Not worth it.

For shadows-bench: 28 buildings + 80 trees + 50 rocks = 158 meshes. `M17-bucketer` already collapses them into ~4 InstancedMesh buckets (one per palette colour). mergeGeometries would save ~3 more draws (one per bucket). Not worth losing per-entity transforms (the procedural seed jitters positions per instance).

## When option B helps

A static-merge with reverse `EntityId` lookup is useful for:
1. **Massive static prop layouts** (10k+ trees in a forest demo, 100k+ tiles in a procedural world) where InstancedMesh bucket counts climb past 1024 per group AND every prop needs to stay raycast-able for picking.
2. **Cases where InstancedMesh per-instance matrices cost more memory than a single merged matrix-free buffer.** At 10k instances × 16 floats = 640 KB per bucket of GPU matrices. A merged geometry skips that table.

This is `M17-static-merge-spike`'s real target — only worth doing when a project asks for it. Today no project does.

## When option C helps

Already shipped. The S40 `Batchable.path: "batched"` lets one BatchedMesh bucket hold ≤512 varied-geometry instances sharing one material. Scenery with primitive shapes + one shared palette colour (shadows-bench grass-coloured rocks, future cobblestones with subtle variation) drops into this path cleanly.

## Recommendation

**Don't ship a static-merge primitive yet.** The two existing paths (InstancedMesh + BatchedMesh) cover Beacon, batch-bench, physics-bench, shadows-bench. The first project that authors a 10k+ static-prop scene will be the right signal for `M17-static-merge-spike`.

Until then, the more valuable M17 follow-up is **`M17-instance-picking-buckets`** — resolve `instanceId → EntityId` against the InstancedMesh / BatchedMesh member maps so `__agf.pick()` works on Batchable entities too. That unlocks click-to-select on shadows-bench, which is what an inspector-overlay agent would actually want.

## Sub-decisions

- **No new component yet.** When static-merge lands, it will be an opt-in `StaticMerge { mergeGroupId: string }` component (mirroring `Batchable.group`). Members get bundled into one merged `Mesh` at scene load time; picking uses a reverse map populated during merge.
- **Build-time vs run-time.** First version stays run-time — the merge runs once when MeshLifecycleSystem first sees N members of the same merge group. Build-time (offline `engine asset` pipeline) only matters if scene load becomes a perf concern; today it's not.
- **Removal semantics.** A merged entity that gets removed at runtime collapses the entire merge group + re-emits without that member. Cheap when removals are rare (level-end, save-load) — expensive if a project removes one tree every frame, which would push the project back onto InstancedMesh.

## Next stories (priority order)

1. `M17-instance-picking-buckets` — instanceId → entityId in `pickAtNdc` against InstancedMesh + BatchedMesh members.
2. `M17-lod-batched` — wire LodSelectionSystem to BatchedMesh's per-instance geometry id so LOD swap doesn't drop the entity out of the bucket.
3. `M17-static-merge-spike` — only after a real 10k+ static-prop project asks.
