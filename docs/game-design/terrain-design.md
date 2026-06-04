# Terrain Design — Floor Wang Tiles + Variable Height + Ramps & Cliffs

> **Status: design intent.** First pass: 2026-05-28.
> Scope: two interconnected systems — non-repeating floor tiling
> via Wang families + variable per-cell height with ramps + cliffs.
> Owner: dev terminal once promoted via stories. First consumer:
> Kaboom Crew arenas. Memory: extends
> [project-visual-fidelity-evolution] direction.

---

## 1. The combined brief

User request 2026-05-28:

1. **Floor Wang tiles for variety.** Background floor cells use Wang
   tiles → no visible tiling. Multiple terrain types (grass / path /
   stone / dirt / floor) coexist. Wall-cast shadow gradients (darker
   near walls, lighter far). Smooth transitions between terrain
   types.

2. **Variable height per cell.** The map stays **logically 2D** — a
   bomber occupies one XZ cell, no other bomber can be in the same
   XZ cell, regardless of vertical height. But each cell has its own
   Y elevation. Bombers + bombs + pickups sit on top of the cell.
   **Cliffs** (height delta between neighbours) act as walls.
   **Ramps** are special tiles that allow movement across height.

These two systems share visual + scene-authoring infrastructure
(both layered on top of the Wang autotile engine module from
`GDP-2026-05-28-002`), so they're designed together.

---

## 2. Variable height system

### 2.1 Core rules

- Every cell entity gains a `Height` component: integer `h ∈ 0..MAX`
  (MAX=4 in v1, configurable; arena-author picks reasonable heights).
- Cell mesh becomes a **cuboid** of dimensions `(1, h+1, 1)` — flat
  top face at Y = h, side faces from Y=0 to Y=h (cliff face).
- Bomber's Transform.position.y = `cell.height` (bomber stands on
  the top face).
- **Logical XZ occupancy** unchanged: only ONE bomber per (gx, gz).
  Bombers cannot stand atop one another. Height is purely vertical
  framing.

### 2.2 Cliffs

- A cliff is the EDGE between two adjacent cells whose height
  difference is > 0.
- A bomber walking from cell A (height h_A) to cell B (height h_B):
  - If `h_A == h_B` → traversal allowed (normal grid movement).
  - If `h_A != h_B` AND no Ramp connects them → cliff blocks
    traversal. Treated by `GridOccupancySystem` as if a hard block
    sat at the edge.
  - If a Ramp connects A and B → traversal allowed (see §2.3).
- Cliffs from bomber's perspective: the lower cell looks UP at a
  wall; the higher cell can look DOWN over the edge but can't
  step off (the lower cell is treated as blocked).

### 2.3 Step jumps — auto-hop on delta=1 cliff (no ramp needed)

**Refined rule (2026-05-28)**: cliffs at height delta = 1 are
**step-jump-traversable** — bomber automatically arc-jumps to the
higher/lower cell. delta ≥ 2 cliffs remain impassable without a Ramp.

- Walking INTO an adjacent cell with delta = 1 (either direction):
  - GridMover doesn't refuse the move.
  - Bomber commits to a JUMP — Y position lerps along a parabola
    (peak ~+0.4 cells above the higher of from/to heights).
  - Total jump time: ~0.4 seconds (slightly longer than normal
    cell-tween).
- Animation: brief crouch (0.05s) → launch arc (0.30s) → landing
  thud (0.05s). Visible "hop" telegraph.
- Direction is COMMITTED mid-jump — bomber cannot reverse.
- Other entities (bombers, bombs) still block at destination —
  if destination occupied, the JUMP itself is REFUSED before
  starting (treat as cliff edge).
- Blast can hit bomber mid-jump → ragdoll fires from current arc
  position.

When a Ramp ALSO exists at the same edge: ramp wins (smooth multi-
cell traversal). Naked delta=1 cliff without ramp = auto-jump.

### 2.4 Ramps

