# Arena complexity spike

**Status:** Closed 2026-06-02. Top-3 categories ranked, follow-up stories filed.
**Source proposal:** `backlog/proposed-stories/GDP-2026-06-01-001.story-proposal.json`.

## Why this spike

User feedback 2026-06-01: rounds on the default 15×11 arena feel
"сложновато и не интересно" because every arena uses the same
flat odd/even hard-block lattice + uniform soft-block density.
The six shipped variants (default / wide / corridor / plaza /
cross / pit / grassland) differ in TOPOLOGY + SIZE but otherwise
share the same flat uniform structure. With nine power-ups,
three hazards, variable height + ramps shipped, the gameplay
engine is rich; the level-design is the limiting factor.

This spike catalogues 10 arena-enhancement categories, ranks
them by impact × cost × fit, and recommends the top three for
implementation follow-ups.

## Scoring rubric

Each category scored 1..5 on three axes; total score = sum.

- **Impact**: how much it widens the decision space + makes a
  round feel different from the next.
- **Cost**: implementation effort + risk to existing gameplay
  (inverted — 5 = cheap, 1 = heavy).
- **Fit**: how well it reuses already-shipped systems (Wang
  autotile, variable height, ramps, hazards, themes).

## Catalogue

### 1. Density variation (per-region soft-block density)

Soft-block density varies by zone. Cluster zones = high reward;
pristine zones = fast travel; reward rooms = cul-de-sacs with
dense blocks gating premium pickups.

| Axis | Score | Reasoning |
|---|---|---|
| Impact | 5 | Same arena shape feels different every match. Strategic regions emerge naturally. |
| Cost | 4 | Authoring tweak — scene JSON gains a per-region density map. No engine work. |
| Fit | 5 | Drops directly into the existing scene-format + soft-block-spawn pipeline. |
| **Total** | **14** | |

### 2. Asymmetric layouts (per-spawn-unique features)

One spawn elevated, the other flat. Different nearby resource
per corner. Disincentivises mirror-match orbit.

| Axis | Score | Reasoning |
|---|---|---|
| Impact | 4 | Removes the "we both have the same start" comfort. |
| Cost | 3 | New scene needs careful balance — easy to make unfair. |
| Fit | 5 | Variable height + ramps + theme system already cover the building blocks. |
| **Total** | **12** | |

### 3. Chokepoints (narrow one-cell passages)

One-cell-wide corridors between hard-block walls; bridges over
pit areas; centre bottlenecks where the main fight always
happens.

| Axis | Score | Reasoning |
|---|---|---|
| Impact | 5 | Forces engagement instead of orbit. Defines who controls the centre. |
| Cost | 4 | Scene-author tweak. Light bot-AI follow-up to handle 1-cell choke (existing pathfinding already does). |
| Fit | 4 | New scene file authoring; the hard-block lattice slot allows it. |
| **Total** | **13** | |

### 4. Visual landmarks (focal towers / cluster pads)

Central tower (elevated structure with stairs). Corner
fortifications. Golden-tile cluster with guaranteed power-up
drops. Players orient around it.

| Axis | Score | Reasoning |
|---|---|---|
| Impact | 3 | Helps spatial memory + creates "go to the tower" goals. |
| Cost | 3 | Needs a "named cell" component + power-up-spawn rule. |
| Fit | 3 | Variable height = elevated tower is free; guaranteed-drop tile = new mechanic. |
| **Total** | **9** | |

### 5. Multi-zone layouts (open plaza + maze quadrants + hazard ring)

Distinct regions in one arena. Open plaza centre + maze
quadrants + outer hazard ring. Different terrain biome per
zone.

| Axis | Score | Reasoning |
|---|---|---|
| Impact | 5 | Round flow has THREE phases: scout → loot → fight. Different decision style each. |
| Cost | 2 | Big authoring effort; per-zone density + hazard + theme. |
| Fit | 4 | Combines existing systems but requires careful playtest tuning. |
| **Total** | **11** | |

### 6. Dynamic elements (mid-round terrain change)

Regrowing soft blocks. Falling walls. Conveyor cycle reversal.
Pressure-plate gates.

| Axis | Score | Reasoning |
|---|---|---|
| Impact | 4 | Each round has a temporal arc, not just a spatial one. |
| Cost | 2 | New systems: regrowth timer, falling-wall trigger. Bot AI needs awareness. |
| Fit | 3 | Conveyors / pressure-plates exist; regrowth is new. |
| **Total** | **9** | |

### 7. Themed hazards (industrial / maze / volcano)

Arena identity via hazard set. Industrial = conveyors + plates;
volcano = timed lava patches (new hazard).

| Axis | Score | Reasoning |
|---|---|---|
| Impact | 4 | Reinforces theme identity. |
| Cost | 2 | "Volcano" = new hazard kind (lava patches). Significant work. |
| Fit | 3 | Three existing hazards reuse cleanly; new hazards need full primitive. |
| **Total** | **9** | |

### 8. Random elements (per-match seeded variation)

Per-match random soft-block placement, random hazard cells,
random spawn rotation. Deterministic per session seed but
different across sessions.

