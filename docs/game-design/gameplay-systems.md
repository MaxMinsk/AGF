# Gameplay Systems — Kaboom Crew

> **Status: investigation.** First pass: 2026-05-20.
> Companion to `gdd.md` (which sets direction at a high level) and
> the per-feature proposals under `backlog/proposed-stories/`.
> This doc is the **deep-dive** on every gameplay system — rules,
> edge cases, balancing philosophy, anti-patterns — for dev to
> consult when implementing and QA to consult when verifying.
>
> Scope split:
> - `gdd.md` = what we're building and why.
> - `gameplay-systems.md` (this doc) = how the systems are supposed
>   to feel, what edge cases must be respected, what's explicitly
>   out of scope.
> - `visual-style.md` = how it all looks.
> - `characters-and-visual.md` = the character-specific subset.

---

## 1. System map

The systems Kaboom Crew has today (shipped) or plans (proposed). Each
has its own section below.

| System | Status | Drives |
|---|---|---|
| Grid + movement | shipped | Where bombers can be, how fast |
| Bombs (place / fuse / blast / chain) | shipped | The core verb |
| Soft / hard blocks | shipped | Maze topology + drop sources |
| Power-up economy | shipped (3 kinds) | Player growth within a round |
| Round resolution + auto-restart | shipped | Session loop |
| Bot AI | shipped (one personality) | Solo opponent |
| Difficulty dial | shipped | Solo balance |
| Audio bus + 4 event hooks | shipped | Half the readability |
| Bomb-fuse wiggle | shipped (tamed S99) | Final-fuse telegraph |
| Title screen overlay | shipped | First-round gate |
| Slapstick death | proposed (GDP-004) | Tone, readability |
| Kick power-up | proposed (GDP-003) | Mechanic expansion |
| Remote power-up | proposed (GDP-006) | Mechanic expansion |
| Bot personality variants | proposed (GDP-005) | Solo variety |
| Networked multiplayer | proposed (GDP-007) | The headline goal |
| Procedural character generator | proposed (GDP-008) | Visual identity |
| Procedural animation pack | proposed (GDP-009) | Liveliness |
| Procedural vocal synth | proposed (GDP-010) | Per-bomber personality |

---

## 2. Grid and movement

The grid is **gameplay-authoritative**. Every gameplay outcome — bomb
placement, blast propagation, pickup pickup, collision, win/lose
detection — uses grid cells, not float positions. Float positions are
presentation only.

### 2.1 Grid shape

- Cell size: 1.0 world unit. Bombers visualise at ~0.7 of a cell.
- Default arena: 15 wide × 11 deep (X × Z in world coords). Origin
  is one corner; (gx, gz) = (0,0) is the cell at world (0, 0).
- Each cell carries occupancy bits: `blocked-by-hard-block`,
  `blocked-by-soft-block`, `holds-bomb`, `holds-bomber`.
- Multiple bombers per cell is **allowed for 1 frame** (during a
  pass-through), but a bomber cannot END a frame on the same cell
  as another bomber. The collision resolution kicks one of them
  back — the slower one wins the cell. Tied speeds resolve by
  entity-id (deterministic).

### 2.2 Movement rules

- Bombers move at `GridMover.speed` cells per second. Tween between
  cells is linear in world space (lane assist applies).
- **Lane assist** — when a bomber is moving in one cardinal and the
  next cell in that cardinal is blocked but the cell at +1 lateral
  is free AND would put the bomber in line with a free lane, the
  bomber slides ±0.5 cell laterally to enter that lane. Forgiving
  control — feels modern.
- **Queued direction** — pressing a direction while the bomber is
  mid-tween between cells doesn't snap, but the queued direction
  applies on the next cell boundary.
- **Reverse-cancel** — pressing the opposite direction reverses the
  bomber on the next cell boundary even if a queued perpendicular
  exists. The opposite is the "I want out of here NOW" intent.
