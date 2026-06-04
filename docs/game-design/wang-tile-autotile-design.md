# Wang Tile Autotile — AGF engine spec

> **Status: design intent.** First pass: 2026-05-28.
> Owner: dev terminal once promoted. First consumer: Kaboom Crew
> arenas (per-tile soft / hard block visual variety).
> Companion stories: `GDP-2026-05-28-002` (engine module) +
> `GDP-2026-05-28-004` (Kaboom Crew adoption).
> Memory: [project-visual-fidelity-evolution] — visual fidelity
> evolution including per-tile variety + autotiling.

---

## 1. The problem

Currently every soft block in an arena uses the same `block-solid`
shader on the same BoxGeometry. A row of 5 soft blocks reads as five
identical bricks. Same for hard blocks. The eye reads "monotonous
texture" instead of "interesting wall."

Two parts to the fix:

1. **Per-tile mesh + material variety** — each block family ships
   with multiple mesh variants (different bevels, different proportions,
   different small detail bumps), selected per cell.
2. **Autotiling via Wang tiles** — the SELECTION rule isn't random;
   it's driven by neighbour relationships. A soft block next to
   another soft block reads as "connected wall"; a soft block alone
   reads as "single brick"; a corner-of-soft-block-cluster reads as
   "corner piece". Wang tiles formalise this.

This doc specs both as one engine primitive — the autotile resolver
that any AGF project can use.

---

## 2. Wang tiles — 60-second primer

A Wang tile is a tile authored with markers on its FOUR CORNERS (or
FOUR EDGES — both encodings work). Each marker has a binary or
multi-valued "color". A grid is filled by placing tiles such that
ADJACENT corners (or edges) match colors.

For an autotile use case, the markers describe "this corner / edge
borders a [block-type-X] cell vs an [empty] cell". The resolver picks
the tile variant whose markers match the cell's neighbourhood.

Two-color edge-based Wang tiles for binary (block / no-block)
adjacency need **16 variants** per family — one for each of the 16
possible (north / east / south / west) edge combinations
(0000, 0001, …, 1111).

Corner-based encoding is more compact for some cases but harder to
visualise; this spec uses EDGE-BASED 16-variant Wang tiles.

---

## 3. Tile family schema

A "tile family" is the unit of authoring. Each project registers
families at bootstrap. Each family describes:

```text
WangTileFamily {
  name: string                   // 'soft-block', 'hard-block', 'floor-tile-stone'
  variants: WangTileVariant[16]  // exactly 16; index = neighbour-bitmask (N=8, E=4, S=2, W=1)
  defaultRotationY?: number      // applied to every variant (0|π/2|π|3π/2)
  scale?: [x, y, z]              // applied to every variant (default [1,1,1])
}

WangTileVariant {
  meshKey: string                // 'procedural:soft-block-corner', 'asset:kenney-block-001', ...
  materialOverrides?: {...}      // per-variant material tweaks (palette, bevel uniform, etc.)
  rotationY?: number             // optional per-variant rotation
  mirrorX?: boolean              // optional flip
}
```

The neighbour bitmask encoding (`NESW`):
- bit 3 (8): north neighbour is the SAME family
- bit 2 (4): east neighbour is the SAME family
- bit 1 (2): south neighbour is the SAME family
- bit 0 (1): west neighbour is the SAME family

So variants are indexed 0..15:
- 0  (0000) = isolated (no same-family neighbours)
- 1  (0001) = west-only (single block extending east-of-self)
- 2  (0010) = south-only
- 3  (0011) = south + west (corner top-right)
- ...
- 15 (1111) = surrounded (fully embedded in same-family wall)

---

## 4. Resolver behaviour

At scene load (or arena change) the engine walks every cell with a
WangTile-tagged component:

1. For each cell at (gx, gz): compute its FAMILY (read the cell's
   component, e.g. `SoftBlock`).
2. Check 4 cardinal neighbours: do they belong to the SAME family?
   For each, write 0 or 1 into the bitmask.
3. Index into family.variants[bitmask].
4. Spawn the variant's mesh + apply rotation + material.

When ANY cell's family-membership changes (a soft block destroyed by
blast, a new block spawned by a pressure plate), the resolver re-runs
for the changed cell AND its 4 cardinal neighbours (the neighbours'
bitmasks may have flipped).

This is the heart of the engine module. Two surfaces:
- `resolveAt(gx, gz)` — recompute one cell.
- `resolveAll(grid)` — full re-resolve (initial scene load).

---

## 5. ECS components

```text
WangTile (per cell) {
  familyName: string             // 'soft-block', 'hard-block', etc.
  currentVariantIndex?: number   // 0..15, written by resolver
  currentMeshEntityId?: EntityId // the rendered child entity
}

WangTileFamilyRegistry (singleton) {
  families: { [name: string]: WangTileFamily }
}
```

