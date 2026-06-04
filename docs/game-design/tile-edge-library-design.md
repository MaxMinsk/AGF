# Tile Edge Library System — Comprehensive Tiling Architecture

> **Status: definitive design.** 2026-06-03.
> Supersedes wang-tile-autotile-design.md (legacy 4-edge approach for
> hard/soft blocks stays). Supersedes wang-2corner-design.md (academic
> until multi-primary terrain ever needed). Bundles user feedback from
> 2026-05-29 / 2026-05-30 / 2026-06-03 into one coherent architecture.

---

## 1. User-stated goals (4 rounds of feedback)

1. (2026-05-29) Tiles look like "набор кубов" — visible cell-grid alignment, all edges look same.
2. (2026-06-03 a) Grass islands read as squares, not organic shapes.
3. (2026-06-03 b) Pattern applies to ALL biomes + cliffs, not just grass.
4. (2026-06-03 c) Edges must be IRREGULAR (no perceptible repetition) via variations.

Implied requirements:
- ORGANIC visual — curved/irregular edge outlines, not square cells
- HIDDEN GRID — cell boundaries invisible to the eye
- VARIETY — no two cells look identical, even with same Wang context
- UNIFORMITY OF PATTERN — same approach for grass, path, stone, dirt, cliffs

---

## 2. Current shipped state (what works, what's broken)

| Component | Shipped | Status |
|---|---|---|
| Engine Wang module | S169 | ✅ 16-bitmask resolver works |
| Wang rotation per bitmask | S214 | ✅ 5 shapes × 4 rotations = 16 distinct outcomes |
| Block walls (hard/soft) | S165 + S170 | ⚠ box-only, no sub-variant variation |
| Grass family | S176 | ❌ flat 1×0.05×1 boxes with vertex tint only |
| Per-arena themes | S171 + S172 | ✅ palette tints work |
| Variable height + cliffs | S173 | ✅ cuboid cells, cliff auto-detect |
| Cliff face geometry | (none) | ❌ plain side material, no autotiling |
| Sub-variant support | (none) | ❌ engine doesn't allow N alternates per Wang index |

**The gap**: Wang resolver works mechanically, BUT each Wang index maps to ONE mesh — no sub-variant variation, no curved XY outlines, no overhang. Adjacent cells with same bitmask look identical → visible repetition.

---

## 3. Architecture: 7-layer rendering pipeline

The full pipeline from data to pixels:

```
LAYER 1: Logical grid (data)         ← cells have type + height + overlays
   ↓
LAYER 2: Floor base                   ← single stretched-box backdrop OR per-cell cuboid for variable-height
   ↓
LAYER 3: Biome overlays               ← per-biome Wang families (grass/path/stone/dirt)
                                          KEY: overlay = on top of floor; no transition tiles to floor
   ↓
LAYER 4: Cliff faces                  ← vertical edges between height-differing cells
                                          Wang family per cliff orientation; same edge-mesh pattern
   ↓
LAYER 5: Wall shadows                 ← per-cell overlay near walls/cliffs (secondary Wang)
   ↓
LAYER 6: Decals (scorch/footstep)     ← per-event entities (shipped S213)
   ↓
LAYER 7: VFX particles                ← blast bursts, dust, hover sparkles, etc.
```

Each layer is independent — no inter-layer Wang transitions needed.

This OVERLAY ARCHITECTURE is the key simplification — instead of multi-primary terrain with inter-family blending (which needs 2-corner Wang per GDP-2026-05-30-003), we have ONE primary (floor) + N overlay families. Each overlay handles its own outline via curved-edge meshes + overhang.

---

## 4. Three key innovations needed

### 4.1 Sub-variant support in engine Wang module

Current `variants[16]` → extend to `variants[16][]` (group of N alternates per Wang index).

Resolver chooses sub-variant per-cell via deterministic hash:

```
subIdx = hash(cellGx, cellGz, sceneSeed) % variants[bitmask].length
mesh = variants[bitmask][subIdx]
```

Backwards-compatible: single-array families still work.

### 4.2 Curved XY outline geometry (per family per shape)

Instead of `BoxGeometry(1, h, 1)`, each Wang variant generates:

1. Choose outline polygon based on Wang shape (A-F per §6 below).
2. For open edges: sample curved profile (Bezier 6-10 points OR offset arc).
3. Apply sub-variant control point displacement (different curve per sub-variant).
4. Extend mesh OUTSIDE cell boundary by 0.15-0.20 cells on open edges (the OVERHANG).
5. Triangulate via Three.js ShapeGeometry OR custom builder.
6. Apply Y-axis displacement (blade noise for grass, bevel for stone, etc.).
7. Side faces: extrude downward to floor level with Y-slope on overhang.

### 4.3 Per-biome interior detail recipe (vertex displacement style)

