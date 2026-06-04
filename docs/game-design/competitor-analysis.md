# Competitor Analysis — Kaboom Crew vs the modern arcade-multiplayer field

> **Status: investigation.** First pass: 2026-05-27.
> Companion to `gdd.md` + `gameplay-systems.md`. Refresh of the
> 2026-05-18 reference table in `notes/DynaBomber.md §2.5`, now that
> ~70 sprints have shipped and the game is materially in MVP-2 polish.
> Owner: game-design agent. Outputs: this analysis + 1-2 story
> proposals for the highest-value pattern adoptions.

---

## 1. What Kaboom Crew is today (May 2026)

Headline state — to ground the comparison:

- **Bomberman-rules core**: grid-authoritative, fuse + cross blast +
  chain reactions + soft/hard blocks + power-up drops.
- **9 power-ups shipped**: Bomb Up, Fire Up, Speed Up, Kick, Remote,
  Shield, Pierce, Throw Glove, Bomb Pass.
- **3 hazard modules**: Conveyor Belt, Warp Hole, Pressure Plate.
- **6 arena variants**: default, wide, corridor, plaza, cross, pit.
- **3 bot personalities**: Hunter, Coward, Miner. Visually
  differentiated (palette + accessory).
- **Multi-bot solo** (3 bots, one of each personality).
- **Multiplayer**: connect-and-spectate + server-authoritative
  gameplay (Sprints A+B) + drop-in/out + recipe sync.
- **Match structure**: best-of-3.
- **Procedural characters**: 16-param recipe + 8-channel palette +
  3 texturing layers + 5 accessories + procedural CV-babble voice +
  Rapier ragdoll death.
- **Persistent profile** + **5 cosmetic unlocks** (achievement-driven
  accessory pool).

What it **doesn't have**: dash, melee, sudden-death pressure, mode
variety beyond FFA, player-built traps, gadgets / character kits,
co-op PvE waves, ping system, replay / stadium mode.

---

## 2. Competitor matrix — what 10 modern games do well

Refreshed from `notes/DynaBomber.md §2.5` with current Kaboom Crew
state as the contrast.

| Game | What it does best | Already in Kaboom? | Worth adopting? |
|---|---|---|---|
| **Boomerang Fu** | One-button clarity, stackable power-ups, bots, cute aesthetic | ✅ stackable, ✅ bots, ✅ cute | most patterns already in; nothing major to steal |
| **Bopl Battle** | Wild stackable abilities — black holes, time stop, growth | ❌ no exotic abilities | only as a parking-lot for future MVP-3 spice; high risk to readability |
| **Ultimate Chicken Horse** | Player-built danger between rounds | ❌ no editor | conflicts with our pace; skip |
| **Move or Die** | Rapid rule changes between rounds | ❌ no rule rotation | breaks tactical readability per `gameplay-systems.md §7.2`; skip |
| **SpiderHeck** | Physics spectacle, acrobatics, co-op enemy waves | partial (ragdoll ✓, no co-op waves) | **co-op waves = strong solo content layer**; worth |
| **Duck Game** | Huge weapon toybox + expressive silly controls | ❌ no weapons-beyond-bombs | adds complexity tax; skip |
| **Super Animal Royale** | Large-map fog-of-war, BR, cosmetics, short matches | partial (cosmetics ✓, no BR / fog) | **fog-of-war + sudden death pressure = match-end fix**; worth |
| **Bombergrounds: Reborn** | Modern Bomberman direction — dash, melee bat, animal characters | ❌ no dash, no melee | **dash mechanic = clear adopt**; melee bat = stretch |
| **Brawl Stars** | Short modes, character kits, gadgets, objective variety | partial (short ✓, characters ✓; no kits, no objectives, no modes) | **objective modes = solid mode-variety hook**; gadgets = stretch |
| **Super Bomberman R/R2** | Up to 16 players, battle royale, team modes, custom rooms | partial (4 humans, no BR, no teams) | **sudden death + 1 alt mode**; BR + teams = mid-term |

---

## 3. Patterns worth adopting (ranked by impact-to-cost)

### 3.1 Sudden death — shrinking-arena pressure ⭐⭐⭐

**Source:** Super Bomberman R, Super Animal Royale, Brawl Stars.

**Problem it fixes:** Kaboom Crew rounds occasionally drag past the
90-second timeout when two cowardly bombers refuse to engage. The
current resolution is `RoundState.phase = 'draw'`. Draw is the
least-satisfying outcome. Sudden death FORCES engagement.

**Adoption shape:**