`WangTile` is owned by the project (the project's scene file places
WangTile on cell entities; project-specific block types — `SoftBlock`,
`HardBlock` — coexist with WangTile as the family-membership marker).

`WangTileFamilyRegistry` is owned by the engine module; projects
register families at bootstrap.

---

## 6. Systems

Single engine system: `WangTileResolverSystem`.

- Runs on scene load (full resolveAll).
- Subscribes to ECS family-membership change events (when a SoftBlock
  entity is destroyed, or spawned via pressure-plate, or…). Per
  event: resolveAt(cell) + resolveAt(4 cardinal neighbours).
- Reuses MeshHandleRegistry from S101 / engine procedural-mesh
  infrastructure to register WangTile variant meshes.

---

## 7. Variant authoring — two paths

### 7.1 Procedural variants (preferred for Kaboom Crew)

Each family ships ~4-8 procedural mesh BUILDERS — small functions
that emit a BufferGeometry parameterised by variant index. E.g.
`buildSoftBlockVariant(0)` returns the isolated-brick mesh;
`buildSoftBlockVariant(15)` returns the surrounded-wall mesh.

The procedural builders use `BoxGeometry` + tiny variations (bevel,
size jitter, side panels). Per-variant uniqueness via:
- Index-driven proportions: variants 0, 3, 12 have visible "edge"
  detail (rounded corners outward); variants 5, 10 have smooth
  "filling" detail (flat sides).
- Index-driven materials: variants 0 (isolated) get a brighter rim
  light; variants 15 (surrounded) get a darker base color.

No new assets. Pure code generation. Matches the no-artist
constraint from `characters-and-visual.md`.

### 7.2 CC0 asset variants (allowed but not preferred)

A project may register a family backed by CC0 asset meshes — e.g.
Kenney's blocky-pack has bevel-corner block models that already look
like Wang tile variants. The MeshHandleRegistry already loads such
assets.

This path is allowed when procedural variants prove insufficient
(e.g. an arena with photoreal-stone vibe that procedural geometry
can't sell). NOT preferred for the flagship sample.

---

## 8. Performance budget

Per arena resolve:
- Worst case: 17×17 cross arena = 289 cells. Each cell: 1 bitmask
  computation + 1 mesh swap. ~289 mesh-swaps at scene load.
- Per cell update on family-membership change: 5 cells re-resolved
  (self + 4 neighbours). Trivial.
- Mesh swaps happen in a Three.js buffer-rewrite path — no GC
  thrash.

Memory: 16 variants × ~4 families × ~3 KB each = ~200 KB total mesh
data across all registered families. Cheap.

Steady-state perf: nothing happens unless a cell changes family. No
per-frame work.

---

## 9. First consumer: Kaboom Crew

Three families register at Kaboom Crew bootstrap:

1. **`soft-block`** — destructible cells. 16 procedural variants:
   isolated brick, edge brick, corner brick, etc. Wood / crate vibe.

2. **`hard-block`** — permanent walls. 16 procedural variants:
   concrete / steel girder / brick wall vibe. Beveled and shadowed.

3. **`floor-tile`** — arena floor cells (per-arena theme). 16
   variants with subtle pattern differences. The current monolithic
   floor mesh becomes per-cell autotiled.

Per-arena themes (from `visual-style.md §9.2`) drive the family
selection: a 'warehouse' arena uses `soft-block-wood` + `hard-block-
concrete`; a 'lab' arena uses `soft-block-glass` + `hard-block-steel`.
Theme = family-key-prefix.

---

## 10. Open questions

1. **Per-corner Wang tiles vs per-edge?** This spec uses 4-edge / 16-
   variant. Per-corner needs 2^4 = 16 too (same count) but visualises
   differently. Edge-based is simpler; pick it for v1.
2. **Multi-color Wang tiles (e.g. soft + hard + special boundary)?**
   3-color edges would need 3^4 = 81 variants. Out of v1 scope —
   binary per family stays the rule.
3. **Random variation within a Wang index?** Two cells with same
   bitmask = same mesh. Could rotate per-cell randomly OR use 2-3
   sub-variants per index. Defer until playtest reveals monotony.
4. **Animated variants** — variant changes on destruction (S136 dust
   puff). Not in v1; the resolver re-runs on family-change and the
   new variant snaps in. Tween polish later.

---

## 11. Out of scope

- 3D Wang tiles (3D adjacency — top + bottom + 4 cardinals). Grid is
  2D for Kaboom Crew.
- Editor for variant authoring. Procedural code authors variants.
- Diagonal-adjacency Wang tiles. 4-cardinal only.
- Wang tile editor UI in-game. Variants are code-time, not runtime.
- Soft-edge blending between adjacent tiles (e.g. tile A blends to B
  at the shared edge). Out — tile boundaries are crisp grid cells.