Each family has its CHARACTERISTIC interior:

| Biome | Interior detail | Edge curl direction | Overhang Y profile |
|---|---|---|---|
| Grass | Blade-noise vertex Y bumps | Down + out (blades drape) | Slope to 0.05 over 0.15 cells |
| Path | Smooth shallow slope inward | Down + out (smooth) | Slope to 0.10 over 0.20 cells |
| Stone | Sharp bevel + mortar seams | Down (sharp 45° bevel) | No overhang (geometric) |
| Dirt | Irregular bumps (vertex Y noise larger) | Down + out (crumbled) | Slope to 0.0 over 0.20 cells |
| Cliff-face | Bevel + crevice details | Y-axis (vertical edges) | Undercut into floor below |

---

## 5. Engine surface

### 5.1 `engine/render/autotile/` extensions

```text
WangTileFamily (schema):
  name: string
  variants: WangTileVariant[16] | WangTileVariant[16][]   // ← sub-variant support
  defaultRotationY?: number
  scale?: [x, y, z]

WangTileVariant (unchanged):
  meshKey: string
  materialOverrides?: {...}
  rotationY?: number
  mirrorX?: boolean
```

Resolver behaviour:
- If variants is `[16]`: pick variants[bitmask] (current behaviour).
- If variants is `[16][]`: pick variants[bitmask][hash(cell, seed) % len].

### 5.2 Edge mesh builder library (project-side)

Pattern: each family registers `(bitmaskIdx, subVariantIdx) → BufferGeometry`. Engine doesn't dictate WHAT the geometry looks like — only that it conforms to the Wang topology contract (correct connection-to-neighbour points).

```text
registerWangFamily('grass', {
  bitmasks: 16,
  subVariantsPer Index: 3,
  builder: (bitmask, subIdx) => buildGrassVariant(bitmask, subIdx)
});
```

Project ships per-family builders.

---

## 6. Wang shape table (universal across families)

5 base shapes, applies to ALL biomes + cliffs.

| Shape | Bitmasks | Topology | Per-family variation |
|---|---|---|---|
| A — Isolated | 0 (no neighbours) | Round/oval. All edges curved. | Grass: small mound. Stone: small pillar. Cliff: column. |
| B — Edge | 1, 2, 4, 8 (single neighbour) | 1 closed edge flush + 3 open curved + overhang. | Grass: 3-side curl. Stone: 3-side bevel. |
| C — Corner | 3, 6, 9, 12 (two adjacent neighbours) | 2 closed flush + 2 open curved. | Convex corner. |
| D — Straight | 5, 10 (two parallel neighbours) | 2 closed flush parallel + 2 open curved. | Wavy strip. |
| E — T-junction | 7, 11, 13, 14 (three neighbours) | 3 closed flush + 1 open curved. | Single-side bulge. |
| F — Filler | 15 (surrounded) | 1×1 square. No curves. Maximum interior detail. | Grass: dense blades. Stone: tight mortar. |

S214's rotation lookup re-used unchanged — each cell uses shape from this table + rotation per Wang index.

---

## 7. Sub-variant pattern (the "no repetition" magic)

For each shape, ship 3 sub-variants. Same connection topology, different INTERIOR detail.

Example — Shape B (single-edge) for grass, 3 sub-variants:
- sub A: curve peaks at (0.18, 0) — center bulge.
- sub B: curve peaks at (0.20, 0.10) — off-center bulge.
- sub C: two smaller bulges at (0.10, ±0.15) — undulating.

All 3 share the same connection point at the closed-edge cell boundary, so they tile cleanly with neighbouring grass cells regardless of which sub-variant the neighbour picks.

Per-cell sub-variant selection: deterministic hash. Adjacent cells with same Wang bitmask pick DIFFERENT sub-variants → cluster looks irregular.

Per-family sub-variant count is tunable: grass = 3, stone = 2 (geometric biomes need less variation), dirt = 4 (more random is better), cliff = 2.

---

## 8. Cliffs = the biome tile, EXTRUDED tall (revised 2026-06-04)

> **Superseded approach:** an earlier draft (and S293) built a SEPARATE
> cliff-face system — cliff-grass/cliff-stone biomes, vertical face meshes
> over cliff EDGES, corner caps. It read as coloured CUBES and thrashed.
> The game camera is orthographic pitched −55° (angled top-down): the
> most-visible line is the TOP EDGE, not the vertical face. Elaborate
> face geometry is invisible or artefacts. Dropped.

**A cliff is not a special thing. It is a biome tile that is tall.**

A raised cell renders the SAME curved-outline Wang tile as flat ground —
the biome's corner / edge / strip / T / filler shapes + 3 sub-variants —
just EXTRUDED to the cell's height, with the side walls painted in the
biome's colour but darker.

