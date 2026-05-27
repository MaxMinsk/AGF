# Kaboom Crew

A 15×11-cell bomb-em-up sample game built with AGF. Player vs bot,
fastest-blast-wins, restart auto-fires three seconds after the round
resolves. Codename **DynaBomber** during development; public name
**Kaboom Crew** picked in S082.

The game doubles as the flagship sample for the framework — every
gameplay feature you see lives in `examples/kaboom-crew/` and never
in `engine/`. The engine surface this project consumes (grid, scene
loading, particle emitter, HUD, audio bus, agent commands) is the
canonical set a downstream project would touch.

## Run

```bash
npm run dev
# then open
http://localhost:5173/?project=kaboom-crew
```

Optional query params:
- `?map=start|wide|corridor` — locks the arena layout. **Omit the
  param to get a RANDOM map per page load** (S140), stable across
  round restarts in the same match. Available arenas:

  | Map        | Grid  | Shape                                                      |
  |---         |---    |---                                                         |
  | start      | 15×11 | Default square arena with 4 corner pillars.                |
  | wide       | 17×13 | Wider square — more room to manoeuvre.                     |
  | corridor   | 17×7  | Long narrow corridor with maze pillars.                    |
  | plaza      | 13×11 | Sparse open lanes — rewards Fire-Up + Pierce blast chains. |
  | cross      | 17×17 | + shaped hard-wall divider; 4 quadrants meet at centre.    |
  | pit        | 11×11 | Hard-block ring around a 9×9 interior; dense engagements.  |
  | belt-zone  | 15×11 | First hazard arena (S146): 5-cell `+X` conveyor across the middle + a 4-cell U-loop carousel in the corner. Belts push bombers + bombs every 400ms. |
  | warpfield  | 15×11 | Second hazard arena (S149): 3 warp pairs (cyan / magenta / lime) teleport bombers + bombs across the map. 300 ms cooldown per pair prevents ping-pong. |
  | plate-puzzle | 15×11 | Third hazard arena (S151): 4 yellow pressure plates around a centre cell. Stepping on a plate spawns a fresh bomb at the centre (2 s cooldown per plate, 1.5 s fuse). |

- `?difficulty=easy` (default `normal`; also `hard`) — picks the bot
  preset applied to `bot.1` on first boot + every round restart.
- `?botPersonality=hunter|coward|miner` — historical single-bot
  personality override. **S141 changed the solo default: every match
  now spawns THREE bots, one of each personality**, so the player
  faces the full palette + AI mix every round. The match resolves
  battle-royale style: last bomber standing wins (player → tally
  player++, any bot → tally bot++). The URL param is preserved for
  future per-bot overrides. Each personality has a distinct palette +
  accessory so you can read which one you're facing at a glance:

  | Personality | Palette  | Accessory  | AI behaviour                        |
  |---          |---       |---         |---                                  |
  | hunter      | `ember`  | `antennae` | Aggressive — chases the player.     |
  | coward      | `slate`  | `visor`    | Defensive — bias toward flee.       |
  | miner       | `sand`   | `cap`      | Works the soft-blocks for power-ups.|

### Power-ups

Pickups drop from destroyed soft blocks at ~30 % chance per block.
S148: HUD shows the local player's power-ups as a bottom-left icon
grid (row 1 = numeric bomb / fire / speed counts; row 2 = binary
kick / remote / shield / pierce / throw-glove unlocks, full-colour
when active, grey when locked). Every pickup triggers a centre-
screen tooltip with a 96 px icon + label (`KICK`, `FIRE UP`, `PIERCE`,
…) that fades after ~1.5 s — teaches the icon→effect mapping on
every collect.

| Kind             | Effect                                                                 |
|---               |---                                                                     |
| `bomb-up`        | +1 `maxBombs` (cap 8).                                                 |
| `fire-up`        | +1 blast `range` (cap 8).                                              |
| `speed-up`       | +1 GridMover speed step (cap ~6 cells/sec).                            |
| `kick` (S100)    | Walking into your own bomb kicks it one cell forward.                  |
| `remote-detonate` (S100) | Next bomb is paused (fuseRemaining=∞); press F to detonate. Capped at 3 charges. |
| `shield` (S109)  | One-shot absorbs the next lethal blast; shield flips off.              |
| `pierce` (S142)  | Next placed bomb's blast walks through the **first** soft block in each direction (still destroys it). Second soft block in the same direction stops the lane normally. Carried at placement time. |
| `throw-glove` (S144) | Press **T** while standing on your own bomb to pick it up (fuse pauses). Press **T** again to throw the bomb 3 cells in your facing direction in an arc over obstacles (graceful fallback to ×2 / ×1 / your cell when blocked). Fuse resumes on landing. |
| `bomb-pass` (S152) | Walk back through your OWN placed bombs (after stepping off). Other bombers' bombs still block you. Movement-only — does NOT grant blast immunity. Pairs with the S152 classic-Bomberman baseline: bombs are now solid for bombers (own bomb after step-off; others' bombs always). |

## Controls

