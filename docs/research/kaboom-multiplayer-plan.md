# Kaboom Crew multiplayer — connect-and-spectate plan

**Spike output for `RESEARCH-MULTIPLAYER-CONNECT-SPECTATE-001` (S109).**
**Owner:** dev terminal. **Status:** draft 2026-05-22.
**Outcome:** punch-list + sequencing for `FEAT-MULTIPLAYER-FOUNDATION-T-001`.

GDP-009 (re-promote of GDP-2026-05-20-007) is the only MUST proposal in
S109. It also has the largest implementation surface in the sprint. This
spike inventories what AGF networking already gives us, decides what to
reuse vs build, and pins down the smallest shippable slice — two browser
tabs see each other's bombers move — so the feature story opens with
its design pre-locked.

---

## 1. What the AGF networking stack already provides

### Server: `examples/backends/node-world-server` (425 LOC)

- `ServerWorld` (`src/world.ts`, 131 LOC) — authoritative per-player
  Transform-only entity. Applies `intent.move` direction integrated at
  `PLAYER_SPEED = 3.5` units/sec. Emits `world.snapshot` each tick. Has
  `expiredPlayers()` for timeout sweeps + `playerCount()`.
- `transport-ws.ts` (178 LOC) — WebSocket transport. Multiple clients,
  one-room. Already handles validation, ping/pong, broadcast.
- `index.ts` (116 LOC) — main entry. Spawns the world, drives the tick
  loop, owns the transport.

### Protocol: `schemas/protocol.schema.json`

Discriminated union of 4 message kinds:

| Kind | Direction | Payload |
|---|---|---|
| `player.join` | C→S | `playerId`, optional `displayName` |
| `player.leave` | bidir | `playerId`, optional `reason` |
| `intent.move` | C→S | `playerId`, `direction: [number, number]` (a unit-ish vec2) |
| `world.snapshot` | S→C | `entities[]` with `id` + `components: { Transform, Presence, Networked, ... }`, plus `lastAcked` per-player + server's `playerSpeed` |

`world.snapshot.payload.entities[].components` is **untyped** in the
schema (`additionalProperties: true`). Servers and clients are free to
sync any component they want — the schema only locks down the envelope.

### Client adapter: `engine/runtime/network/ws-network-adapter.ts` (522 LOC)

- `startWsNetworkAdapter({ url, playerId, applyCommands, ... })` opens
  the socket, sends `player.join`, and applies every inbound
  `world.snapshot` as ECS commands (`entity.create` / `component.set` /
  `entity.delete`) against the local world.
- Outbound: `sendIntent([dx, dz])` posts `intent.move`. Auto-stamps a
  monotonic `sequence`.
- Rollback-replay state: `lastAckedFor(playerId)`, `highestOutboundSequence()`,
  `getUnackedIntents()`. Beacon World uses these to drive its drone
  reconciliation system.
- Snapshot interpolation: `getSnapshotBuffer()` returns the recent
  positions per server-owned entity for the remote-presence
  interpolator.
- Reconnect with exponential backoff; protocol validation against the
  schema is on by default.

### Wiring in `src/app.ts`

`createAppRuntime({ networked: true, serverUrl: "ws://..." })`:

- Picks profile `connected` if the project supports it (so connected-only
  systems light up via `scheduler.register(..., { profiles: ["connected"] })`).
- Generates a random `playerId` unless one is passed.
- Registers the engine player-input-system in its `onIntent`-forwarding
  mode (so keys also drive `sendIntent`).
- Spins up the adapter, returns the handle on `runtime.network`.

### Beacon World's reference systems (for pattern reference)

`examples/beacon-world/bootstrap.ts` registers three connected-profile
systems on top of the local ones:

| System | What it does |
|---|---|
| `network-drone-sync-system` | Local drone reconciles its position with the server's lastAcked. Replays un-acked intents from the rollback buffer. |
| `remote-presence-decorator-system` | Spawns mesh + material on every `player.<id>` entity that isn't the local player. |
| `remote-presence-interpolator-system` | Smooths the per-frame Transform of remote players from the snapshot history. |

These are project-local (live under `examples/beacon-world/src/systems/`)
and tied to Beacon's drone visual / hazards / pickups. **Kaboom Crew
needs its own variants** — same skeleton, different visuals + grid
semantics.

---

## 2. The minimum shippable slice (connect-and-spectate)

**Goal:** two browser tabs, opened with different `?playerId=` query
params, connect to the same Node ref server and see each other's
bombers move in the arena. **No** shared bombs, **no** shared blasts,
**no** shared pickups, **no** server-side grid simulation. Each tab
plays its OWN local Kaboom round; the only thing that travels over the
wire is the local bomber's intent.move + the rendered position of
remote bombers.

### Why this scope

- Server already integrates `intent.move` at a fixed PLAYER_SPEED.
  That's a continuous-position model; Kaboom's grid-movement is cell-snapped.
  The server's `Transform.position` for the local player will diverge
  from the kaboom client's (cell-lerped) by up to ~half a cell. **For
  spectate-only that's fine** — the remote client sees the trajectory
  roughly right, and the visible bomber on each tab is the LOCAL
  authority anyway.