- **No diagonal movement.** 4-cardinal only. Eight-direction is on
  the deferred list — adds bot AI complexity without proportional
  gameplay benefit at the arena scale.

### 2.3 Bomb pass-through rules

- A bomber may stand on their own freshly-placed bomb for one
  tick (just-placed grace). They must walk OFF the bomb cell;
  once off, the bomb becomes solid for them too.
- Without `Bomb Pass` power-up (deferred), a bomb is solid for
  everyone after the placement grace expires.
- A `Bomb Pass`-equipped bomber treats bombs as ground. (Not in
  any proposal yet; named here for forward-compatibility.)

### 2.4 Edge cases

- Bomber pushed off-grid by a kicked bomb → cancelled. Kicks check
  destination cell against grid bounds before resolving.
- Two bombers walk into the same empty cell from opposite directions
  in the same tick → the one with lower entity-id wins. (Deterministic.)
- Bomber-on-bomber sandwich (kick pushes a bomb into a cell
  another bomber is occupying) → bomb DOES NOT enter the occupied
  cell; kick is silently refused. The bomb that would have moved
  stays. (Same rule as kick-into-hard-block from GDP-003.)
- Bomber on a pickup cell → pickup applied next tick (PickupCollectSystem
  runs after movement).

---

## 3. Bombs

The headline verb. The whole game is the consequences of placing
bombs.

### 3.1 Placement rules

A `PlaceBombRequest` (from player input OR bot AI OR network) is
gated by:

1. `BomberStats.alive` is true.
2. `BomberStats.activeBombs < BomberStats.maxBombs`.
3. The bomber's current grid cell is empty of bombs (no stacking).
4. The bomber's grid cell is within arena bounds.

When all four pass, BombPlacementSystem spawns a `Bomb` entity at the
cell, increments `BomberStats.activeBombs`, fires `bomb-place` audio.

### 3.2 Fuse mechanics

- Default fuse: **2.5 seconds**. Stored in `Bomb.fuseRemaining` and
  decremented every fixedUpdate.
- Last **0.6 s** triggers the bomb-pulse shader + the bomb-fuse wiggle
  (amplitude tamed in S99) + the `bomb-tick` audio (when shipped).
- **Remote** power-up (GDP-006): fuses do NOT auto-tick on bombs
  owned by a remote-armed bomber. Manual detonation only.
- Chain-trigger: a bomb caught in another bomb's blast detonates
  next tick, regardless of its remaining fuse or remote status.

### 3.3 Blast propagation

- Origin cell always blasts (drops a `BlastTile` entity at the bomb
  cell).
- From the origin, the blast walks in **four cardinal directions**.
- In each direction, it walks UP TO `Bomb.range` cells.
- The walk stops at the first cell that **blocks blast** — hard
  block stops, soft block stops AND is destroyed, off-arena stops.
- Bombs caught along the way are chain-triggered next tick.
- Bombers caught along the way die (alive → false) UNLESS shielded
  (Shield power-up not yet proposed; reserved).
- Pickups caught along the way are destroyed (they don't survive
  blasts).
- Each cell in the blast path gets a `BlastTile` entity with a short
  lifetime — the floor flash + damage zone.

### 3.4 BlastTile lifetime

- Default lifetime: **0.4 seconds**. During that window, the cell is
  lethal — any bomber that enters takes damage.
- Visual: `blast-flash` shader fades out the orange overlay.
- Multiple overlapping BlastTiles (chain reactions) stack visually
  via additive blend but lifetime is independent per source.

### 3.5 Pierce rule (deferred)

A future `Pierce Bomb` power-up makes the blast walk continue
through the first soft block without stopping (still destroying it).
Not yet proposed. Reserved naming: `BomberStats.pierce: boolean`,
`Bomb.pierce: boolean` (carried at placement time).

### 3.6 Anti-patterns

- **No instant detonation for non-chain bombs.** Even at 0 fuse, the
  bomb takes one tick to spawn its BlastEvent. Players need a beat
  to read the explosion.