- At round-timer = 60s (mid-round), trigger a `sudden-death` event.
- A wall of hard blocks starts closing in from the arena edges,
  one ring per 2 seconds. Bombers caught in the closing wall die
  (the wall behaves like a moving blast for damage purposes).
- Visually: red-glowing hard blocks shrink the playable area into
  smaller and smaller central zones.
- The bomb mechanic itself unchanged — just the playable space
  shrinks.

**Cost:** Single new hazard module — `ShrinkingWall` — built on the
existing hazard pattern (Conveyor S146, Warp S149, Pressure Plate
S151). Schema component + system. ~150 LOC. Single-sprint story.

**Why ⭐⭐⭐:** ONE feature fixes the stalemate-draw issue (which has
already surfaced in playtest) AND adds visible tension to long
rounds AND deepens match-resolution drama for multiplayer.

### 3.2 Dash mechanic — short cooldown movement burst ⭐⭐⭐

**Source:** Bombergrounds: Reborn, Brawl Stars.

**Problem it fixes:** Movement options today are walk + Kick + Throw.
Kick + Throw require objects on cells. Pure movement = walk only.
A short-cooldown dash gives players an escape verb and a chase verb
that doesn't depend on items.

**Adoption shape:**

- New input: Shift (or right-click). On press: bomber moves 2 cells
  in their facing direction over 0.2s (animated arc).
- 3-second cooldown. HUD shows cooldown ring on the dash icon.
- Dash passes THROUGH ANY entity on the path EXCEPT hard blocks
  (so you can dash over soft blocks, over bombs, over bombers — the
  dash is the movement verb that breaks the grid-blocking norm).
- Dash CAN'T be steered mid-animation. Commit on press.
- Dash does NOT trigger Conveyor / Warp / Pressure Plate on cells
  passed through (only the LANDING cell). Predictable.
- Dash WHILE shielded: shield preserved (dash is movement, not
  damage).
- Dash INTO a blast cell: bomber lands → blast kills normally.
- Bots get dash too, scoped to escape moves (low-aggression bots
  use it defensively).

**Cost:** New system + input wiring + per-bomber cooldown state +
HUD slot. Same shape as Kick / Throw Glove. Medium-sprint story.

**Why ⭐⭐⭐:** Highest gameplay-feel uplift per LOC. Modern bomb-em-up
players expect dash; its absence is the most "feels dated" gap in
the current Kaboom Crew.

### 3.3 Co-op solo waves — bomber-vs-monster-waves mode ⭐⭐

**Source:** SpiderHeck (the most direct), Brawl Stars (Big Game,
Boss Fight modes).

**Problem it fixes:** Solo content today = FFA against bots. Replay
loop is "play 3 rounds of FFA, retry". Adding a Wave mode gives a
qualitatively different solo loop — player + bots collaborate
against AI threats.

**Adoption shape:**

- New scene `wave-mode.scene.json` + new game mode.
- Player + 2 friendly bots vs scripted monster waves. Each wave:
  N monster-bombers spawn from the arena edges with random
  personalities, attack the player + friendly bots. Survive N
  waves to win.
- Monsters are server-controlled bots with hostile-AI personality
  (variant of Hunter — aggressive bomb placements). No new bot
  archetype required; just a scripted spawn schedule.
- Difficulty escalation: each wave has +1 monster + speed slightly
  scaled.
- Round-resolve replaced with wave-resolve: when all monsters in
  the wave dead → next wave; when all friendly bombers dead → game
  over.

**Cost:** New WaveModeSystem + new monster-spawner + new round-
resolve variant. Medium-large story; probably 2 sprints.

**Why ⭐⭐:** Adds genuinely different solo content. But significant
work + risks balancing pass. Lower priority than 3.1 + 3.2.

### 3.4 Quick-ping system for multiplayer ⭐⭐

**Source:** Brawl Stars, Apex Legends, every modern team multiplayer.

**Problem it fixes:** Multiplayer Kaboom has no comms. Players in
the same world can't signal anything — "look out", "go here", "watch
this corner". Silent multiplayer feels coordinatedless.

**Adoption shape:**

- Hold X (or right-click on a cell): a "ping" appears at that cell.
  Server broadcasts to all clients; all see a colourful arrow +
  bomber's primary palette ring at the cell for 3 seconds.
- 4 ping types via radial menu: "danger" (red), "look" (yellow),
  "go" (green), "thanks" (cyan).
- Cooldown 5s per bomber.
- Audio: short ping sound + vocal-synth's "hit" slot fires (pings
  are quick callouts).

**Cost:** New ping system + protocol message + HUD overlay layer.
Small-to-medium story. Mostly UI + one protocol field.