- Bombs / blasts / pickups all have grid-authoritative deterministic
  systems. To sync them, the server would need to run the full Kaboom
  simulation OR the clients would need a custom protocol message
  carrying bomb/blast events. Both are S110+ work, **not** in S109.
- Connect-and-spectate is enough to validate that the multiplayer
  pipeline boots, that two clients see each other, that joins / leaves
  work, and that the recipe can travel over the wire (the bomber on
  the OTHER tab needs to be visually distinct from the local one).

### Open question — recipe sync

Two options for "what does the remote bomber look like?":

**Option A — Default recipe.** Every remote bomber renders from a
fixed `seed=remote.<playerId>` recipe. The local client tells the
server who it is via `player.join.displayName`; the server echoes it
to other clients via the snapshot's `Presence` component; each client
resolves the recipe locally from the player id. Pure client-side
determinism. Zero protocol changes.

**Option B — Recipe in the snapshot.** Each `player.<id>` entity in
the snapshot carries a `CharacterRecipe` component (encoded as JSON).
The receiving client decodes + applies. Tighter visual matching but
adds a non-trivial blob to every snapshot.

**Recommendation for the foundation kickoff:** **Option A**. Pure
seed-from-id derivation. Two tabs with `?playerId=alice` and
`?playerId=bob` produce visually different bombers from the same
deterministic resolver. Option B can land later when we wire the
`?recipe=` query param into a custom hello message.

---

## 3. Punch-list for `FEAT-MULTIPLAYER-FOUNDATION-T-001`

The minimum to ship connect-and-spectate:

1. **Kaboom-crew project profile gains `connected`.**
   - `examples/kaboom-crew/project.json`: add `connected` to `profiles`.
   - Verify `engine:check` still passes.