- **No invisible bombs in MVP.** Land Mines (proximity-triggered
  invisible bombs) are deferred — they shred new players. Revisit
  with a "novice / veteran" mode separation.
- **No bomb-jumping (using own blast to launch self).** The blast
  is lethal to the placer. We're not going for SpiderHeck physics.

---

## 4. Blocks

Two block kinds today; the schema is conservative on purpose.

### 4.1 Hard blocks

- Permanent. Block movement, block blast.
- Spawned by the arena generator on a regular pattern (every even
  cell along even rows — the classic Bomberman lattice).
- Cannot be destroyed by any current power-up.
- Future-reserved: certain hazard modules could lift / lower hard
  blocks (FallingWall hazard from `notes/DynaBomber.md §8.1`). When
  that lands, it ships as a state-change on the existing hard-block
  type, not as a new block kind.

### 4.2 Soft blocks

- Destructible. Block movement, block blast (until destroyed).
- Spawned by the arena generator at a density configured per arena.
  Default: ~40% of free non-spawn cells get a soft block.
- Destroyed by a single blast hit. (No multi-hit "cracked block" in
  MVP.)
- On destruction, roll a deterministic-by-cell RNG:
  - ~50% chance: nothing (empty cell).
  - ~25% chance: `bomb-up` pickup spawns.
  - ~15% chance: `fire-up` pickup spawns.
  - ~10% chance: `speed-up` pickup spawns.

These ratios are starting points. Tuned in playtest, captured in the
arena generator config so it's a data tweak not a code change.

### 4.3 Future block kinds (none in current proposals)

| Kind | Why | When to revisit |
|---|---|---|
| Cracked block | 2-hit destructibles | MVP-3 if soft-block density feels wrong |
| Glass block | Blocks movement, NOT blast | When a hazard module needs a "see through" wall |
| Reactor block | Explodes when hit | When the hazard catalogue lands |
| Regrowing block | Comes back after a timer | Arena modifier story (deferred from S98) |

None of these are blockers. Don't ship them speculatively.

---

## 5. Power-up economy

The 3-pickup current set is the **MVP**. Long-term target is 6–10
power-ups with tuning data. This section is the design for the
target — including which power-ups are explicitly REJECTED.

### 5.1 Shipped pickups (MVP-0/1)

| Pickup | Effect | Stacking cap |
|---|---|---|
| Bomb Up | +1 `BomberStats.maxBombs` | 6 (typical) |
| Fire Up | +1 `BomberStats.range` | 8 (typical) |
| Speed Up | +1 `GridMover.speed` | 5 (typical) |

Stacking caps are advisory in the current code — the schema doesn't
enforce them yet. Adding the cap is a small follow-up; documenting
the intent here.

### 5.2 Proposed pickups (next sprints)

| Pickup | Status | Notes |
|---|---|---|
| Kick | GDP-003 | Walk into your bomb → push it one cell |
| Remote | GDP-006 | Manual detonate; fuses don't auto-tick |
| (Shield) | not yet | Reserved name; one-shot blast protection |

Shield is the most-requested next pickup but not yet a proposal —
it overlaps in design space with both Kick and Remote (all three are
"survive a hit / control the bomb" pickups) and we want to see how
Kick + Remote play before tuning Shield in.

### 5.3 Far-future pickups (intent only)

| Pickup | Effect | Why deferred |
|---|---|---|
| Pierce Bomb | Blast walks through soft blocks | Adds a new branch to BlastPropagationSystem |
| Throw Glove | Lift + throw bombs over walls | Adds a vertical movement axis |
| Punch Glove | Punch bomb across cells (long kick) | Variation on Kick, redundant until Kick proves out |
| Bomb Pass | Pass through bombs | Solves Kick's "trapped on own bomb" problem differently |
| Line Bomb | Drop bombs in a line | Strong but situational; wait for arena variety |
| Power Bomb | First bomb has boosted range | Adds first-vs-rest bomb state |

