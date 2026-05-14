---
title: Netcode rework — investigation
status: draft (Sprint 32 / M20-investigate)
owner: agent-first networking
related:
  - HIGH_LEVEL_BACKLOG.md M20
  - engine/runtime/network/ws-network-adapter.ts
  - examples/beacon-world/src/systems/network-drone-sync-system.ts
  - examples/backends/node-world-server/src/world.ts
  - schemas/protocol.schema.json
---

# Netcode rework — investigation

Sprint 32 / story `M20-investigate`. Investigation only — no code lands from this doc; it produces a recommendation + a sequenced implementation plan.

## 1. What broke (concrete repro)

Three observations from Sprint 32, all stem from the same architectural smell.

### 1.1 Own drone runs at 2× the server-broadcast position

Open two tabs against the Node backend (`http://localhost:5173/?project=beacon-world&server=ws://localhost:8787&networked=1&playerId=alpha` and `…&playerId=bravo`). Move `bravo` for ~0.6 server-seconds.

Pulled via `M15-multi-page` bridge:

```
curl 'http://localhost:5173/__agf/snapshot?playerId=bravo' > /tmp/bravo.json
curl 'http://localhost:5173/__agf/snapshot?playerId=alpha' > /tmp/alpha.json
```

| entity (in bravo's tab) | position |
|---|---|
| `player.bravo` (server view, `Networked.authority = server`) | `(-1.05, 0.4, 1.87)` |
| `player.drone` (local own drone) | `(-2.10, 0.4, 3.79)` |

The local drone is at **exactly 2×** the server's view of the same player. Confirmed across multiple captures.

### 1.2 30-second idle disconnect

```
[ws-adapter] connection closed
[ws-adapter] reconnecting in 250 ms (attempt 1)
[ws-adapter] connected to ws://localhost:8787 as alpha (attempt 14)
[ws-adapter] connection closed
…
```

Steady-state idle players get kicked every 30 s and reconnect, reset to spawn each time. Cause: `examples/backends/node-world-server/src/world.ts#setIntent` is the *only* place that refreshes `player.lastActivity`, so a player who isn't pressing keys looks idle to the server's expired-players sweep (default 30 s).

### 1.3 Networked controls don't feel like single-player

Single-player Beacon: WASD goes through `PlayerInputSystem` → directly writes `Transform.position`. Smooth, no reconciliation.

Networked Beacon: WASD goes through `PlayerInputSystem` → writes `Transform.position` locally **and** sends `intent.move`. Per frame, `network-drone-sync` *also* lerps `player.drone` toward `target = server.position + replay(unackedIntents)`. That lerp pushes the drone an extra step every frame, which both produces the 2× artifact above and adds a non-smooth tug to the motion.

## 2. Root cause

All three observations share one architectural smell:

> The local drone has **two writers** every frame:
> 1. `PlayerInputSystem.frameUpdate` mutates `Transform.position` from input.
> 2. `network-drone-sync.frameUpdate` lerps `Transform.position` toward `target = server + replay`.
>
> `replay` is *intended* to give "where would prediction put the drone now, given the server's last truth + any in-flight inputs". When unacked intents are empty, it returns the server position unchanged, drift = (local − server) = small prediction lag, and the lerp gently corrects.
>
> But the formula in `replayUnackedIntents` is:
>
> ```ts
> for (intent of unacked) {
>   dt = (next ? next.sentAtSeconds : now) - intent.sentAtSeconds;
>   x += direction * speed * dt;
> }
> ```
>
> For one-shot direction changes (hold W → one intent), `dt = now - sentAtSeconds` which equals the **full** time since pressing W. The server has *already* processed that intent for almost the same duration. So `target = server + replay ≈ server + (server - serverInitial) = 2 × server`. The reconcile lerp drags the drone toward `2 × server`, giving the exact-2× artifact in §1.1.

In other words: the server position **already contains** the integration of in-flight intents (the server applies intents on receipt, replies with the resulting position). Replaying them on top is double-counting.

There are ways to fix the formula (e.g. replay should run only from `serverElapsedAtSnapshot` forward, not from intent send-time). But the deeper issue is that AGF doesn't *need* full rollback-replay for the scale of game it is shipping. Time to step back and pick a simpler model.

## 3. Industry-standard netcode patterns

Concise overview, in roughly increasing complexity.

### A. Snapshot interpolation only (Quake 1, Quake 3, Halo dedicated clients)

- Client only sees the world via received snapshots.
- Render `~100 ms` behind the most recent snapshot so two samples always bracket the render time. Interpolate between them.
- Inputs are sent to server. Server runs the only simulation. Client renders the result.
- No client-side prediction. **Own player has visible input lag = RTT/2 + interp delay** (~100–150 ms in practice).
- Pros: ridiculously simple. One code path for own + remote. Easy to reason about. Cheats limited to input forgery.
- Cons: laggy controls. Bad for fast-paced or precision games.
- Fit for AGF: works for slow movement (Beacon's 3.5 m/s drone is mild), but breaks the "feels good" requirement.

### B. Client-side prediction + server reconciliation (Source/Valve, half of modern shooters)

- Client predicts own player's response to input *immediately* — no input lag.
- Client sends `intent.move` to server tagged with a sequence id.
- Server processes intents in order, broadcasts authoritative state + the last sequence each player got applied (`lastAcked`).
- On every snapshot, client *rolls back* its own state to the server's snapshot for itself, then *replays* every input after the acked sequence on top.
- If the replay result matches the local prediction, no visible correction. If not, lerp toward the corrected state.
- Remote players are still snapshot-interpolated.
- Pros: own input feels instant, server is authoritative, anti-cheat-friendly.
- Cons: complex to implement correctly (snapshot ordering, sequence numbers, replay determinism). **This is what AGF tried and got wrong.**
- Fit for AGF: real fit *if* we can get the rollback right. The current code is most of the way there but has the double-counting bug above.

### C. Lockstep / deterministic simulation (Age of Empires, StarCraft, many RTSs)

- All clients exchange only inputs. Each client runs the identical simulation step-by-step.
- No state is sent over the wire — the simulation is the truth.
- Pros: tiny bandwidth, naturally anti-cheat (everyone sees the same world), no rollback.
- Cons: any client dropping a frame stalls everyone (typically masked by 200–500 ms input delay). Demands strict determinism (no floating-point drift, no Math.random).
- Fit for AGF: poor — browsers don't guarantee determinism without heroic effort (FP precision varies across CPUs), and AGF wants async drop-in/drop-out, not a "wait for everyone" model.

### D. Rollback netcode (GGPO, fighting games)

- Hybrid of B and C: deterministic simulation, peer-to-peer, immediate local input, retroactively roll back when a remote input arrives.
- Pros: feels like local input even over WAN.
- Cons: needs perfect determinism + cheap re-simulation. Browser cost is high; not all gameplay rolls back well.
- Fit for AGF: overkill for Beacon's pace; demands determinism AGF doesn't have today.

### E. Client-authoritative own player (casual co-op, Among Us, many indie sandboxes)

- Client owns its own player completely. PlayerInputSystem writes `Transform.position` and the client sends position updates (`player.state`) to the server.
- Server is a relay + light validator (rejects moves faster than `speed * dt`, optionally snaps cheaters), broadcasts to other clients.
- Other clients see this player via interpolation, same as B.
- Pros: networked code path *is* the single-player code path for the local player. No reconciliation, no double-counting. Latency-free input by construction.
- Cons: trivial to cheat if you trust the client. Doesn't matter for co-op / a debug-scaffold game; matters a lot for competitive PvP.
- Fit for AGF: **strongly recommended for Beacon-class projects**. Beacon is a single-player-shaped co-op with up to a handful of friends. There is no anti-cheat requirement. Local feels exactly like solo; remote players interpolate exactly as today.

## 4. Mapping the options to AGF's constraints

AGF constraints (from CLAUDE.md + the M-list):

- **Browser-first runtime** — must work without WebAssembly determinism heroics.
- **Schema-driven protocol** — every message validated by Ajv against `schemas/protocol.schema.json`.
- **Agent-readable** — the data flow needs to be inspectable by an LLM via `engine inspect` / dev-bridge endpoints. Two writers on the same component is exactly the kind of state confusion an agent shouldn't have to untangle.
- **Backend-agnostic** — protocol owns the contract; the C# / Node / future backends each implement it.
- **Beacon-World shape** — small persistent shared world, drop-in/drop-out, up to a handful of players, casual co-op gameplay (no esports stakes).
- **HMR + recording** — every edit hot-reloads; the recorder (Sprint 28) captures every applied command; replays must work headless.

| Pattern | Latency feel | Implementation complexity | Anti-cheat | Determinism req. | Fit for AGF |
|---|---|---|---|---|---|
| A. Snapshot interp only | Bad (150 ms input lag) | **Trivial** | Strong | None | Maybe — only if we accept input lag |
| B. Client prediction + reconciliation | Good | **High** | Strong | Soft (replay must match) | What AGF tried; salvageable but fragile |
| C. Lockstep | Tolerable with input delay | Medium | Strong | **Strict** | Bad — browsers can't promise determinism easily |
| D. Rollback (GGPO) | Excellent | **Very high** | Strong | **Strict** | Overkill |
| **E. Client-authoritative own player** | **Excellent** | **Low** | None | None | **Best fit for Beacon-class projects** |

## 5. Recommendation

**Adopt Option E (client-authoritative own player) for Beacon and any other casual co-op AGF sample.** Treat the local drone exactly like a single-player drone; the network adapter just publishes its position upstream and renders remote players via the existing `RemotePresenceInterpolator`.

Reasons:
1. **Eliminates the bug class** in §2 by removing the second writer entirely. PlayerInputSystem is the *only* writer for the local drone; `network-drone-sync` goes away.
2. **Makes networked feel === single-player** — the local code path is literally the same.
3. **Trivial to implement** compared to fixing the rollback-replay correctly.
4. **No anti-cheat regression** for AGF's current samples — Beacon is co-op, not competitive PvP. We add a `network.authority = "client-owned"` Networked variant alongside the existing `server` authority for entities the server still owns (hazards, beacons, world signals).
5. Leaves the door open: when AGF eventually wants a competitive sample (e.g. a future arena shooter), we can layer **Option B done correctly** on top — the protocol and adapter shape are forward-compatible.

Reject:
- **A** — fails the "feels like single-player" bar.
- **B kept-as-is-with-fixes** — fragile; the bug came back; agent has to reason about two writers.
- **C / D** — wrong tool for browser + small-world drop-in shape.

## 6. What the rebuild looks like (sequenced)

Each line is one focused sprint story (sized for ~1 day of work). Stories enter `BACKLOG.md` as a sprint pulls them.

### 6.1 Protocol

- `M20-a` Add `player.state` message kind to `schemas/protocol.schema.json`: `{ playerId, position: vec3, rotation?: vec3, sequence }`. Client publishes its own drone state at ≤ 20 Hz (and on every significant change). Server schema validates with the same Ajv compile.
- `M20-b` Add `Networked.authority = "client-owned"` to the scene schema (alongside the existing `"server"`). Beacon's `player.drone` becomes `client-owned`.

### 6.2 Server changes

- `M20-c` `ServerWorld.applyPlayerState(playerId, state, sequence)` — accept the client's authoritative position, optionally clamp to `speed * dt` per step as a soft anti-cheat. Broadcast under the same `player.<id>` entity id as today.
- `M20-d` Drop the 30 s idle disconnect (or rebase it on socket activity, not `intent.move`). Even simpler: leave the player alive for as long as the socket is connected; a single client message of any kind keeps them alive.
- `M20-e` Reject a `player.join` from a second socket for an already-active playerId. Today the second socket silently displaces the first; this leads to the orphan-socket case behind some of the reconnect log spam.

### 6.3 Client changes

- `M20-f` `WsNetworkAdapter` gets `publishPlayerState({ position, rotation })` and a small rate limiter (~20 Hz). Drops the `intent.move` flow for own-drone movement entirely (keep `intent.*` for other actions like `intent.pickup` later).
- `M20-g` Delete `examples/beacon-world/src/systems/network-drone-sync-system.ts`. PlayerInputSystem in `networked` mode no longer sends `intent.move`; it just writes Transform locally and the adapter publishes the resulting state. Remove the `onIntent` callback path.
- `M20-h` Keep `RemotePresenceInterpolatorSystem` as-is for the OTHER players. They are still server-broadcast via `world.snapshot` and rendered with a render delay.

### 6.4 Tests + tooling

- `M20-i` `tests/e2e/multiclient-roundtrip.spec.ts` rewritten to assert: tab A moves its drone N units → tab B sees the same drone at N units (with the render delay accounted for). Currently this test passes because it asserts "both tabs see the same set of entities", not "same positions".
- `M20-j` Recorder + `engine replay` headless verification of the new flow — capture a 5 s networked session, replay, snapshot match.

### 6.5 Cleanup

- `M20-k` Remove `replayUnackedIntents`, `getUnackedIntents`, `lastAckedFor`, `highestOutboundSequence` from the adapter (and their callers). Keep `lastSnapshotSequence` for snapshot ordering.
- `M20-l` Update `docs/research/backend-multiplayer-best-practices.md` to document the chosen pattern and the rejected alternatives.

Total: **12 stories**, naturally split across 2 sprints (Sprint 33 ships the protocol + server slice + remove old systems; Sprint 34 ships tests + cleanup + docs).

## 7. Risks and open questions

- **No anti-cheat** — by design for now. When a competitive sample ships, add server-side speed clamps and physical-plausibility rules under a `network.policy = "client-authoritative-strict"` mode. Document the limitation loudly.
- **State payload growth** — publishing full transform per player at 20 Hz scales as `players × frequency × payload`. For 4 players at 20 Hz with `~50 bytes/player`, that's 4 KB/s upstream from each client. Trivially fine for AGF's target scale; document the budget.
- **Other entities still need replays** — e.g. hazard pulses and pickup respawns. Those remain server-authoritative; the protocol already supports it. M20 only changes own-player ownership.
- **Future competitive sample** — Option B (client prediction + reconciliation done correctly) layers on top. Schema's `Networked.authority` already declares which entity is server-owned vs client-owned, so the same protocol supports both modes.

## 8. Recommendation summary

1. **Adopt client-authoritative own-player (Option E) for Beacon and any co-op AGF sample.**
2. Delete `network-drone-sync-system.ts` and `replayUnackedIntents`; keep `RemotePresenceInterpolatorSystem`.
3. Server stops kicking on intent silence; tracks liveness via socket state.
4. New `player.state` message kind, validated by the existing protocol schema.
5. Implementation lands across `M20-a` through `M20-l`, sequenced for two sprints.

This unwinds two writers on the local drone, gives back single-player feel under networked mode, and removes the source of every multiplayer bug surfaced in Sprint 32.