- A `Ramp` component on a cell indicates it bridges a height delta:
  ```
  Ramp { fromHeight: integer, toHeight: integer, fromDir: 'N'|'E'|'S'|'W', toDir: opposite }
  ```
- Ramp tiles connect two adjacent cells with height delta = `|to -
  from|`. Bomber walking from the from-direction enters the ramp at
  fromHeight; walking through it, emerges at toHeight on the to-side.
- v1 constraint: ramp connects cells with height delta ≤ 1.
  Steeper ramps (delta=2+) need multi-cell ramps (cells in series,
  each delta=1).
- Visual: ramp mesh is a wedge tilted between the two heights. Top
  surface gives a walking ramp; side faces match cliff palette.
- Bomber on a ramp: Transform.position.y = `lerp(fromHeight,
  toHeight, traversalProgress)`. Smooth height transition during
  the cell-tween.

### 2.5 Bomb + blast behaviour (2D-only, height-aware ONLY for
       block-line-of-sight)

**Design decision** — blast propagation stays **2D / grid-driven**,
not full 3D physics. The height matters only for cliff blocking +
visual.

- Bomb placed on cell A (height h_A): bomb stays at Y = h_A.
  fuseRemaining ticks unchanged.
- Blast propagation walks XZ cardinal directions. At each cell:
  - If next cell's height delta vs the bomb's cell == 0 → blast
    continues normally.
  - If delta != 0 (cliff between them) → blast STOPS (cliff treated
    as hard-block-equivalent for blast).
  - This is a clean rule: bomber on H=2 is safe from a bomb at
    H=0 in an adjacent cell with cliff between them. Bomber on H=2
    is killed by a bomb at H=2 in the same row.
- Same-height-but-ramp-connected cells: blast walks through the
  ramp normally (the ramp is logically flat-traversal).
- Bomb kicked into a cliff edge: stops at the edge (treated as
  blocking — same as kicking into a hard block per S100).
- Bomb thrown (Throw Glove S144) over a cliff: arc still works,
  bomb lands at destination cell's height. If destination is a
  cliff-higher cell, bomb lands on top of the cliff (this is the
  intended verb — throw OVER the wall).
- Pickup on cell at height h: bomber must reach that cell via legal
  traversal (cliff or ramp) to collect it. Pickup mesh sits at the
  cell's top face.

### 2.5 Pathfinding (bot AI + agent.gotoCell)

- The grid-occupancy graph gains "edge weights" per direction:
  - 0 (free) if adjacent cell same height + same family.
  - 0 (free) if connected by a ramp.
  - ∞ (blocked) if cliff between them.
- Bot's BFS / A* respects these edges. Falls back to "can't reach"
  for cliff-isolated cells.
- The existing `agent.gotoCell` BFS (S82) extends with the same
  rule: cliffs block, ramps bridge.

### 2.6 Visual representation

- Cell mesh: a `BoxGeometry` with parametric Y = `h + 1`. Bottom at
  Y=0, top at Y=h.
- Top face (where bomber walks): full floor Wang variant + shadow
  layer (per §3 below).