2. **Bootstrap `registerSystems` learns the networked branch.**
   - Mirror beacon-world's shape: when `networked === true`, register
     three new connected-profile systems (see #3, #4, #5 below). Every
     other system stays `profiles: ["static"]` (single-player only) OR
     gains `["static", "connected"]` if it works in both.
   - Static-only systems on a connected client: `KaboomRoundResolveSystem`
     (per-tab match), `KaboomBotAISystem` (bots don't need to be shared
     in the foundation), `pickup-spawn` (per-tab arena), etc.

3. **`createKaboomNetworkPlayerSyncSystem`** (NEW, profile `connected`).
   - Each frame: read the local PlayerControlled bomber's GridMover.
     If `queuedDirection != {0,0}` OR `currentLerp > 0`, derive a
     `[dx, dz]` and call `network.sendIntent([dx, dz])`. Otherwise
     `sendIntent([0, 0])` — server stops integration.
   - The engine player-input-system's `onIntent` callback is already
     wired by `src/app.ts` for the networked branch. We can REUSE
     that callback path (in which case this new system isn't strictly
     needed) OR replace it with a kaboom-specific one that reads from
     GridMover (cleaner mapping). **Decision:** start with the engine
     hook; replace later if drift gets noticeable.

4. **`createKaboomRemoteBomberDecoratorSystem`** (NEW, profile `connected`).
   - Modelled on `beacon-world/remote-presence-decorator-system`.
   - For every `player.<id>` entity that ISN'T the local player, spawn
     the full bomber tree (`spawnBomberFor` + procbomber-integration).
     Use `recipe = resolveRecipeFromSeed("remote." + playerId)` for
     visual distinction.
   - On entity-delete (player.leave), tear down the bomber tree.

5. **`createKaboomRemoteBomberInterpolatorSystem`** (NEW, profile `connected`).
   - Modelled on `beacon-world/remote-presence-interpolator-system`.
   - Reads `network.getSnapshotBuffer()` for each remote `player.<id>`.
     Per frame, lerps the bomber root's Transform.position between
     the two surrounding snapshot samples (typical 80-150 ms
     interpolation delay).
   - Remote bombers' limb animation / face direction stays driven by
     the existing local systems — they just observe the interpolated
     root Transform and let `bomber-face-movement-system` + the
     animation driver handle the rest.

6. **HUD / connectivity hint.**
   - Implement `renderConnectivityHint(...)` in the Kaboom-crew
     bootstrap, returning a small status string. Beacon World's
     pattern (line 155-161 of `examples/beacon-world/bootstrap.ts`)
     is the template.
   - Optionally add a "remote players: N" line to the stats HUD.

7. **Tests.**
   - Unit: `KaboomNetworkPlayerSyncSystem` posts the right intent
     when GridMover queuedDirection / currentLerp change.
   - Unit: `KaboomRemoteBomberDecoratorSystem` spawns + removes
     bomber trees on entity create/delete events.
   - Existing protocol-schema tests stay green.
   - Playwright: two-tab e2e exists in `tests/e2e/multiclient-roundtrip.spec.ts`
     for Beacon — pattern-copy for Kaboom (target: each tab spawns a
     bomber, walks 3 cells, the other tab sees the trajectory).

8. **Documentation.**
   - Add a section to `examples/kaboom-crew/README.md`: how to launch
     the Node ref server + the URL pattern for two tabs.
   - Reference: `examples/backends/node-world-server/README.md`
     already has launch instructions.

---

## 4. Sequencing within S109

Estimated story size for `FEAT-MULTIPLAYER-FOUNDATION-T-001` per the
punch-list: one sprint slot, similar in scope to the shield + texturing
stories shipped earlier this sprint. The order I'd build it in:

```
project.json profile flip     ─┐
                                ├─→ bootstrap networked branch ─→ decorator system
sync system (intent.move)     ─┘                                  ─→ interpolator system
                                                                   ─→ HUD hint
                                                                   ─→ tests
```

Parallelisable: the decorator + interpolator can be built in either
order after the bootstrap branch lights up; tests are bottom-up.

---

## 5. Explicit out-of-scope (for this spike AND for the foundation kickoff)

This is a hard perimeter. Anything below is **NOT** in S109:

- **Server-side Kaboom simulation.** Bombs / blasts / pickups stay
  per-tab. Connect-and-spectate ships first; server-authoritative
  gameplay is GDP-009's stretch goal, owned by a follow-up sprint.
- **Recipe sync over the wire (Option B above).** Seed-derived from
  player id only.
- **Match scoring across tabs.** Each tab has its own match. The
  shared world is purely visual.
- **Lobby / matchmaking / room codes.** Tabs use the same `?server=`
  URL.
- **Server-authoritative anti-cheat / validation of intent.** Trust
  every client. Anti-cheat is post-MVP.
- **Voice chat / text chat / emotes.**
- **Spectator-only mode** (no controllable bomber) — every connected
  client gets a local bomber.
- **Player-count cap / arena scaling.** Two tabs sufficient for the
  kickoff; more works but isn't required.
- **Reconnection state preservation.** Adapter has reconnect; on
  reconnect the client gets a fresh world view.
- **Persistence.** No save / load across server restarts.
- **Mobile / cross-platform.** Browser-only.

Anything in this list that becomes important: open a NEW story in a
future sprint. Don't quietly grow the S109 foundation.

---

## 6. Risks + open questions for the feature story

1. **Profile resolution edge case.** Several Kaboom systems may have
   `profiles: ["static"]` only and silently disappear on a connected
   profile. Audit the full `bootstrap.ts` system list during
   implementation; widen to `["static", "connected"]` where the
   semantics are profile-agnostic.
2. **Engine player-input-system + Kaboom player-input-system both run.**
   The S109 dead-bomber hotfix (`MotionOverride` / `GridMover` skip)
   already takes care of the position-drift case. But on the
   `connected` profile the engine system's `onIntent` callback IS the
   only path that calls `sendIntent`. Kaboom's input system writes
   `queuedDirection`. Both fire from the same key events. Verify the
   intent direction the server sees matches what the local bomber is
   actually doing — quantise to ±X/±Z at the sendIntent boundary.
3. **Remote bomber tree lifecycle vs `scene.load` wipes.** Each round
   restart calls `scene.load`, wiping every entity including the
   remote-bomber trees we spawned. The decorator system needs to
   re-spawn them from the next snapshot. Beacon's decorator handles
   this naturally because the snapshot stream re-creates the
   entities; verify ours does too.
4. **Bot AI in the connected profile.** Bots are local; each tab has
   its own bot. If both tabs spawn `bot.1` at the same cell, neither
   tab knows about the other's bot. **Decision for connect-and-spectate:**
   bots stay per-tab, invisible to each other. Document the WTF
   ("why does my opponent have an extra bomber?") in the README.
5. **Snapshot rate vs interpolation delay.** Server tick rate
   (current default in `node-world-server`: every 50 ms = 20 Hz) gives
   ~80-150 ms interp delay. Acceptable for fluid bomber walking, may
   feel laggy if we later sync bombs. Tune later.

---

## 7. Recommendation

Implement the 7-item punch-list above as `FEAT-MULTIPLAYER-FOUNDATION-T-001`.
Stick to Option A (seed-from-id recipe), Path A (per-tab gameplay +
shared positions only). Land the work in three commits matching the
punch-list groupings:

1. Profile flip + bootstrap branch + sync system.
2. Decorator + interpolator + remote-bomber spawn.
3. HUD hint + README + tests.

Estimated effort: comparable to S109 FEAT-SHIELD-POWER-UP-HIT-RECO-001
or FEAT-PROCEDURAL-TEXTURING-LAY-001 — one sprint slot, ~6-10 hours of
implementation + tests + tuning.

---

## 8. Verification for this spike

- ✅ Inventories the existing networking stack (server / protocol /
  client adapter / wiring / beacon-world reference).
- ✅ Defines the minimum shippable slice (connect-and-spectate).
- ✅ Lists the open recipe-sync question with a recommended option.
- ✅ Provides a concrete 7-item punch-list for the feature story.
- ✅ Sequences the work into three commit-sized chunks.
- ✅ Hard-perimeter out-of-scope list keeps S109 from quietly growing.
- ✅ Names five real risks with mitigation hints.