**Why ⭐⭐:** Multiplayer feels less "social" without comms. But this
is polish, not headline. Lower priority than mechanics gaps (3.1 +
3.2).

### 3.5 Mode variety — 1-2 alternate match modes ⭐⭐

**Source:** Brawl Stars (Gem Grab, Heist, Brawl Ball), Super
Bomberman R (team modes).

**Problem it fixes:** Match = FFA last-bomber-standing only.
Alternate objectives give the game replay variety without new
mechanics.

**Adoption shape — 2 starter modes:**

1. **Pickup Hoarder** — collect the most pickups by round end (not
   last-bomber-standing). Match resolves when timer expires.
   Different incentive — bomber wants to clear blocks, not bomb
   opponents.
2. **King of the Cell** — a designated centre cell scores points
   when occupied. First to 30 points (cumulative across rounds in
   the match) wins. Forces engagement around the cell.

Match-config URL knob `?mode=ffa|hoarder|king`. Server worldConfig
flag in multiplayer.

**Cost:** Each mode = round-resolve variant + scoring system + HUD
indicator. ~1 sprint per mode.

**Why ⭐⭐:** Adds variety, low risk. But Kaboom Crew's identity is
FFA-shaped; adding modes risks diluting the "core game" feel. Worth
SOME modes but cap at 2-3.

### 3.6 Fog-of-war on large arenas ⭐

**Source:** Super Animal Royale.

**Problem it fixes:** Cross arena (17×17) is large enough that
players can lose track of opponents' positions. Fog-of-war makes
that uncertainty intentional, not accidental.

**Adoption shape:** Camera-bound visibility radius (e.g. 6 cells
around the bomber). Cells outside the radius are dimmed; opponent
bombers in dimmed cells are hidden from the bomber's render but
appear on the minimap.

**Cost:** Visibility system + cell-by-cell render mask. Medium.
Touches renderer significantly.

**Why ⭐:** Cool feature but solves a problem only on the largest
arena (cross). Not a general-purpose adoption.

### 3.7 Character kits + gadgets (Brawl Stars) — DEFER

**Source:** Brawl Stars.

Each bomber has a different stat profile + active gadget. Currently
bombers are mechanically identical (only personality + visual
differ).

**Why defer:** Adding kits means every BomberStats change must apply
per-character-stats; the symmetric-start rule (`gameplay-systems.md
§7.2`) breaks. Cosmetic-only character identity is the current rule.
Adding kits is a major design pivot, not a marginal adoption.

### 3.8 Replay / spectator stadium — DEFER

Long-running spectator infrastructure. Heavy. Defer until live
audience exists.

---

## 4. Patterns to explicitly skip

Documenting non-goals so future cycles don't re-litigate.

| Pattern | Reason |
|---|---|
| Per-round rule mutations (Move or Die) | Breaks tactical readability per `gameplay-systems.md §7.2` — players need rules they can predict. |
| Player-built traps between rounds | Conflicts with our pace; bombs ARE the trap layer. |
| Skull-curse / random debuffs | Already rejected per `gameplay-systems.md §5.4`. |
| Live-service progression / battle pass | Already rejected per `gdd.md Cosmetic unlocks`. |
| 64-player battle royale | Out per `gdd.md` MVP scope. |
| Real-money monetisation | Out per `gdd.md`. |
| Realistic / photogrammetric art | Visual-style.md §2.1 explicit rejection. |
| Voice chat | Privacy + moderation cost outweighs value; ping system is the substitute (§3.4). |

---

## 5. Recommended adoption batch (filing today)

Two stories, ranked by impact-to-cost:

1. **GDP-2026-05-27-013 — Sudden death / Shrinking Arena hazard module** (highest impact, fixes stalemate problem)
2. **GDP-2026-05-27-014 — Dash mechanic** (highest gameplay-feel uplift)

The other patterns (co-op waves, ping, mode variety) are noted here
for future cycles but not filed today — pipeline already has 4
pending stories.

---

## 6. Open questions

1. **Mode variety vs FFA identity** — should Kaboom Crew stay
   FFA-defined or embrace multi-mode rotation? Defer until §3.1 +
   §3.2 ship and we see how the game feels with their additions.
2. **Co-op waves as solo direction** — does this become the canonical
   solo loop (vs FFA-against-bots)? User decision needed before
   filing §3.3 as a story.
3. **Ping system** — single-tap quick ping vs radial menu? Defer to
   playtest.
4. **Fog-of-war on cross arena** — opt-in feature or always-on?
   Defer until playtest confirms cross arena needs it.