| Key            | Action                                                  |
|---             |---                                                      |
| W / A / S / D  | Move player.1 (also arrow keys).                        |
| Space          | Place a bomb on the current cell. First Space dismisses |
|                | the title screen.                                       |
| F              | Detonate paused (remote-detonate) bombs.                |
| T              | Throw-glove (S144): pick up your bomb / throw it.       |
| R              | Restart the round immediately.                          |

The round auto-restarts three seconds after `RoundState.phase`
leaves `playing`. The HUD center banner reads `YOU WIN — restart in
3 s (R)` (or `YOU LOST` / `DRAW`).

## Round flow

1. Boot loads `scenes/start.scene.json` against the static prefab
   registry (`prefabs/{player,bot,soft-block,hard-block,bomb}.json`)
   and mounts the title-screen overlay.
2. The `kaboom.game-state` singleton carries `GamePaused` — bot AI /
   bomb fuse / bomb placement skip while the marker is on.
3. Player presses Space → marker is removed → gameplay begins.
4. Player + bot move on the grid; Space drops a bomb (cap of
   `BomberStats.maxBombs`, no stacking on the same cell).
5. Each bomb fuses for 2.5 s then emits a `BlastEvent`. The blast
   walks four cardinals up to `BomberStats.range`, stopping at the
   first cell that blocks blast (hard wall), destroying soft blocks
   along the way, chaining other bombs in the radius, and killing
   bombers it sweeps over.
6. Destroyed soft blocks roll a deterministic-by-cell RNG and
   sometimes drop a power-up (`bomb-up` / `fire-up` / `speed-up`).
7. When ≤ 1 bomber is alive, `RoundResolveSystem` flips the phase
   and bumps the persistent `tally` (W / L / D).
8. Three seconds later, `restartScene` re-applies the start scene,
   re-seeds `RoundState` with `roundNumber + 1` and the same tally,
   and re-applies the difficulty preset to `bot.1`.

## HUD

| Slot         | Widget                                                |
|---           |---                                                    |
| Bottom-left  | `Round N   W:A L:B D:C` + phase/timer + per-bomber    |
|              | `bombs A/B fire C` lines (✗ marker on dead) + the     |
|              | S148 power-up icon grid for the local player + the    |
|              | S150 opponent-badges strip (one compact row per alive |
|              | non-self bomber with any active shield / pierce /     |
|              | remote / throw-glove state; quiet otherwise).         |
| Bottom-right | Canvas2D minimap — triangle markers for bombers,      |
|              | dark dots for live bombs, coloured rects for pickups. |
| Centre       | Title-screen overlay before first round; win/loss     |
|              | banner once the round resolves; the S148 pickup       |
|              | tooltip (96 px icon + label) for ~1.5 s after each    |
|              | local pickup-collect.                                 |

## Player profile (S153)

The project keeps a persistent player profile in `localStorage` under
`kaboom.player.profile.v1`. It holds:

- A stable `playerId` (generated once on first load, persists across
  page refreshes + browser restarts).
- `createdAt` + `lastSeenAt` timestamps.
- Lifetime stats: matchesPlayed/Won, roundsPlayed/Won/Lost/Draw,
  deathsByOwnBomb, chainReactionsTriggered + maxChainLength,
  pickupsCollected per-kind counter.

**Privacy stance**: localStorage is per-origin per-browser. Nothing
leaves the user's machine — no analytics, no server transmission. The
user can clear it any time via browser tools.

Agent probes on `window.__agf.kaboom`:

- `getProfile()` — returns the live profile.
- `setProfileStats(partial)` — overrides stat values (QA / fixture
  use).
- `resetProfile()` — clears localStorage + starts fresh.

S155 wired the deferred stat hooks:

