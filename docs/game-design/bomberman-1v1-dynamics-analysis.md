# Bomberman 1v1 Dynamics — How Old & Modern Games Solve Boring 2-Player Sessions

> **Status: investigation.** First pass: 2026-05-30.
> Companion to `competitor-analysis.md` (broader competitor matrix
> already discussing modern arcade-multiplayer). This doc drills into
> the SPECIFIC subproblem of 2-player Bomberman dynamics.
> Owner: game-design agent. Outputs: 1-2 story recommendations.

---

## 1. The three problems (user-stated 2026-05-29)

> "двум игрокам играть скучновато, легко убегать от бомб и сложно
>  загнать в угол"

Restated:

1. **1v1 is boring** — only two bombers means low chaos; rounds drift.
2. **Easy to escape blasts** — once players know the rules, bomb
   placement rarely lands. Players orbit each other indefinitely.
3. **Hard to corner** — open arenas + power-up movement speed
   make commit-and-trap manoeuvres unreliable.

All three are well-known to the Bomberman lineage. Below: 20+ years
of design solutions, ranked + filtered for our game.

---

## 2. Solutions across the lineage

### 2.1 Classic Bomberman (NES → SNES era, 1985-1995)

Core problem: 1v1 was rare because 4-player was the main draw. The
few 1v1 solutions:

- **Time mode** (Super Bomberman series) — round ends in 60-90s, no
  draw allowed; whoever scored last hit wins on timeout. Reduces
  "indefinite orbit" by forcing a clock.
- **Soft-block density** — early rounds had sparse soft blocks,
  late-tournament rounds had dense walls (forces commit decisions).
- **Skull / curse pickup** — random debuff that punishes the
  collector. Adds chaos. (We REJECT this per `gameplay-systems.md
  §5.4` — punishes the wrong player.)

### 2.2 Super Bomberman 2-4 (SNES, 1994-1996)

- **Stage hazards** that fire on a TIMER (conveyors, holes opening,
  falling walls). Forces movement.
- **Trap items** — when a player dies, they leave their items as
  pickups on the floor (POWER-UP THEFT). Survivors race to grab.

### 2.3 Bomberman 64 (N64, 1997)

- **3D arenas with elevation** — bombers fight on multi-level maps
  with ramps. Vertical advantage creates positional reads. **We're
  shipping this** via `terrain-design.md` (GDP-2026-05-28-010 +
  -011 + -015).
- **Bomb-pump (charge bomb)** — hold input to grow bomb's blast
  range before placing. Skill-based attack escalation. Could adopt.
- **Bomb-jumping** — pumped bomb can launch self over walls. Adds a
  vertical movement verb. Risky — likely conflicts with grid rules.

### 2.4 Super Bomberman R / R2 (Switch, 2017+ / 2023)

Modern era's most polished 1v1 solutions:

- **Revenge Cart (RC) / Revenge Train** — when a player dies, they
  ride a cart along the arena edge and THROW BOMBS at survivors.
  Dead players stay engaged AND pressure the survivors. **Major
  recommendation** — see §4.
- **Sudden Death** — arena shrinks via blocks closing in. Forces
  engagement. **We shipped this** (S160 + GDP-029-013).
- **Power-up theft** — dead bombers drop ~50% of their collected
  stats as pickups at death cell. Survivors race to grab. Strong
  incentive for kills. **Recommendation** — see §4.
- **Bomb stacking caps** — max-bombs cap stays reasonable to
  prevent late-round bomb spam. (We have this implicit in design.)

### 2.5 Bomberman Ultra (PSN, 2009)

- **Per-round item shuffle** — random subset of power-ups available
  per round. Changes optimal strategy. Could borrow as URL config.

### 2.6 Bombergrounds: Reborn (Steam, 2020+)

Modern reimagining with strong 1v1+:

- **Dash mechanic** — short cooldown burst movement. **We shipped
  this** (S159).