### 5.4 Explicitly rejected pickups

| Pickup | Reason rejected |
|---|---|
| **Skull / Curse** | Random debuff that punishes the player who just collected something. Contradicts "Local chaos, global clarity" — players don't understand why they're slow / can't bomb / are confused. The pickup turns into "did I just lose for no reason." |
| **Heart / Heal** | Implies multi-hit bombers. The MVP is one-hit-kill; adding HP changes every other system. If multi-hit lands later, it's a ruleset toggle (`?rules=durable`), not a pickup. |
| **Time freeze** | Borrowed from Bopl Battle. Doesn't fit grid-authoritative gameplay — freezing time desyncs server authority. |
| **Random teleport** | Loses the cause-effect chain players need to learn the arena. |

### 5.5 Drop placement strategy

Today: drops appear under destroyed soft blocks. That's the only
source.

Planned variants:
- **Pickup chest** (rare): hard-block-adjacent cells sometimes spawn
  a 2-hit chest at round start. Reward for committed bombing.
- **Mid-round drop event**: every ~30 s, a power-up drops from the
  diorama frame at a random open cell. Telegraphed by audio + a
  vertical spotlight 2 s before. Encourages map traversal in long
  rounds.

Both are MVP-2 / MVP-3 ideas, not yet proposed.

---

## 6. Round structure

The "round" is the shortest unit of play — from "go" to "winner /
draw" — and the current shape is well-defined.

### 6.1 Round lifecycle

1. **Setup**: scene loads, bombers spawn at corner cells,
   `RoundState.phase = playing`, `roundNumber++`, `tally` carried
   over from previous round.
2. **Title gate** (first round only): `GamePaused` singleton marker
   pauses bot AI + bomb fuse + bomb placement. First Space removes
   the marker. Subsequent rounds skip the title gate.
3. **Play**: free play. Players + bots move + bomb.
4. **Round resolution**: `RoundResolveSystem` detects ≤ 1 bomber
   alive, sets `RoundState.phase` to `won` / `lost` / `draw`, fires
   the win-banner UI.
5. **Auto-restart**: 3 s after phase flips, the round auto-restarts
   (player can override with R earlier).

### 6.2 Round timeout

`RoundState.timeLimit` (default 90 s) caps a round. If both bombers
are still alive at the timeout, phase → `draw`. Prevents stalemates
where two cowardly bombers never engage.

### 6.3 Round → Match (MVP-2)

A match is a **best-of-3 rounds**. When `tally.player + tally.bot +
tally.draws` reaches a configurable target (default 3 decisive
rounds, ignoring draws), a "match resolved" banner shows and the
tally resets to 0/0/0 before continuing.

This is a small change on top of the existing round loop — one new
banner state, one new singleton (`MatchState` with `target` and
`resolved`). Worth its own proposal when MVP-2 sprint capacity is
known.

### 6.4 Match → Session (MVP-3+ persistent world)

In the persistent-world target, multiple matches happen in the same
world. The world tracks per-player meta (total matches played, total
wins, win streak, cosmetic-unlock progress). The match boundary
becomes a soft transition, not a scene reload.

Open question: should leaving the world mid-match forfeit, count as
a draw, or count as a half-loss? Recommend "count as a draw" — same
as a timeout — but resolve when the persistent-world story lands.

---

## 7. Difficulty and balance philosophy

### 7.1 What the difficulty dial controls

Today, `?difficulty=easy|normal|hard` changes:
- Bot aggression (0.25 / 0.50 / 0.85)
- Bot decision interval (500 ms / 200 ms / 120 ms)
- Bot bomb range (2 / 2 / 3 — yes, hard bots out-range player early)
- Bot speed (2 / 3 / 4 cells/sec)

What it does NOT control:
- Pickup drop rates (constant across difficulties)
- Arena layout (constant)
- Player stats (constant)
- Round timeout (constant)