- Side faces (cliff faces): a dedicated `cliff-face` material —
  vertically-tiled stripe or panel pattern in a darker palette
  variant. NOT a Wang tile (cliff faces don't need adjacency
  awareness; they're just visual fill).
- Ramp mesh: a wedge geometry tilted between two heights. Top
  surface uses floor Wang. Side faces use cliff-face material.

### 2.7 Camera + visibility

- Camera follow from S163 extends — camera Y tracks bomber's Y
  (Transform.position.y), so bombers on a high cell keep visible
  framing.
- Edge clamp considers terrain height — cells outside the camera's
  viewing volume but at HIGHER elevation should NOT cause weird
  framing. Edge clamp uses arena bounds, not terrain bounds, so
  this stays simple.
- Tall cells may occlude bombers behind them. The `outline-
  occluder` shader from `visual-style.md §3` is the existing remedy
  — apply it to bombers behind cliff geometry.

### 2.8 Arena authoring

- Scene file gains a `heightmap?: number[][]` field — a 2D array
  matching arena dimensions, each entry = the cell's height.
- Default: `0` everywhere (current behaviour, fully flat arena).
- Arena variants from S140+S143 (corridor / cross / plaza / pit
  etc.) stay flat in their existing forms. NEW height-aware arenas
  ship as additional variants (e.g. `tiered-plaza.scene.json`,
  `cliffside.scene.json`).

---

## 3. Floor Wang tiles — multi-terrain + shadow layer

### 3.1 Multi-family floor

The base Wang engine module from `GDP-2026-05-28-002` is **per-
family binary**. For floor, we register MULTIPLE families
simultaneously:

- `floor-grass` family — soft natural look. 16 variants.
- `floor-path` family — packed dirt / cobblestone walking path. 16
  variants.
- `floor-stone` family — laid stone tiles. 16 variants.
- `floor-dirt` family — bare dirt. 16 variants.
- `floor-floor` family — indoor lab/warehouse flat floor. 16
  variants.

Each cell entity has a `FloorTerrain` component:

```
FloorTerrain {
  family: 'grass' | 'path' | 'stone' | 'dirt' | 'floor'
}
```

The Wang resolver computes the bitmask **per family** for each
cell: bit set if neighbour is SAME family. For grass cell with all
4 neighbours also grass → variant 15 (surrounded fill); grass with
no grass neighbours → variant 0 (isolated patch).

When neighbours are DIFFERENT families, the cell uses its own
family's variant for the relevant bitmask position (treats
different-family neighbours as "non-grass", so the variant has the
appropriate edge detail).

This gives **sharp transitions** — grass edge meets path edge,
each picks their own family's edge-variant, they meet at the cell
boundary. Cleaner than blended transitions (which would need
inter-family Wang tables — out of v1 scope).

### 3.2 Wall-shadow Wang layer (NEW concept)

Floors near walls cast a shadow gradient. Instead of computing it
per pixel (expensive) or per shader (complex), use a **SECOND Wang
layer** specifically for wall-proximity shadows.

`WallShadow` component on cells near walls:
```
WallShadow {
  family: 'wall-shadow'
  intensity: number  // 0..1, darkness multiplier
}
```

At scene load, every floor cell has its 4 cardinals checked. If a
neighbour is a `HardBlock` (height > 0 counts too — cliffs cast
shadow), the cell is tagged `WallShadow`. Cells 1 step further get
a lighter intensity. Cells 2+ steps away — no shadow.

The shadow LAYER is a SECOND mesh rendered on top of the floor
Wang result. Renderer composites: base floor + shadow overlay =
final.

The shadow layer ALSO uses Wang resolution — but its 16 variants
all show "shadow on edge near wall" patterns, NOT terrain. The
bitmask: which cardinals are CLOSER to a wall than this cell.
Variant 0 (no wall nearby) renders nothing (transparent). Variant
8 (wall to N) renders a darker stripe on the N edge of the cell.
Variant 15 (walls all around) renders a uniformly darker cell.

### 3.3 Wall-shadow + height interaction

Variable height (per §2) introduces a richer wall-shadow surface:
- A bomber's cell at H=0 next to a cliff at H=2 gets a STRONGER
  shadow (taller wall casts more shadow).
- A bomber's cell at H=2 next to a cliff at H=0 (the cell is HIGHER
  than the wall) gets no shadow on that edge.
- The intensity field can scale with height delta.

This makes terrain feel natural without raycasting per pixel.

### 3.4 Procedural variant authoring

Like block variants (per GDP-2026-05-28-003), floor families ship
PROCEDURAL builders per variant index:

- `buildGrassVariant(bitmask)` → grass cell with appropriate edge
  detail. Vertex-colour-tweaked green hues, subtle blade texture
  via vertex displacement.