- **Melee bat** — swat bombs back at the enemy. Adds a non-bomb
  combat verb. Could borrow.
- **Burrow corpse** — dead bomber leaves a destructible bomb-able
  body (item drop on destruction). Mining incentive. Adjacent to
  power-up theft.

### 2.7 Boomerang Fu (Steam, 2020)

Boomerang-not-bomb arena game with strong 1v1 solutions:

- **Power-up overlap chaos** — stackable wild effects create runaway
  rounds (5s 1v1 with both heavily upgraded).
- **Mid-round events** — golden boomerang spawns at 30s mark.
  Engages both players.

### 2.8 Bopl Battle (2020+)

- **Physics modifiers as power-ups** — black holes, time-slow,
  growth — totally distorts 1v1. Out of scope for our grid game
  per `gameplay-systems.md §5.4`.

### 2.9 Brawl Stars (mobile, 2017)

Not Bomberman but parallel:

- **Energy / Super system** — eventually have an alternate attack
  that wipes opponents. Builds during round. Could adapt as a
  "super bomb" earned via play.
- **Movement abilities + tag-team** — most modes are 3v3, sidesteps
  1v1 entirely. Strong endorsement that 1v1 is just hard.

### 2.10 Pommerman (Open-source AI benchmark, 2018)

Designed for varied scenarios:

- **Random per-round kick assignment** — kicks granted to random
  bomber per round. Different per round = different dynamics.

---

## 3. Strategy matrix — mapped to our 3 problems

| Solution | Solves boring 1v1 | Solves easy escape | Solves hard cornering | Status |
|---|---|---|---|---|
| Sudden Death shrink | ✅ | ✅ (less arena) | ✅ (forced proximity) | ✅ shipped S160 |
| Dash + Throw Glove | partial | — | ✅ (multi-direction threat) | ✅ shipped |
| Pierce | — | ✅ (long blast lines) | partial | ✅ shipped S142 |
| Variable height + ramps | partial (vertical reads) | partial (cliffs block escape) | ✅ (chokepoint at ramps) | partial pending |
| Power-up theft (drop on death) | ✅ (kill = loot incentive) | — | — | ❌ never filed |
| Revenge Cart | ✅ (dead player stays engaged) | ✅ (multi-direction bombs from edges) | ✅ (corner = trapped between centre + edges) | ❌ never filed |
| Mid-round timed events | ✅ | partial | — | ❌ never filed |
| Melee bat | partial | partial (swat bomb away) | partial | ❌ never filed |
| Bomb-pump (charge) | partial | — | — | ❌ never filed |
| Per-round item shuffle | partial | — | — | trivial follow-up |
| Random kick assignment | partial | — | — | trivial follow-up |
| Build-up Super attack | ✅ | partial | partial | ❌ never filed |

---

## 4. Top 2 recommendations

Two adoptions that solve all three problems together:

### 4.1 ⭐⭐⭐ Power-up drop on death (Super Bomberman R staple)

When a bomber dies, ~50% of their collected power-ups (bombs/fire/
speed/kick/remote/shield/pierce/throw/bomb-pass) spawn as pickup
entities at their death cell. Survivors race to grab them.

**Why it solves the three problems:**
- **Boring 1v1** — kills become VALUABLE. Players seek engagement
  because kill = loot windfall.
- **Easy escape** — irrelevant directly, but indirectly: a survivor
  who collects dropped power-ups becomes faster + more dangerous,
  upsetting opponent's escape plan.
- **Hard cornering** — irrelevant directly, but a power-up-richer
  survivor has better cornering tools (more bombs, longer range).

Cost: small. Reuses existing pickup-spawn + pickup-collect systems.
~100 LOC project-side. No engine changes.

→ Filed as `GDP-2026-05-30-001` (see §5).

### 4.2 ⭐⭐⭐ Revenge Cart / Spectator bomb throw

