# Game Design Document — Kaboom Crew

> **Status: living.** Last design pass: 2026-05-20.
> Owned by the game-design agent (`docs/game-design/agent.md`). Dev + QA read it.
> Working notes live in `notes/DynaBomber.md` (broad reference doc) and
> `notes/dynabomber-readiness-analysis.md` (engine-gap audit). This file is
> the **source of truth** for current intent — when those notes and this
> doc disagree, this doc wins.

---

## Overview

**Kaboom Crew** is a 3D top-down bomb-em-up. The MVP is a 15×11-cell
arena, one human bomber against one bot, fastest-blast-wins, three-second
auto-restart. Codename **DynaBomber** in working notes; the public name
locked in S082.

The long-term target is a **modern dynamic casual multiplayer** game:
drop-in / drop-out persistent world, 1–4 humans + bots, server-owned
bomb/blast authority, large procedural map streamed in chunks, short
sessions inside a longer "world that keeps going" frame.

Today's prototype is the MVP-0 / MVP-1 base of that target.

- **Audience**: arcade / party-game players; secondary audience is the
  AGF engine — Kaboom Crew is the flagship dogfood sample.
- **Win condition (MVP)**: be the last bomber alive in the arena.
- **Win condition (planned)**: per-session goals (clear sector, extract
  core, survive alarm) layered on top of the arena loop.
- **Session length**: ~30 s per round today; planned 2–5 min per session,
  inside an open-ended persistent world.

The design pillars stay the same across MVPs:

1. **Local chaos, global clarity.** Death must be readable — audio, fuse
   wiggle, minimap pings — never silent.
2. **Solo-first, multiplayer-ready.** Bots are required, not optional.
   Joining or leaving never breaks the world.
3. **Agent-friendly rules.** Schema-driven components, deterministic
   seeds, validation, robot playtests. Every mechanic is one or two
   small systems plus a JSON schema fragment.

Two pillars from the working notes have been **softened** based on
playtest feedback:

- *Blast-prediction overlay on the floor* — rejected in principle
  (memory: `feedback-no-blast-prediction-decal.md`, 2026-05-20). Use audio,
  bomb-mesh wiggle, particles, screen-edge cues, minimap — never on-floor
  decals showing which cells an imminent bomb will hit.
- *Full Bomberman R-style 8-player battle royale* — out of scope. Engine
  target is 1–4 humans + bots in MVP-2, with 8 humans as a stretch.

---

## Mechanics

### Movement (shipped)

- Continuous lane-assisted movement on a 15×11 grid. Player uses WASD or
  arrows; bot drives `BotBrain` decisions through the same `GridMover`
  surface.
- `GridOccupancySystem` is authoritative for tile blockers; bombs become
  solid for the placer the moment they leave their own cell.
- `agent.gotoCell` exposes BFS pathing to agent probes — same primitive
  used by both bot AI and `__agf.kaboom.gotoCell`.

### Bombs (shipped)

| Property | MVP value |
|---|---|
| Fuse | 2.5 s |
| Blast shape | Cross / 4 cardinals |
| Base range | 2 tiles |
| Chain reaction | Yes — bombs caught in another blast detonate immediately |
| Max active per bomber | `BomberStats.maxBombs` (starts at 1) |
| Friendly fire | Enabled — your own blast kills you |

Bomb logic is **grid-authoritative**, not physics-authoritative. This is
non-negotiable: the future Node/.NET server must validate placement and
explosion outcomes against the same rules.

### Bombs (planned, MVP-2)

| Power-up | Effect | Status |
|---|---|---|
| Bomb Up | +1 maxBombs | ✅ shipped (MVP-0) |
| Fire Up | +1 range | ✅ shipped (MVP-0) |
| Speed Up | +GridMover.speed | ✅ shipped (MVP-0) |
| Kick | Walking into your bomb pushes it one cell in walk direction | proposed |
| Remote | Manual detonation — fuse paused while remote-armed | proposed |
| Shield | One-shot blast protection, consumed on hit | proposed |