- `buildPathVariant(bitmask)` → packed dirt with stones (vertex
  colour spots), edge detail.
- `buildStoneVariant(bitmask)` → laid stone tile, mortar lines.
- `buildDirtVariant(bitmask)` → bare brown with subtle ripples.
- `buildFloorVariant(bitmask)` → flat plate, panel seams (reuse
  hard-block bevel pattern from GDP-2026-05-28-003).
- `buildWallShadowVariant(bitmask)` → semi-transparent dark overlay
  shape.

All procedural. No CC0 floor assets needed. Optional CC0 fallback
in future polish, not v1.

### 3.5 Sub-variant random variation

For pure visual variety, allow each Wang index to have 2-3
sub-variants randomly picked per cell (deterministic per cell
seed). E.g. variant 5 (N+S neighbours) for grass family could have
3 different blade arrangements — picked by hash(gx, gz, sceneSeed).

Engine Wang module gets one small extension: variants[] field
becomes `variants: WangTileVariant[] | WangTileVariant[][]` (16 or
16×N grouped). Resolver picks variants[bitmask][hash % N].

---

## 4. Engine impact summary

### 4.1 Components added

| Component | Owner | Purpose |
|---|---|---|
| `Height` | engine `engine/grid/` or project | integer per cell |
| `Ramp` | engine | bridges height delta |
| `FloorTerrain` | project | terrain family for Wang |
| `WallShadow` | project | shadow Wang membership + intensity |
| `Cliff` (auto-computed, no schema?) | engine | flagged at scene load between height-different neighbours |

### 4.2 Systems added

| System | Purpose |
|---|---|
| `HeightResolverSystem` | scene-load: read heightmap, spawn cell entities, parametrise cuboid mesh, write Height component |
| `CliffComputeSystem` | scene-load + on-height-change: compute Cliff markers between adjacent cells with delta != 0 |
| `RampTraversalSystem` | when bomber is on a ramp, smooth Transform.y between fromHeight + toHeight during cell-tween |
| `GridOccupancySystem` (existing, extended) | pathfinding edges respect cliffs + ramps |
| `BlastPropagationSystem` (existing, extended) | propagation stops at cliffs |
| `WallShadowComputeSystem` | scene-load + on-height-change: walk floor cells, tag near-wall cells with WallShadow + intensity |

### 4.3 Wang engine module extensions

- Optional sub-variant arrays per Wang index (random pick per cell).
- Multi-layer composition — the renderer stacks floor + shadow.
  This is a project-side rendering concern, not engine module
  surface — the engine still resolves per-family.

### 4.4 Renderer integration

- Cuboid mesh path — adapt `block-solid` shader for top + side
  face palette variants.
- Cliff-face material with vertical-stripe shader uniform.
- Ramp wedge geometry — small new procedural builder.
- Shadow overlay layer — additive render pass with floor wang
  results.

### 4.5 Bot AI extensions

- Pathfinding respects cliffs + ramps.
- Stretch: bot personality bias — Coward prefers high-ground
  defensive cells; Hunter prefers low-ground to corner enemies via
  ramps. Optional polish.

---

## 5. Gameplay implications worth recording

### 5.1 Vertical advantage in combat

A bomber on H=2 next to a flat row of cells at H=0:
- Their own bombs detonate at H=2; blast doesn't reach the H=0
  cells across the cliff (2D rule).
- Bombers in the H=0 row can't damage the H=2 bomber unless they
  navigate to H=2 via a ramp.
- This creates POSITIONAL ADVANTAGE — a player who controls high
  ground is hard to kill.

Counter: ramps are limited resources. The author of an arena
controls how easy/hard high ground is to reach.

### 5.2 Throw Glove + heights

Throw Glove (S144) becomes more powerful with heights:
- Lower bomber THROWS a bomb up onto a cliff → bomb detonates at
  the higher elevation.
- Higher bomber DROPS a bomb DOWN by throwing — bomb arcs over
  the cliff edge, lands below.