This separation is deliberate. **Difficulty changes the OPPONENT,
not the GAME.** The player should learn one rule set; difficulty
should never feel like "the game changed under my feet."

### 7.2 Balance philosophy

- **One-hit kill is the design centre.** Every other system bends
  around this. Slapstick death (GDP-004) makes the kill funny;
  audio + bomb wiggle makes it readable; auto-restart makes it
  recoverable.
- **Pickups stack but cap.** Speed Up at level 5 is "fast enough to
  outrun blasts"; level 10 would be "uncontrollable." Caps prevent
  the late round from becoming unplayable.
- **Symmetric start.** Player and bot start with identical stats
  except for the difficulty preset's adjustments to the bot. No
  random starting variance.
- **No catch-up mechanics.** A losing player doesn't get a free
  power-up. Recovery has to come from skill, not from systemic
  pity. Catch-up systems are anti-pattern for short rounds.
- **Determinism over fairness.** When two outcomes are tied, the
  resolution must be deterministic (entity-id based), even if it's
  not "fair." Determinism is what makes regression tests and
  replays work.

### 7.3 Anti-patterns for balance

- **No hidden modifiers based on player skill / round count.** No
  invisible buffs when you lose 3 in a row. Trust the player to
  drop the difficulty themselves.
- **No pay-to-win.** Pickups are gameplay tools, not purchasables.
- **No level-up between matches in MVP.** Every match starts from
  the same baseline. (Cosmetic unlocks ship as cosmetics ONLY —
  they don't carry stats.)

---

## 8. Bot AI patterns

The existing `BotAISystem` is a single decision policy:
- Every `nextDecisionIn` seconds, the bot re-evaluates direction.
- Computes a per-cardinal score: 0 if blocked, otherwise a weighted
  sum of "is this away from danger" + "does this approach the
  player" + "does this approach a pickup."
- Picks the highest-scoring cardinal.
- Bomb-place fires when `Math.random() < aggression` AND the bot is
  in a position where a bomb could hit the player.

The personality story (GDP-005) extends this with per-archetype
weight biases.

### 8.1 Bot decision space

Four kinds of decisions a bot can take any tick:

1. **Move** (4 cardinals + stay).
2. **Bomb** (place bomb at current cell, if allowed).
3. **Special** (use a power-up — Kick triggers passively on movement,
   Remote needs explicit triggering — currently not in scope, see
   GDP-003 / GDP-006 "bot is NOT required to use" hints).
4. **Wait** (no action, lets the situation evolve).

Personality bias changes the weight of each, not the decision tree
shape.

### 8.2 Danger map

The bot maintains a per-cell "danger" score:
- Cells covered by an active blast: ∞ danger.
- Cells covered by a bomb's projected blast (assuming the bomb's
  range): high danger, decays with fuse remaining.
- Cells adjacent to a soft block: small bonus (these are where
  pickups land).
- Cells the player can reach in ≤ 3 ticks: weighted by personality
  (Hunter +, Coward −, Miner ignores).

The danger map is recomputed every bot decision, not every tick —
keeps the cost bounded.

### 8.3 Personality archetypes (from GDP-005)

| Archetype | Bomb-place weight | Flee weight | Pursue-player weight | Approach-soft-block weight |
|---|---|---|---|---|
| balanced | 1.0 | 1.0 | 0.5 | 0.5 |
| hunter | 1.3 | 0.8 | 1.0 | 0.3 |
| coward | 0.4 | 1.5 | 0.0 | 0.7 |
| miner | 0.9 | 1.0 | 0.0 | 1.4 |

These are seed values — playtest tunes.

### 8.4 Bot anti-patterns

- **No omniscient bots.** A bot only sees what would be visible to
  a player at its cell — soft blocks 1 cell beyond a hard block
  are unknown to the bot. (Today this isn't enforced; the bot can
  "see" the whole arena. Tightening it is a future story.)