Later (post-MVP-2): Pierce, Bomb Pass, Throw Glove. Skull-curse is
explicitly **deferred** — it punishes new players harder than veterans,
and that contradicts pillar 2.

### Blocks (shipped)

- **Hard blocks**: permanent walls, block movement and blast.
- **Soft blocks**: destructible, block movement and blast, deterministic
  RNG drop table (per-cell seed, so the bot-vs-bot regression test stays
  deterministic).

No cracked blocks, no regrowing blocks, no glass blocks today. Adding
those is straightforward (one component + one system) but unmotivated
until a session-objective design needs them.

### Round flow (shipped)

1. Boot loads `scenes/start.scene.json` and mounts the title-screen
   overlay (`GamePaused` singleton).
2. First Space dismisses the title. Bot AI / fuse / placement systems
   start ticking.
3. Round runs until `RoundResolveSystem` sees ≤ 1 bomber alive (or 90 s
   timeout → `draw`).
4. HUD banner shows result; auto-restart fires 3 s later. `roundNumber`
   and `tally` survive the scene reload.

### Round flow (planned, MVP-2)

- **Session objectives** layer on top of the arena loop: "clear all
  soft blocks", "extract the core to the gate", "survive 2 minutes".
  Round-resolve becomes objective-aware instead of last-bomber-standing
  only.
- **Per-arena modifiers** rather than per-game modifiers. Each arena can
  flag "fast fuse" / "regrowth on" / "shrinking edges". One modifier per
  arena to start.

---

## Progression

### Difficulty dial (shipped)

`?difficulty=easy|normal|hard` URL param maps to a `BotBrain` +
`BomberStats` + `GridMover` patch applied at round start.

| Preset | Aggression | Decision interval | Range | Speed |
|---|---|---|---|---|
| easy | 0.25 | 500 ms | 2 | 2 |
| normal | 0.50 | 200 ms | 2 | 3 |
| hard | 0.85 | 120 ms | 3 | 4 |

The dial **does not** change pickup spawn rates, blast shape, or arena
size. That's deliberate — players should be able to learn one set of
rules and only have the opponent change.

### Difficulty dial (planned, MVP-2)

Add **bot personality** as a second axis. The numeric dial keeps tuning
reaction speed and aggression; the personality axis swaps in archetypes
(Hunter, Coward, Miner, Saboteur). A "hard Coward" is faster than an
"easy Coward" but still won't chase the player.

### Session pacing (current vs planned)

- MVP-0/1 (today): single arena, ~30 s rounds, infinite auto-restart.
  No metaprogression.
- MVP-2: short "match" = 3 rounds best-of. Persistent tally already
  exists; the leap is just adding a "match resolved → world event"
  transition.
- MVP-3+: persistent world. Players enter the world, play a couple of
  matches, leave; the world holds tally / win-streak / seasonal state.

### Cosmetic unlocks (planned, MVP-3+)

**Decided 2026-05-20**: cosmetic unlocks are in the long-term plan
but DO NOT land before MVP-3. Unlocks add accessories to the player's
procedural-character recipe pool — they never change stats.

- Unlock conditions are achievement-shaped ("won 10 rounds",
  "survived a chain reaction"). No daily challenges, no battle pass,
  no monetisation — the GDD's "no live-service progression" line
  still holds.
- Requires a persistent player profile (local storage minimum;
  multiplayer profile once GDP-2026-05-20-007 ships).
- Cosmetic-only is non-negotiable. Stats-on-cosmetics drift into
  pay-to-win even without money in the loop and contradict the
  agent-friendly-rules pillar.

Full design intent: `docs/game-design/characters-and-visual.md` §6.3.

---

## World

### Arena (shipped)

A single 15×11 cell arena with the classic odd/even hard-block lattice
on interior cells, soft blocks scattered around it, two spawn cells in
opposing corners. Generator lives at
`examples/kaboom-crew/generators/kaboom-arena-small.gen.mjs`.

