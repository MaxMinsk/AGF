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
- `?difficulty=easy` (default `normal`; also `hard`) — picks the bot
  preset applied to `bot.1` on first boot + every round restart.

## Controls

| Key            | Action                                                  |
|---             |---                                                      |
| W / A / S / D  | Move player.1 (also arrow keys).                        |
| Space          | Place a bomb on the current cell. First Space dismisses |
|                | the title screen.                                       |
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
|              | `bombs A/B fire C` lines (✗ marker on dead).          |
| Bottom-right | Canvas2D minimap — triangle markers for bombers,      |
|              | dark dots for live bombs, coloured rects for pickups. |
| Centre       | Title-screen overlay before first round; win/loss     |
|              | banner once the round resolves; otherwise empty.      |

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

## Roadmap status

| Epic              | Status     |
|---                |---         |
| KABOOM-CREW-MVP-0 | done (S82) |
| KABOOM-CREW-MVP-1 | active (S84 — audio + particles + score + title + difficulty) |
| KABOOM-CREW-MVP-2 | planned    |