- **No frame-perfect reactions.** The decision-interval throttle
  is the bot's reaction-time budget. Easy bots feel slower because
  they decide less often, not because they pretend not to see.
- **No bot-only power-ups.** Anything a bot picks up, a player can
  pick up. Symmetry.

---

## 9. Multiplayer model (deep dive)

Headline shape lives in `gdd.md §Multiplayer model`. This section is
the design intent for dev when GDP-007 lands.

### 9.1 Authority

The server is authoritative on:
- Bomb placement (validated against bomber stats + cell occupancy).
- Bomb fuse + detonation timing.
- Blast propagation + damage application.
- Block destruction.
- Pickup spawning + collection.
- Bomber alive/dead state.
- Bot AI.
- RoundState (phase, tally, time limit).
- Pickup drop RNG (server's seed).

The client is authoritative on:
- Camera position.
- Audio playback.
- Visual VFX (particle bursts, screen-shake).
- HUD rendering.
- Vocal-synth output.

The client PREDICTS (then reconciles to the server):
- Local player's movement direction + position.
- Local player's bomb-place input (sends a request; if the server
  refuses, the predicted bomb gets reverted).

### 9.2 Reconciliation

- Server sends a `worldSnapshot` at ~10 Hz (configurable; lower is
  fine for grid gameplay).
- Client compares local predicted state with the snapshot. If the
  player's grid position differs by ≤ 1 cell, the client smooths
  toward the server value over 200 ms. If it differs by > 1 cell,
  the client snaps.
- Server input lag: client sends `inputIntent` with a tick number;
  server applies it at the next eligible tick + sends back a
  `inputAck` with the resulting state. The client uses the ack to
  trim its prediction.

### 9.3 Drop-in / drop-out

- A new player joining at mid-round **spectates until next round**
  (default rule per GDP-007). Eliminates the "I joined and was
  instantly bomb-killed" feel-bad.
- A leaving player's bomber is **despawned immediately** (default
  rule per GDP-007). Their bombs continue to fuse + detonate as
  normal (no orphan cleanup) — bombs are server-owned, not
  client-owned.
- A disconnected player (network drop, not deliberate leave) is
  given a 5-second grace before despawn. Reconnect within that
  window restores their bomber.

### 9.4 Network anti-patterns

- **No client-authoritative damage.** The bomber's own client never
  decides "I took a hit." The server says so.
- **No client-authoritative pickup.** Same reason.
- **No lockstep simulation.** Server runs the sim; clients render.
  Lockstep is brittle under variable latency.
- **No prediction on remote players.** Remote bombers' positions
  come from snapshots only; we INTERPOLATE between snapshots, but
  we don't PREDICT what they'll do next.
- **No re-sending of bomb placement on disconnect.** If the client
  loses the connection between sending `placeBomb` and getting the
  ack, the bomb is lost. Don't retry — it would land in the wrong
  cell or duplicate.

---

## 10. Solo objectives (long-term — MVP-3+)

The current solo loop is "fight the bot until you win or get bored."
The long-term solo loop is **session objectives**: a short
explicit goal that gives a session shape.

### 10.1 Objective types (catalogue)

| Objective | How it works | When valuable |
|---|---|---|
| Clear Sector | Destroy all soft blocks in the arena | Easy intro; tests bomb placement |
| Extract Core | Find a "core" pickup hidden under blocks, carry it to an extraction gate | Adds a non-combat goal |
| Survive Alarm | After triggering an alarm, survive 60 s while bomb-laying drones swarm | Adds pressure |
| Chain Target | Trigger a chain reaction through marked cells in one bomb-drop | Skill test |
| Rescue Bot | Open path to a friendly bot, escort it to an exit | Adds a "protect the NPC" verb |
| Boss Gate | A larger grid-aware enemy with a multi-stage fight | Set-piece moment |

Each objective is a small ECS system + a couple of components +
configuration in the scene file. None require new shaders, new
audio bus features, or new render passes — they're all
combinations of the systems above.