### Arena (planned, MVP-2)

- **Two more arena variants**: a long corridor (forces commit decisions)
  and an open plaza (forces bomb chains for kills). Both reuse the
  current generator with config switches.
- **Per-arena modifier** (one per arena): "fast fuse" or "regrowing
  blocks". Modifier lives on the arena scene file, not in code.

### Arena (planned, MVP-3+)

Chunked persistent world: 3×3 sectors visible around the player,
streamed by `ChunkStreamingSystem`. Inactive sectors keep their state in
the server but stop emitting events. Empty sectors catch up from
timestamps on next visit rather than running live sim.

### Visual direction

Toy-scale industrial diorama: chunky low-poly shapes, painted-plastic
materials, neon hazard strips, glowing power-up cores. Today's shapes
are deliberately primitive (boxes + capsules) — that's intentional
until the procedural character generator lands. The art bar lifts only
after that.

---

## Characters

### Today

- One player capsule (`player.1` prefab).
- One bot capsule (`bot.1` prefab) with the difficulty preset applied
  at round start.
- Both render as a coloured capsule + dot. Colour identity (player
  blue, bot red) carries to the minimap.

### Planned (MVP-2)

- Up to **4 human bombers** in the arena + up to **2 bots** to fill
  empty slots. Server-side authority on bomb placement gates which
  client may write `PlaceBombRequest` to which entity.
- Bot personality variants share the `BotBrain` schema; the variant
  picks the weights, not the component shape.

### Planned (MVP-3+)

- **Procedural avatars (locked, 2026-05-20)** — chunky toy-scale bodies
  composed from primitive nodes (capsule torso + sphere head + accessory
  meshes), a seed-driven palette per bomber, a minimap-icon colour
  derived from the same seed. Full design rationale in
  `docs/game-design/characters-and-visual.md`. The starting point is
  the draft in `notes/humanoid_generator_analysis.md`, but the new
  doc supersedes it where they disagree.
- **Procedural animation (locked, 2026-05-20)** — idle bob, walk cycle
  (two-bone leg IK + hip rotation), bomb-place arm reach, hit recoil
  and slapstick death are all driven by ECS systems (sine waves, IK
  solvers, spring physics, Tween) acting on the generated mesh nodes
  directly. **Mixamo / hand-authored rigged-GLB humanoid clips are
  out of scope.** Rationale: no artist on the team, and the engine's
  flagship sample should not depend on an external animation library.
  See `docs/game-design/characters-and-visual.md`.
- **Slapstick death**: a launch-up + ragdoll tween instead of instant
  disappearance. Lowers the competitive sting of a one-hit-kill and
  fits the "modern party game" tone — without rebuilding combat rules.
  Already promoted to MVP-1 via proposal GDP-2026-05-20-004.

---

## UX

### Controls (shipped)

| Key | Action |
|---|---|
| W/A/S/D or arrows | Move player.1 |
| Space | First press: dismiss title. After: place bomb on current cell |
| R | Restart round immediately |

Controller / touch input is **deferred** until MVP-3. Keyboard is the
only supported surface during MVP-0 → MVP-2.

### HUD (shipped)

- **Bottom-left**: `Round N | W:A L:B D:C`, current round phase + timer,
  per-bomber `bombs A/B fire C` (✗ on dead).
- **Bottom-right**: Canvas2D minimap — triangles for bombers, dark dots
  for live bombs, coloured rects for pickups.
- **Centre**: title-screen overlay before first round; win/loss banner
  on resolve; otherwise empty.

### HUD (planned)

- **Distant-explosion minimap ping** when another bomber's blast fires
  outside the player's local view. Stays consistent with the rejected
  on-floor decals — danger is signalled on the HUD layer, never on the
  arena floor.
- **Network indicator** when MVP-3 lands — a small bar showing peer
  count + latency, no full server console.

### Audio (shipped)

