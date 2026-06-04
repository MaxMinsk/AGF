# Wang 2-Corner Tiles + Dual Grid — Definitive Tiling System for Kaboom Crew

> **Status: design intent.** First pass: 2026-05-30.
> Owner: dev terminal once promoted. SUPERSEDES the 4-edge Wang
> approach from `wang-tile-autotile-design.md` + shipped S169/S170/
> S176 engine module + integration. Pairs with `terrain-design.md`
> for the full terrain system.
>
> Reference articles (user-provided 2026-05-30):
> - Joe Strout — Wang 2-corner tiles: dev.to/joestrout/wang-2-corner-tiles-544k
> - Boris The Brave — 2-corner Wang: boristhebrave.com/permanent/24/06/cr31/stagecast/wang/2corn.html
>
> Memory: extends [project-visual-fidelity-evolution]. User asked for
> 'прекрасную систему тайлинга чтоб уровни смотрелись живо и красиво'
> — the 4-edge approach was MVP; 2-corner is the real answer.

---

## 1. Why supersede the 4-edge approach

S169 + S170 + S176 ship a 4-edge Wang engine module + Kaboom
integration. The 4-edge encoding works but has fundamental
limitations exposed by user feedback 2026-05-29:

1. **'набор кубов' visual** — even with 16-variant proper rotation
   (GDP-2026-05-29-004 pending), every tile aligns to grid cells.
   Boundaries between terrain types are CRISP and read as 'two
   different floors stuck next to each other'.
2. **No inter-family blends** — grass meets path with a sharp seam.
   Inter-family blending was explicitly OOS in `wang-tile-autotile-
   design.md §11`.
3. **Corner ambiguity** — when grass-grass-dirt-dirt meet at a
   corner, the 4-edge encoding can't pick a 'corner-blend' tile.
   Each cell makes its decision independently.

The 2-corner approach (per Strout / Boris The Brave) solves all
three by INVERTING the tile-to-grid relationship.

---

## 2. The core insight — corners, not edges; dual grid offset

### 2.1 Logical grid (data) vs render grid (visual)

- **LOGICAL GRID** — what the game thinks of as cells. Each cell
  has a terrain TYPE (grass / dirt / stone / path / floor). This is
  unchanged from today.
- **RENDER GRID** — what gets drawn. **OFFSET by (+0.5, +0.5) from
  the logical grid.** Each render tile sits CENTERED ON THE CORNER
  between 4 logical cells.

```
Logical cells (data):        Render tiles (visual):
+---+---+---+                  +---+---+
| G | G | D |  →               | A | B |
+---+---+---+                  +---+---+
| G | D | D |                  | C | D |
+---+---+---+                  +---+---+
| S | S | D |
+---+---+---+

Each render tile (A/B/C/D) sits at a CORNER where 4 logical cells
meet. Its 4 corners INHERIT the type of those 4 logical cells.
```

Tile A's corners read [G, G, G, D] (clockwise from top-left).
Tile B's corners read [G, D, D, D].

### 2.2 Tile lookup by corner-type tuple

Each render tile is picked from a family-specific 16-variant lookup
table indexed by the 4-corner bitmask: each corner bit = 1 if same
family, 0 otherwise. For BINARY family membership (grass vs
not-grass), 16 variants per family.

The variants represent CORNER-BLEND SHAPES:
- All 4 corners same family (bitmask 15) → fully-filled tile.
- 3 same + 1 different (bitmask 7, 11, 13, 14) → outer-corner curve.
- 2 same diagonal (bitmask 6, 9) → diagonal-stripe / saddle.
- 2 same adjacent (bitmask 3, 12) → half-and-half edge.
- 1 same + 3 different (bitmask 1, 2, 4, 8) → inner-corner curve.
- 0 same (bitmask 0) → tile shows none of THIS family — render as
  whichever neighbour family's tile applies.

The CURVE between two families is encoded in the tile mesh — grass
curves around the corner into path naturally. **Inter-family blends
are FREE** because each tile inherently knows about TWO families
(the 'same' family + the 'other' family).

### 2.3 Why this looks better

- Boundary between terrain types CURVES through tile corners
  instead of jumping to next cell.
- 4 logical cells meeting at corner → 1 render tile interprets ALL
  4 contexts at once → can show smooth quad-blend.
- Render tile sits on corner → game NEVER renders a 'seam' between
  two cell boundaries; seams move INTO tile interiors and get
  resolved by mesh geometry.