### 10.2 Objective rollout philosophy

- **One objective per arena.** Don't stack. The player's session is
  framed around one goal.
- **Always optional.** Even when an objective is loaded, the
  combat loop is still available — you can ignore the objective
  and fight bots.
- **Procedurally placed.** The objective's core / target cells are
  picked at arena generation time, with the same deterministic
  RNG as block placement.

### 10.3 Objective rollout order (recommendation)

1. **Clear Sector** first — closest to existing rules, simplest to
   ship.
2. **Chain Target** second — same primitive (count something), just
   different shape.
3. **Extract Core** third — adds the "carry object" verb. Bigger lift.
4. The rest deferred indefinitely; revisit only if persistent-world
   needs them.

None of these are proposed as stories yet — they're a backlog of
future shape, intentionally documented before being scheduled.

---

## 11. Arena modules / hazards (catalogue, no commit)

The DynaBomber working note lists ~20 arena modules. This section
**catalogues them with a Ship/Wait/Reject verdict** based on the
current design state.

| Module | Function | Verdict |
|---|---|---|
| Conveyor Belt | Moves bombers + bombs along a lane | Wait — needs the chunked arena |
| Jump Pad | Launches bomber over danger | Reject — adds a vertical axis, fights grid authority |
| Warp Hole | Teleports bomber/bomb to another warp | Wait — best for MVP-3 chunked map |
| Tunnel | Hides bomber from camera/minimap | Wait — needs LOS / fog system |
| Darkness Zone | Limits local visibility | Reject — punishes the player who entered without knowing |
| Falling Walls | Shrinks playspace over time | Wait — good MVP-3 set-piece |
| Regrowth Block | Soft blocks regrow after a timer | Wait — needs region/modifier primitive |
| Power Zone | Sector with extra power-ups | Wait — needs region primitive |
| Speed Zone | Global speed boost in a sector | Wait — same |
| Reactor Line | Blasts can power doors / gates | Reject — too maze-ey for an action game |
| Blast Mirror | Reflects blast once | Reject (for now) — adds a "you didn't see that coming" hit |
| Pressure Plate | Opens paths / spawns bombs | Wait — interesting in objective rounds |
| Bomb Rail | Kicked bombs follow rails around corners | Wait — needs Kick (GDP-003) shipped first |
| Magnetic Tower | Pulls bombs toward it | Reject — Rapier-ey, fights grid authority |
| Cooling Vent | Slows fuse | Reject — confuses the fuse-timing readability |
| Volatile Crystal | Delayed radial pulse | Wait — feels like a hazard variation, low priority |
| Guard Drone | Patrols + drops weak bombs | Wait — needs more bot variety first |
| Collapsing Bridge | Breaks after blast | Wait — MVP-3 set-piece |
| Signal Jammer | Hides minimap markers in region | Wait — needs minimap maturity |
| Storm Boundary | Shrinking arena pressure | Wait — MVP-3, classic battle-royale touch |

The pattern: **Reject anything that fights grid authority or punishes
the player for not knowing.** Wait on the rest until there's a
specific arena that needs them.

When a hazard is promoted to a proposed-story, it should ship with:
- Component schema for the hazard.
- One system implementing its behaviour.
- Visual representation (shader + colour + optional VFX).
- Audio cue when it activates / affects the player.
- Bot AI awareness OR explicit "bots ignore this hazard" caveat.

---

## 12. Determinism, replay, and validation

The whole architecture is built around the idea that a recorded
sequence of inputs reproduces the same outcome bit-for-bit. This
section is what dev / QA must NOT break.

### 12.1 Determinism rules

- **No Math.random() in any gameplay system.** Use a seeded RNG
  (`xorshift32` or similar). Each system carries its own seed,
  derived from the world seed + the system's identifier.
- **No wall-clock dependencies.** Systems read `fixedDeltaTime`,
  not `performance.now()`. Animation systems CAN use wall-clock for
  presentation but must not affect gameplay state.