- This is the BOMB SIEGE verb — physical strength of Throw Glove
  in vertically-layered arenas.

### 5.3 Ramp choke points

A ramp is a SINGLE CELL connecting two heights. Block-bomb a
ramp's destination cell and you've cut off the high ground until
the bomb expires. Tactical depth.

### 5.4 Sudden Death + heights

The S160 Shrinking Arena hazard closes rings inward. With heights:
- Rings spawn at consistent height = arena-edge-height. If
  perimeter cells are at varying heights, rings spawn at each cell's
  actual height (or at MAX height — kills bomber at lower heights
  who happen to walk near the edge).
- Recommendation: rings always spawn at MAX height + cover the
  cliff face fully (kills bombers at all heights in that ring).

---

## 6. Risks

### 6.1 Performance

- Per-cell cuboid mesh = 6 faces vs 1 floor tile face. ~6× geometry
  cost for floor. Not problematic for 11-21-cell arenas.
- Wang resolver runs 2-3× per cell (floor + wall-shadow + height-
  computed cliff). Still O(cells) at scene load, negligible
  steady-state.
- Cliff-face material adds 1 more material variant per arena. Few.

### 6.2 Readability

- Adding height + multiple terrains + shadows could make arenas
  read as VISUAL NOISE. Each new layer competes for attention.
- Mitigation: each arena ships with ONE primary terrain family +
  optional path / sparse alternate. Not all 5 terrains in every
  arena. Heights stay ≤ 2 in MVP-3 (3+ heights = MVP-4 polish).

### 6.3 Gameplay balance

- Variable height upends 6+ existing arena balance choices. Cross
  arena (17×17, 4-bomber-friendly) may play differently if quadrant
  centres are elevated.
- Mitigation: ship variable-height as OPT-IN per arena. New
  height-aware arenas ship as NEW scenes alongside flat ones.
  Existing flat arenas stay flat. Pace the height-spread gradually.

### 6.4 Multiplayer

- Server snapshot already carries Transform.position (including y).
- Height map shipped in joinWorld payload (or in the scene-load
  message) — small data, no concerns.
- Server-side blast propagation extends to use cliff rules — small
  branch in the existing system.

---

## 7. Story breakdown

Three stories to ship the foundation. Optional 4th for advanced
authoring.

1. **GDP-2026-05-28-010** — Variable cell height engine primitive:
   `Height` component + cuboid floor mesh + Cliff auto-marker +
   GridOccupancy + BlastPropagation respect cliffs. ~1 sprint.
2. **GDP-2026-05-28-011** — Ramps + cliff visual + pathfinding:
   `Ramp` component + ramp wedge mesh + RampTraversalSystem +
   pathfinding awareness. ~1 sprint.
3. **GDP-2026-05-28-012** — Floor Wang multi-family + wall shadow
   layer: 5 floor families + 1 shadow family + procedural variant
   builders + wall-shadow compute system. ~2 sprints.
4. **GDP-2026-05-28-013** — First height-aware arena `cliffside`
   + balance pass. ~1 sprint. (Final showcase + tuning.)

---

## 8. Out of scope

- Full 3D blast propagation (Y-axis blast rise/fall). Stays 2D + cliff-blocks.
- More than MAX=4 heights. Tiered terraced arenas (height 5+)
  defer to MVP-4 polish.
- Inter-family Wang transitions (blended grass-to-path). Sharp
  transitions only.
- Dynamic terrain mutation (cells changing height mid-round). Static
  heightmaps only.
- Vertical-only bombs (e.g. cannon shells that climb). Out — XZ
  cardinal only.
- Diagonal cliffs. Cliffs are between 4-cardinal neighbours only.
- Height affects bomb fuse / range / speed. Stat values unchanged.
- Variable-height multi-cell entities (e.g. a 2x1 hard block
  spanning two heights). Each cell has its own height.
- Animated cliff face (e.g. waterfall). Static for now.