- Result: arena reads as ORGANIC TERRAIN, not GRID-ALIGNED PATCHES.

---

## 3. Engine implementation — extension to existing Wang module

The 4-edge Wang module from S169 stays available for projects that
want it. NEW: a parallel 2-corner Wang module under
`engine/render/autotile-2corner/`.

### 3.1 New ECS components

```text
LogicalCellTerrain {
  family: string             // 'grass', 'path', 'stone', 'dirt', 'floor'
}
// Already exists as FloorTerrain — rename or alias.

RenderTile2Corner (per render-grid position) {
  // Render tile sits at logical-grid corner (gx + 0.5, gz + 0.5).
  rgx: number               // render-grid X (integer)
  rgz: number               // render-grid Z (integer)
  family: string            // family of THIS render tile
  cornerBitmask: number     // 0..15, bits = NW, NE, SE, SW corner-same-family checks
  currentVariantIndex: number
  currentRotationYDeg: number
  currentMeshKey: string
}
```

### 3.2 New resolver

`engine/render/autotile-2corner/render-tile-resolver-system.ts`:

- For each render-grid position (rgx, rgz):
  - Look up the 4 logical cells at corners: NW=(rgx, rgz), NE=(rgx+1, rgz),
    SE=(rgx+1, rgz+1), SW=(rgx, rgz+1).
  - Determine 'primary family' for this render tile: the one with
    the MOST corner instances (ties broken by family-priority
    order). If all 4 corners agree → that family. If split 2-2 →
    use the family with higher priority per a registered priority
    list.
  - Compute corner bitmask: 4 bits, each set if that corner's
    logical cell == primary family.
  - Look up variant + rotation in the registered family's 2-corner
    table.
  - Write RenderTile2Corner component.

Per family-membership change event (e.g. soft block destroyed, ramp
spawned), re-resolve the 4 surrounding render tiles (each render
tile depends on 4 corners, so a single logical cell change affects
up to 4 render tiles).

### 3.3 Family registration

```text
WangCornerTileFamily {
  name: string
  variants: WangTileVariant[16]   // exactly 16, indexed by corner bitmask
  defaults?: {...}
}
```

Same registry API as the 4-edge module — just registered under a
different namespace.

### 3.4 Multi-family priority order

When two families share corners 2-2, the tile picks the
higher-priority family for rendering. Priority order is per-project
configuration:

```text
familyPriorityOrder: ['floor', 'dirt', 'path', 'grass', 'stone']
// floor = lowest priority (filler / default)
// stone = highest priority (sharp / always wins)
```

This makes grass-meets-stone render as STONE with a grass-curve
into stone — clean visual hierarchy.

---

## 4. Tile authoring — 16 variants per family

Each family ships 16 procedural builders (or sub-variant-arrays per
the existing sub-variant support from the 4-edge module).

For the GRASS family, the 16 variants are:

| Bitmask | Corners (NW,NE,SE,SW) | Tile shape | Notes |
|---|---|---|---|
| 0  | _,_,_,_ | NOT GRASS — renders whatever non-grass family applies | edge case |
| 1  | G,_,_,_ | NW-corner curve — grass tuft on NW, fades into non-grass | inner corner |
| 2  | _,G,_,_ | NE-corner curve | mirror of 1 |
| 3  | G,G,_,_ | NORTH half — grass on top half, non-grass on bottom | half-and-half |
| 4  | _,_,G,_ | SE-corner curve |  |
| 5  | G,_,G,_ | DIAGONAL — grass on NW + SE, non-grass on NE + SW | saddle |
| 6  | _,G,G,_ | EAST half |  |
| 7  | G,G,G,_ | OUTER NW corner — non-grass corner in SW only | outer curve |
| 8  | _,_,_,G | SW-corner curve |  |
| 9  | G,_,_,G | WEST half |  |
| 10 | _,G,_,G | DIAGONAL — opposite saddle |  |
| 11 | G,G,_,G | OUTER SE corner — non-grass corner only in SE | outer curve |
| 12 | _,_,G,G | SOUTH half |  |
| 13 | G,_,G,G | OUTER NE corner |  |
| 14 | _,G,G,G | OUTER SW corner |  |
| 15 | G,G,G,G | FULLY GRASS — flat interior with full blade displacement | filler |

