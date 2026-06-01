# Scorch decals spike — six approaches + verdict

**Status:** Closed 2026-06-01. Approach 2 shipped as S213.
**Source proposal:** `backlog/proposed-stories/GDP-2026-05-30-004.story-proposal.json`.

## Background

After a bomb resolves we want a dark soot mark on the floor that
lingers a few seconds then fades. S207 attempted Three.js
`DecalGeometry` projecting onto cell meshes; every iteration
(per-cell box → rounded plus of cylinders/boxes → cylinder shrink →
per-cell cylinder with opacity poller) failed: either the visual
read wrong from the top-down camera, or the opacity fade was
silently a no-op because the engine renderer never flipped
`material.needsUpdate` after a `transparent: false → true` patch.
Reverted in S208 (#264). This document records why and what to
ship instead.

## Approach 1 — Three.js `DecalGeometry`

Three.js' built-in `new DecalGeometry(targetMesh, position,
orientation, size)` projects a small mesh onto an existing target
surface. Standard tool for static-mesh games (gunshot decals on
walls, foot prints on terrain).

- **Pros:** conforms to target geometry (slopes, ramps).
- **Cons:** requires a STABLE target mesh. Our floor cells are
  procedurally meshed + cached + re-resolved every time Wang
  autotile updates or a soft block destruction changes the cell
  family. Decals tied to a re-spawned mesh become orphans or
  crash. Also per-decal `BufferGeometry` allocation is GC churn.
- **Verdict:** dropped. Right tool for static meshes; wrong for
  our dynamic-cell pipeline.

## Approach 2 — Simple plane entity at cell top (RECOMMENDED — shipped as S213)

Each scorch is its own thin-box entity placed just above the cell
top face. Owns its own `Transform`, `MeshRenderer`, `ScorchTile`,
and `Tweens` components. Doesn't touch the floor mesh.

- **Pros:** simplest possible. Reuses the BlastTile entity pattern
  (S82 — already a thin overlay slab). Survives Wang re-resolves
  (the scorch is a sibling of the floor, not a child of it). Variable
  cell height handled trivially via `getCellHeight`. No new render
  pipeline.
- **Cons:** doesn't follow cliff faces or curved terrain. Fine for
  our case — every cell is a cuboid with a flat top.
- **Verdict:** shipped. Closes the user request with the minimum
  implementation cost.

## Approach 3 — Vertex-color overlay on the existing cell mesh

Write per-vertex dark colour into the floor cell's existing
`BufferAttribute` at the moment of blast.

- **Pros:** zero new entities, zero extra draw calls.
- **Cons:** cell meshes are SHARED via the procedural-mesh-registry
  cache (S101). Mutating one cell's vertex colours affects every
  instance — catastrophic — or requires un-sharing the mesh,
  defeating the cache. Wang autotile re-resolves wipe the
  modifications.
- **Verdict:** not viable without breaking the mesh cache.

## Approach 4 — Shader uniform per cell

Custom floor material reads a per-cell `scorchIntensity` uniform
(or per-instance attribute via `InstancedBufferGeometry`).

- **Pros:** real-time, no extra geometry, integrates with future
  post-FX.
- **Cons:** significant shader work. Per-cell uniform = one uniform
  per draw call. Per-instance attribute requires an
  `InstancedMesh` refactor of the entire floor render path.
- **Verdict:** deferred. Future polish when post-FX pipeline lands.

## Approach 5 — Render-to-texture floor "splat" atlas

Maintain a per-arena texture (e.g. 256×256) onto which scorch is
rendered as the round progresses. Floor material samples it.

- **Pros:** industry-standard (Destiny, Doom Eternal). Persistent
  across the round. Smooth blending between decals.
- **Cons:** heavy. Three.js render-to-texture requires explicit
  pipeline setup + UV mapping per cell. ~2–3 ms/frame.
- **Verdict:** deferred. Significant new render-pipeline surface.
  Worth considering for MVP-4 polish.

## Approach 6 — Pooled `InstancedMesh` of decal quads

Pre-allocate one `InstancedMesh` of N decal quads. Each instance
has position + age uniform. Scorch system allocates an unused
instance per blast, updates per-instance attributes.

- **Pros:** ONE draw call for all decals. Pooled — no GC churn.
- **Cons:** requires `InstancedMesh` refactor. Fixed pool size.
- **Verdict:** deferred. Revisit if Approach 2 shows perf issues
  at scale (50+ simultaneous decals). For our scale (~20 max),
  Approach 2 is sufficient.

## Engine-side fix that landed alongside

While spiking the opacity-fade variant of Approach 1, we found a
real engine bug: `setMeshMaterialPatch` set
`material.transparent = patch.transparent` but never
`material.needsUpdate = true`. Three.js needs the latter to
recompile the shader for the alpha-blend pass; without it,
toggling `transparent: false → true` on an opaque-at-build material
silently does nothing. Fixed in `engine/render/three-render-adapter.ts`
inside S213. Unlocks future systems that want opacity-based fades
(revenge bomb arc trails, hit-flash, etc.).

## Path forward

Approach 2 shipped as S213. If a future story wants:
- richer fades / blending → revisit Approach 5 (splat atlas).
- many simultaneous scorches → revisit Approach 6 (pooled instanced).
- decals on cliff faces → revisit Approach 1 only after the cell
  mesh is stable across re-resolves (or move scorch logic into the
  re-resolve path explicitly).