Engine-level audio bus (S084). Kaboom Crew binds four events:
`bomb-place`, `blast`, `pickup`, `death`. The audio language is the
primary danger telegraph (alongside bomb-mesh wiggle in the final
0.6 s of fuse).

### Audio (planned)

- **Positional 3D audio** for nearby bombs and explosions once the world
  scale grows past a single screen.
- **Stylised stereo cue** for distant blasts (off-screen events) — pairs
  with the minimap ping.
- **Procedural vocal synth (decided 2026-05-20)** — each bomber has a
  tiny voice synthesised from its recipe seed. Five emotional slots:
  place-bomb, hit, pickup, death, victory. Voice colour (pitch +
  timbre + envelope) is seed-derived so a given character always
  sounds the same. Layered on top of the existing audio clips, not
  replacing them. No pre-rendered voice assets — all synthesised at
  play time. See `docs/game-design/characters-and-visual.md` §6.4 and
  proposal `GDP-2026-05-20-010`.

### Accessibility

- Colour-blind palette pass is **deferred** to MVP-3 polish, but the
  HUD already uses shape + text alongside colour for bomber identity.
- No flashing-strobe warning yet — bomb-fuse wiggle is the only
  rapid-pulse element and it is intentionally tamed in S099.

---

## Multiplayer model (planned)

This section is intentionally **forward-looking** — none of it ships
yet. It's here so dev sees the shape we are aiming at before the first
network sprint.

- **Drop-in / drop-out world**, no matchmaking. World exists before
  players connect; players appear in the current state; leaving doesn't
  end the world.
- **Server authority** on bomb placement, fuse, blast, block
  destruction, pickup collection, damage, bot logic. VFX + audio +
  camera are client presentation only.
- **Three profiles**: `static` (offline local), `connected` (WebSocket
  mirror, fast iteration), `authoritative` (server owns gameplay).
  AGF's protocol contract already covers this — Kaboom Crew is the
  first concrete consumer.
- **Practical player counts**: 1 human + bots (MVP-2), 1–4 humans +
  bots (MVP-3), 8 in one region (stretch). 64-player battle royale is
  explicitly **out of scope**.

---

## Robot-playtest metrics

The bot-vs-bot Vitest spec is the regression gate today. Planned
playtest metrics for procedural-arena rollouts:

- Average survival time.
- Deaths by own bomb vs by opponent bomb.
- Time to first power-up.
- Number of chain reactions per round.
- Bot stuck-frame ratio.
- Map solvability across N seeds.
- (multiplayer) Server/client divergence count.
- (multiplayer) Snapshot bytes/sec per connected client.

---

## Open questions

These are flagged as undecided so the dev terminal doesn't accidentally
lock them by implementing one branch silently.

1. **Match vs persistent world** — at what MVP does Kaboom Crew stop
   auto-restarting forever and start framing a session as a 3-round
   match? Probably MVP-2, but the exact transition is undecided.
2. **Pickup persistence** — when a bomber dies, do their collected
   power-ups drop on the floor (Bomberman R) or vanish (classic)? The
   dropped-pickup model is more fun but doubles the spawn-rate
   tuning surface. Undecided pending MVP-2 playtest.
3. **Bot count in multiplayer** — when N humans are in the arena, do we
   fill remaining slots with bots up to a target N+M, or leave the
   arena human-only? Probably "fill to 4 total" for MVP-2, but the
   bot-count rule is undecided.
4. **Arena modifier rotation** — does the modifier change per round, per
   match, or per real-time hour? Undecided; will pick once at least one
   modifier ships.
~~5. **Procedural avatar scope** — primitive-shapes-only forever, or
   rigged GLB humanoids eventually?~~ **Closed 2026-05-20**: procedural
   mesh + procedural animation, no Mixamo / authored rigs. See
   `docs/game-design/characters-and-visual.md` and the "Characters →
   Planned (MVP-3+)" section above.

When one of these gets answered (in chat or in a sprint commit), move
the resolution into the matching section above and remove the question
from this list.