- **No floating-point comparison without epsilon.** All gameplay
  comparisons (`bomber at cell X?`, `range >= 3?`) use integers
  (grid positions, range counts) — floats are for presentation.
- **No iteration order surprises.** Entity iteration is by ECS
  insertion order. If a system depends on iteration order (rare),
  it sorts entities by entity-id first.

### 12.2 Replay file

The `recordings/demo-30s.recording.json` is the integration
canary. Every PR touching gameplay must verify the recording still
replays correctly. When intentional gameplay changes break the
replay, regenerate the recording in the same PR.

### 12.3 Validation entry points

- `npm run engine:check -- examples/kaboom-crew` validates the
  scene + project + schema.
- `npm run test` runs the unit-test suite per system.
- `bot-vs-bot.test.ts` runs the full system stack for 60 sec.
- `npm run playtest examples/kaboom-crew` runs the Playwright smoke
  test against the boot path.

Any gameplay story should pass all four before merging. The first
three are pre-PR; the fourth is dev's final smoke.

---

## 13. Out-of-scope (intent only)

Things people will ask for that we are NOT doing. Document them so
future agents don't accidentally drift into them.

- **No PvP team modes** in MVP. Two-team play (2v2, 1v1v1v1, etc.)
  is a stretch goal. The MVP is solo-vs-bots or free-for-all.
- **No level editor in MVP.** Arena generators are data-driven;
  authoring an arena UI is a separate sprint, not a hidden cost of
  current proposals.
- **No real-time voice chat.** Procedural vocal synth (GDP-010)
  is the maximum vocal feature. Voice chat needs WebRTC and adds
  moderation cost — out of MVP scope.
- **No leaderboards / ranked play.** Tally is local. Persistent
  multiplayer profile (when GDP-007 lands) might surface
  win-streak; we are NOT building a global leaderboard.
- **No matchmaking queue.** Drop-in / drop-out is the model. If
  rooms / lobbies become necessary, they ship as a separate story
  with their own design pass.
- **No microtransactions, paid cosmetics, ads, or analytics
  beacons.** The sample game is engine showcase, not a service.
- **No tournament mode, no eSports support.** Out of scope.

When a request comes in that lands in one of these, the answer is:
"That's deliberately out of scope; if you want to revisit, the
GDD's relevant section is the place to argue it." Don't just say
no without naming the section.

---

## 14. Open questions (gameplay)

Questions that will resolve themselves once a future story lands,
listed so we don't accidentally pre-decide them:

1. **Friendly fire toggle.** All current proposals assume friendly
   fire is on. When team modes land, FF will become a ruleset
   toggle. Don't bake "FF always on" into core systems.
2. **Bomb count visibility for remote players.** Should the
   enemy's `bombs A/B` count be visible on the HUD? Pro: tactical
   information helps gameplay. Con: removes a "did they place
   another?" guessing layer. Recommend visible. Defer to network
   story.
3. **Pickup auto-collect vs walk-over.** Currently auto-collected on
   walk-over. Should pickups require an explicit "interact" key?
   Probably no — slows pace — but it would matter for the Extract
   Core objective.
4. **Round timer visibility.** Today the timer is in the HUD bottom-
   left. Should it become a centre-screen number under the last
   10 seconds? Probably yes; small follow-up.
5. **Auto-restart timing.** 3 seconds is a guess. Playtest may
   want 2 or 4. Easy to tune; documented here so the value isn't
   treated as load-bearing.
6. **Bot count in multiplayer.** When N humans connect to a 4-slot
   arena, do we fill remaining slots with bots? Recommend "yes, fill
   to 4 total bombers" — keeps the round-length consistent. Defer
   final answer to the network story.
7. **Cosmetic unlock conditions.** What's the right shape? Per-
   match milestones? Total wins? Specific achievements? Defer to
   the cosmetic-unlocks design pass.

None of these block current proposals.