- **Top face**: the normal curved Wang outline (organic corners + overhang),
  placed at Y = cell height. A grass plateau looks like grass; a stone
  plateau like stone — same tile, raised.
- **Side walls**: the existing extruded side faces (the biome tile already
  builds darker sides — they're just thin at 0.20), extended down to the
  drop. Colour = biome top × a vertical darken ramp (~0.6× crown → ~0.35×
  base = contact shadow). Literally "the top colour, but darker".
- **Autotiling**: a raised cell's bitmask is computed over cardinal
  neighbours that are ALSO raised to the same height AND same biome. Flush
  where the plateau continues (tiles merge), open + curved + tall dark side
  where it drops off. Plateaus get rounded convex corners (Shape C) exactly
  like a flat island — no cubes, no corner caps.
- **Overhang** sits at the TOP rim (grass lip curling over the drop) — reads
  correctly from the −55° camera because it is on the silhouette, not the
  face.
- **delta ≥ 2**: same tile, taller extrusion. Stacks naturally.

No separate cliff biomes, no cliff Wang resolver, no corner caps, no pillar
boxes. The C-1 seam-pin / C-3 split-normals / C-4 corner-rounding rules
(§4.4) apply unchanged. Implementation: GDP-2026-06-04-009.

---

## 9. First consumer: grass family rewrite (this story's scope)

Replaces S176 grass-variants.ts.

Per cell:
- 5 shapes × 4 rotations × 3 sub-variants = 60 distinct meshes generated procedurally + cached.
- Per-cell hash picks one of the 3 sub-variants for the resolved Wang bitmask.
- Mesh is curved-outline polygon with 0.18 cell overhang on open edges.
- Subdivided top face (~10×10) with blade-noise Y displacement.
- Side faces extrude to Y=0.05 with downward slope on overhang vertices.
- Vertex colours: GRASS_PRIMARY base + HIGHLIGHT at Y-tips + SHADOW at Y-roots.
- Theme palette overridable (S172 pattern).

Performance budget:
- 60 cached meshes × ~200 vertices avg = ~12000 vertices in mesh cache. ~150KB. Fine.
- Per-cell render: 1 entity, ~200 vertices. At 100 grass cells: 20000 vertices. Fine.
- Wang resolver cost unchanged.

---

## 10. Follow-up roadmap (separate stories — pattern propagates)

| Story | Topic | When |
|---|---|---|
| THIS (GDP-2026-06-03-001) | Engine sub-variant support + grass first consumer | This batch |
| GDP-2026-06-04-001 | Cliff face Wang adaptation + 2 cliff biomes (cliff-grass, cliff-stone) + corner caps | After 06-03-001 ships |
| GDP-2026-06-03-003 (filed by dev) | Path / Stone / Dirt biome overlays — apply pattern | After 06-03-001 ships |
| GDP-2026-06-03-004 (filed by dev) | Wall-shadow Wang layer (per-cell darkening overlay near walls + cliffs) | After cliff face shipped |
| GDP-2026-06-03-005 (filed by dev) | Block walls (hard/soft) sub-variants — apply pattern to S170 family | When time permits |

Engine extension lands ONCE. Per-family adoption ships independently.

---

## 11. Architecture decisions explicit

- **Overlay architecture vs multi-primary**: chose overlay (single floor primary + N overlays). Simpler. No inter-biome transition tiles. GDP-2026-05-30-003 (Wang 2-corner) deferred.
- **Edge curves: Bezier vs ShapeGeometry**: choose Bezier-sampled polygon with manual triangulation. Three.js ShapeGeometry as fallback if Bezier sampling becomes too complex.
- **Sub-variant count per family**: tunable. Grass=3, stone=2, dirt=4, cliff=2. Higher number = more visual variety but more authoring + larger cache.
- **Overhang amount**: 0.18 cells default (grass). Per-family override (stone=0 — geometric, no overhang). Tunable.
- **Performance ceiling**: 200 vertices per cell × 100 cells per arena = 20000 vertices per biome. Total scene budget ~50000 vertices is fine for 60fps web.
- **No floor-overlay transition tiles**: overhang naturally hides cell boundaries — eliminates the need.
- **Sub-variant cell-hash**: deterministic per (gx, gz, sceneSeed). Replay-stable.

---

## 12. Out of scope

- Multi-primary terrain blending (multiple floor types coexisting). Deferred — overlay architecture sufficient.
- Animated tiles (wind sway grass, flowing water lava). Future polish, separate stories.
- Player-paintable terrain (in-game editor). Out indefinitely.
- LOD (level-of-detail) variation for distant tiles. Out — closer camera (S163) keeps all tiles in view.
- Per-cell custom geometry (override the procedural builder). Procedural only.
- Procedural mesh BAKING (pre-compute meshes once at build time vs runtime). Defer — runtime per-cell hash-driven is fine.