| Axis | Score | Reasoning |
|---|---|---|
| Impact | 3 | Every match is a "first encounter" — but rewards exploration over memorisation. |
| Cost | 5 | Authoring uses seeded RNG already in scene-spawn paths. |
| Fit | 5 | Soft-block roll + pickup roll already use seeded RNG (S82, S89). |
| **Total** | **13** | |

### 9. Power-up positioning (guaranteed-drop cells)

Specific cells always spawn rare pickups (pierce / throw glove
/ shield). Risk-reward zones — premium loot near hazards.

| Axis | Score | Reasoning |
|---|---|---|
| Impact | 4 | Players race to the known good cell — creates engagement. |
| Cost | 4 | Component on a cell flags "guaranteed pickup of kind X"; pickup-spawn-system reads. |
| Fit | 4 | Pickup-spawn-system already has per-cell hashing (S82). |
| **Total** | **12** | |

### 10. Bot AI terrain adaptation (height / ramp awareness)

Coward seeks high-ground defensive positions. Hunter chases
via ramps. Miner hoards in soft-block-dense zones.

| Axis | Score | Reasoning |
|---|---|---|
| Impact | 3 | Bots feel smarter on non-uniform arenas. |
| Cost | 2 | Bot-ai-system already at 1100+ LOC; adding terrain heuristics is heavy without refactor (GDP-06-02-002). |
| Fit | 2 | Needs bot pathfinding to score cells; current bot-ai is direction-pick, not pathfind. |
| **Total** | **7** | |

## Ranking

| Rank | Category | Score |
|---|---|---|
| 1 | **Density variation** | 14 |
| 2 | **Chokepoints** | 13 |
| 2 | **Random elements** | 13 |
| 4 | Asymmetric layouts | 12 |
| 4 | Power-up positioning | 12 |
| 6 | Multi-zone | 11 |
| 7 | Landmarks | 9 |
| 7 | Dynamic elements | 9 |
| 7 | Themed hazards | 9 |
| 10 | Bot terrain adaptation | 7 |

## Recommendation

Ship the top three as follow-up stories. Each works inside the
existing scene-format + procedural-pipeline; minimal new engine
surface; each tells a different "feels different" story:

### 1. Density variation (GDP-2026-06-02-004 — to be filed)

Extend scene JSON with an optional `terrainmap.softBlockDensity:
number[][]` field (one value per cell, 0..1 = spawn chance).
The existing soft-block-spawn pipeline already rolls per cell;
this is a per-cell roll-weight override. Default: uniform. New
arenas can have cluster zones, pristine zones, reward rooms.

**~40 LOC scene-loader change + ~3 new arena variants.**

### 2. Chokepoints (GDP-2026-06-02-005 — to be filed)

New scene variant `corridors.scene.json`: hard-block walls form
4 quadrants connected by 1-cell-wide corridors. Centre 3×3
plaza for the main fight. Bot pathfinding handles 1-cell
corridors already (per `passableNeighbours` checking `movement`
layer).

**Pure scene authoring + 1 new map entry in MAP_DIMS / MAP_REGISTRY.**

### 3. Random elements (GDP-2026-06-02-006 — to be filed)

Per-match seeded variation: different soft-block layout each
match. The existing `selectVariantIndex(gx, gz, sceneSeed)`
already mixes sceneSeed; extend the soft-block spawn-roll to
read a `?seed=N` URL flag OR `MatchState.matchNumber` so each
match gets a fresh layout under the same arena skeleton.

**~30 LOC bootstrap reroute + URL flag.**

## Deferred / out of scope

- **Multi-zone layouts**: big authoring effort + tuning, defer
  to after density+chokepoints land + we see how much variety
  those two alone provide.
- **Dynamic elements**: needs regrowth-timer or falling-wall
  systems; significant engine work. Worth revisiting after the
  static-variety stories ship.
- **Themed hazards (volcano)**: new hazard primitive. Defer.
- **Bot terrain adaptation**: blocked on bot-ai refactor
  (GDP-2026-06-02-002). Reopen after refactor.
- **Asymmetric layouts**: high tuning risk for solo play. Worth
  attempting once 2-player multiplayer is more shipped.

## Reference games consulted

- **Super Bomberman R**: each themed arena has unique hazards
  (electric floors, gravity wells, regrowing blocks). Confirms
  themed-hazards path is rich but expensive.
- **Bomberman 64**: 3D elevated platforms — variable height +
  ramps already shipped; the gap is using them.
- **Brawl Stars maps**: asymmetric mode-specific layouts; works
  because the rules are mode-specific. AGF doesn't have
  multiple game modes yet.
- **Counter-Strike**: chokepoint design (long, mid, B-site) —
  transfers well to 4-cell corridors connecting plazas.

## Exclusions confirmed

- No rule mutations (Move or Die-style) — banned per
  `gameplay-systems.md §7.2`.
- No skull-curse / random debuffs — banned per
  `gameplay-systems.md §5.4`.
- No live-service progression — banned per `gdd.md`.
- Symmetric multiplayer roles stay — `gameplay-systems.md §7.2`.

## Path forward

The three recommended stories (density / chokepoints / random
soft-block layout) ship cleanly without an engine refactor. File
each as `GDP-2026-06-02-004 / -005 / -006` and queue alongside
the existing bot-ai refactor (GDP-2026-06-02-002) and the
walk-through-bomb investigate (GDP-2026-06-02-003).