When a bomber dies, they transition to a "Revenge Mode" — camera
moves to arena edge perimeter; player can click on cells inside
the arena to LAUNCH BOMBS from the edge into that cell. Bombs arc
from arena edge to clicked cell, land + detonate normally. Cooldown
5s per revenge bomb. Each dead bomber has up to 5 revenge bombs
per round.

**Why it solves the three problems:**
- **Boring 1v1** — dead player stays engaged. 1v1 becomes "alive
  bomber vs survivor + dead-player-bombing-from-edges". Tension
  multiplies.
- **Easy escape** — bombs come from EDGES too, not just from
  in-arena opponent. Escape routes get blocked from multiple
  directions.
- **Hard cornering** — survivor cornered against edge gets bombed
  from edge AND from opponent. Cornering becomes way easier when
  one player is dead.

Cost: medium. New input (mouse click), new bomb spawn path,
multiplayer protocol message, edge animation, HUD for revenge bomb
count. ~250 LOC + protocol.

→ Filed as `GDP-2026-05-30-002` (see §5).

### 4.3 ⭐⭐ Mid-round timed events (lower priority)

Every 30s after round start (or every 15s after Sudden Death
triggers), one EVENT fires:
- Golden bomb spawns at arena centre (huge blast range, free to
  whoever picks it up first).
- Power-up shower (5 random pickups spawn at random cells).
- Conveyor reverse (existing conveyors flip direction).
- Ramp toggle (post height system) — closed ramps open / open
  ones close.

**Adds dynamic pressure**, breaks orbital play patterns.

Cost: medium. New EventScheduler system + per-event implementations.
~200 LOC.

→ Worth filing as a follow-up after §4.1 and §4.2 ship. Not in
this batch.

### 4.4 ⭐ Melee bat (defer)

Bombergrounds-style swat-bomb-back verb. Tempting but adds a new
input and a new combat surface — significant complexity for a
secondary verb. Skip unless playtest reveals 1v1 still feels
bad after 4.1 + 4.2.

### 4.5 ⭐ Bomb-pump (defer)

Bomberman 64-style charge-bomb. Adds skill ceiling but conflicts
with our Remote power-up's "manual detonation" mechanic. Defer.

### 4.6 Build-up Super attack (defer)

Brawl Stars-style super. Big new system. Defer until after the two
recommendations land + are tuned.

---

## 5. Stories to file (this batch)

1. **GDP-2026-05-30-001 — Power-up drop on death**
   (small, foundational, immediate impact)

2. **GDP-2026-05-30-002 — Revenge participation
   (Revenge Cart equivalent)**
   (medium, high impact, novel for our game)

Other patterns (timed events, melee, super) deferred per ranking
in §4.3-4.6.

---

## 6. Out of scope

- Per-round rule randomisation (Move or Die style) — explicit ban
  per `gameplay-systems.md §7.2` 'rules players can predict'.
- Skull-curse / random debuffs — explicit rejection per
  `gameplay-systems.md §5.4`.
- Cooperative bot AI vs human (PvE) — separate proposal in
  competitor-analysis.md §3.3.
- Adapter for 2v2 modes — out of scope; FFA is the design centre.

---

## 7. Open questions

1. **Revenge Cart vs Revenge Boat** — do dead players ride a
   visual cart around the perimeter? Recommended: simpler visual,
   just "ghost camera" + click-to-throw. Cart visual is polish.
2. **Drop ratio** — 50% of collected stats? 100%? Configurable per
   match? Recommend 50% as v1 default.
3. **Revenge bomb count** — 5 per round? Unlimited until round
   ends? Recommend 5.
4. **Cooldown between revenge bombs** — 5s? 3s? Recommend 5s
   (avoids spam).
5. **Interaction with multi-bot solo (S141)** — 3 bots + 1 human;
   when human dies first, do they get revenge mode immediately?
   Recommend yes (consistent rule).