The CORNER-CURVE variants (1, 2, 4, 8) and OUTER-CORNER variants
(7, 11, 13, 14) are the KEY to organic blends. They contain the
GRASS-TO-NEIGHBOUR transition geometry: grass-blades curving around
the corner, fading into the neighbour's texture/colour.

### 4.1 Same builders, different role from 4-edge

The grass family from S176 + GDP-2026-05-29-007 (pending grass
rewrite) produces grass MESHES. Those meshes get re-used here, but
the SHAPE LIBRARY needs new entries for corner-curves. ~5 new mesh
shapes per family (8 corner-curves group into 2 mirror-pair shapes,
4 halves, 4 diagonals/outer-corners group similarly).

---

## 5. Visual result

Compare on a 4×4 arena with grass + path mix:

### 5.1 Old 4-edge approach

```
[GG][GG][PP][PP]
[GG][GG][PP][PP]
[GG][GG][PP][PP]   → vertical seam between grass + path cells.
[GG][GG][PP][PP]      Boundary reads as 'two patches glued together'.
```

### 5.2 New 2-corner approach

```
Logical grid (data, unchanged):
[G][G][P][P]
[G][G][P][P]
[G][G][P][P]
[G][G][P][P]

Render tiles (offset by 0.5, sitting at corners):
[GG][GG][G→P][PP][PP]
[GG][GG][G→P][PP][PP]
[GG][GG][G→P][PP][PP]
[GG][GG][G→P][PP][PP]
[GG][GG][G→P][PP][PP]

The G→P tile column shows grass curving smoothly into path. No
seam — the transition lives inside tile meshes.
```

---

## 6. Migration strategy from current 4-edge approach

The 4-edge work (S169 engine + S170 integration + S176 grass)
remains valid for projects that prefer it. Kaboom Crew migrates as
a project-side decision.

### 6.1 Steps

1. Engine: add the 2-corner module ALONGSIDE the 4-edge module.
   Both stay available. Project picks.
2. Kaboom: re-register families using the 2-corner pattern. Logical
   grid (FloorTerrain component on cells) stays unchanged. Render
   path swaps from 4-edge → 2-corner.
3. Add new mesh shapes per family for corner-curves + outer-curves
   (5 new shapes per family).
4. Engine doctor section reflects which Wang variant (4-edge or
   2-corner) is in use per family.
5. Existing scenes work unchanged (logical grid is what they
   author).

### 6.2 Hybrid support

- Cliff faces (per GDP-2026-05-29-006, pending) can stay on 4-edge
  Wang — cliff face autotile less sensitive to inter-family blends
  (cliff faces are typically ONE family per cliff edge).
- Block walls (hard/soft blocks per S170) can also stay 4-edge.
- ONLY floor cells benefit from 2-corner — these are where seams
  matter most.

---

## 7. Risks + open questions

### 7.1 Risks

- **Render-grid offset visual confusion** — render tiles offset by
  +0.5 from logical grid might cause the visible grid to LOOK
  offset from gameplay. Mitigation: gameplay uses logical grid for
  all position math (unchanged); render tiles sit on top
  visually + gameplay overlays (highlight cells, etc) use logical
  coordinates. Doesn't conflict in practice.
- **More tile variants needed** — 5 new mesh shapes per family
  vs the 4 currently. ~25 additional procedural mesh builders
  across 5 families. Manageable.
- **Performance** — render-grid size = logical-grid size + 1 in
  each dimension (corners extend one beyond cells). ~10% more tile
  meshes. Acceptable.

### 7.2 Open questions

1. **3-color Wang (3 families competing at one corner)?** With 5
   families and the 2-color binary corner approach, a tile with
   corners [grass, path, stone, dirt] resolves by family priority.
   Could expand to 3-color (3^4 = 81 variants per family pair) for
   smoother triple-blends. Defer to v2.
2. **Sub-variant random pick within a Wang index?** Same hash-based
   variance approach as 4-edge module. Defer to follow-up polish.
3. **Animation** (water shimmer, rippling grass) — orthogonal to
   the 2-corner system. Defer.

---

## 8. Out of scope

- Full 3-color (or N-color) Wang for triple+ family corners. Binary
  per family stays.
- Per-cell sub-variant randomisation. Future polish.
- 3D corner-encoded Wang (top-corner + bottom-corner for cuboids).
  Stays 2D top-down for floors.
- Cliff face migration to 2-corner (cliff stays 4-edge per §6.2).
- Block-wall migration to 2-corner (blocks stay 4-edge).
- Visual editor for tile variant authoring. Procedural code authors.