- **deathsByOwnBomb** ticks when the local player's `alive` flips to
  false AND a player.1-owned bomb just disappeared (tight attribution
  — chained-from-bot-bomb deaths don't count).
- **chainReactionsTriggered + maxChainLength** tick whenever ≥ 2
  bombs detonate in the same frame.

URL `?showLifetime=true` mounts a small lifetime-stats panel in the
bottom-left HUD (matches W/M, rounds W/L/D, self-kills, max chain).
Default off so the HUD stays clean for new players.

### Cosmetic unlocks (S156)

Five starter unlocks are tied to lifetime stat thresholds. Each
unlock adds one accessory to player.1's recipe pool. A gold centre
banner appears for ~2.5 s on each unlock crossing.

| Id | Accessory | Condition |
|---|---|---|
| `first-win` | cap | First match win |
| `survivalist` | fins | Win 10 rounds |
| `chain-reactionist` | antennae | Trigger a 5-bomb chain reaction |
| `pyromaniac` | visor | Kill yourself with your own bomb 5 times |
| `veteran` | backpack | Play 50 rounds |

Profile schema bumped to v2 with in-place v1 → v2 migration
(`cosmeticUnlocks` initialised empty; lifetime stats preserved).

Agent probes:

- `getUnlocks()` — returns `{ earned: [...], catalog: [...] }` with
  per-unlock progress + locked / unlocked state.
- `forceUnlock(id)` — test-only; adds an unlock id.
- `resetUnlocks()` — test-only; drops all unlocks.

## Agent surface

The project exposes a small control surface on
`window.__agf.kaboom` (also `runtime.kaboom` for non-DOM consumers).
A probe can drive the game from one curl/call without simulating
keyboard events.

```js
// Walk an entity to a cell. Returns Promise<GotoResult> with:
//   outcome: 'arrived' | 'unreachable' | 'stuck' | 'timeout'
await window.__agf.kaboom.gotoCell('player.1', 5, 1, { timeoutMs: 10_000 });

// Place a bomb on the entity's current cell.
window.__agf.kaboom.placeBomb('player.1');

// Compact JSON of round + players + bombs + pickups + tiles.
window.__agf.kaboom.status();

// World-space (x, z) of an entity — sampled by the motion-smoothness probe.
window.__agf.kaboom.worldXZ('player.1');

// Mirror of every audio event triggered since attach.
window.__agf.kaboom.audioLog();

// Force-restart the round.
window.__agf.kaboom.restart();
```

`gotoCell` runs the engine BFS through `GridOccupancy`, so it
handles arena traversal around walls + soft blocks.
`outcome: 'unreachable'` fires immediately when the target is
blocked or out of bounds (no need to wait for a timeout).

## File map

```
examples/kaboom-crew/
├── README.md                          ← you are here
├── bootstrap.ts                       ← project bootstrap (system registration + attachUi + restart)
├── project.json                       ← AGF project manifest
├── assets/                            ← runtime assets (audio clips, …)
├── generators/
│   └── kaboom-arena-small.gen.mjs     ← `engine generate` arena template
├── prefabs/                           ← player / bot / soft-block / hard-block / bomb
├── recordings/                        ← deterministic regression recordings
├── scenes/start.scene.json            ← start-of-round layout
├── schemas/scene-extensions.schema.json  ← project-local component types
├── src/
│   ├── difficulty.ts                  ← preset table + URL parser
│   └── systems/
│       ├── player-input-system.ts
│       ├── bot-ai-system.ts
│       ├── bomb-placement-system.ts
│       ├── bomb-fuse-system.ts
│       ├── blast-propagation-system.ts
│       ├── blast-tile-lifetime-system.ts
│       ├── pickup-spawn-system.ts
│       ├── pickup-collect-system.ts
│       ├── round-resolve-system.ts
│       ├── agent-goto-system.ts
│       └── audio-binding-system.ts
└── tests/unit/                        ← Vitest specs per system + bot-vs-bot playtest
```

## Determinism + tests

Every system is unit-tested under `tests/unit/`. The
`bot-vs-bot.test.ts` Vitest integration spec boots the start scene,
swaps `player.1` for a second `BotBrain`, and runs 60 simulated
seconds of fixedUpdate ticks against the full Kaboom Crew stack —
the round must resolve within budget. Treat that test as the
regression gate for any AI / blast / fuse / pickup / round-resolve
change.

A 30-second deterministic recording fixture lives in
`recordings/demo-30s.recording.json` (regenerated whenever the
deterministic surface changes).

## Multiplayer (S109 — connect-and-spectate kickoff)

The Kaboom Crew project profile now supports `connected`. In this mode
two browser tabs can share an arena — each tab keeps its own gameplay
(bombs / blasts / pickups / round state are per-tab) but the local
bomber's position is mirrored over the wire so the OTHER tab sees a
remote bomber walking around. Foundation only; server-authoritative
gameplay is GDP-009's stretch goal, owned by a later sprint.

### Launching multiplayer locally

1. Start the Node reference world server:

   ```bash
   cd examples/backends/node-world-server
   npm install   # first time only
   npm run dev
   # listens on ws://localhost:8787 by default
   ```

2. Open Kaboom Crew in TWO browser tabs with different player ids:

   ```
   http://localhost:5173/?project=kaboom-crew&networked=1&server=ws://localhost:8787&playerId=alice
   http://localhost:5173/?project=kaboom-crew&networked=1&server=ws://localhost:8787&playerId=bob
   ```

3. Each tab shows its own bomber + bot. WASD in either tab moves the
   local bomber; the OTHER tab sees a remote bomber walking around
   (rendered with a `seed=remote.<playerId>` recipe so it's visually
   distinct).

`docs/research/kaboom-multiplayer-plan.md` documents the design
tradeoffs + the punch-list of follow-ups (recipe sync over the wire,
server-side bomb authority, lobby, etc.) deferred out of S109.

## Roadmap status

| Epic                       | Status                                                       |
|---                         |---                                                           |
| KABOOM-CREW-MVP-0          | done (S82)                                                   |
| KABOOM-CREW-MVP-1          | active (S84 — audio + particles + score + title + difficulty) |
| KABOOM-CREW-MVP-2          | planned                                                      |
| KABOOM-CREW-MVP-NETWORK    | active (S109 — connect-and-spectate kickoff)                 |
