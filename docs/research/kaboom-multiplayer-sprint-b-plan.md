# Kaboom Crew multiplayer — Sprint B migration plan

**Spike output for `RESEARCH-MP-SPRINT-B-MIGRATION-001` (S116).**
**Owner:** dev terminal. **Status:** draft 2026-05-23.
**Outcome:** architecture + sequencing for `FEAT-MULTIPLAYER-SPRINT-B-SER-001` (GDP-2026-05-22-011, MUST).
**Companion:** extends `docs/research/kaboom-multiplayer-plan.md` (the Sprint A spike that shipped in S109).

GDP-011 lists 67 acceptance hints across 7 systems. This spike breaks
the work into 4 sprint-sized chunks, locks down the protocol contract,
and decides the high-cost architectural questions BEFORE any system
code lands.

---

## 1. What we have today (post S109 + S112 + S114)

| Layer | Status |
|---|---|
| Server: `node-world-server` | Tracks one entity per connected player. Owns Transform-only position. Integrates `intent.move` at fixed `PLAYER_SPEED`. |
| Server: snapshot emission | 30 Hz tick, all snapshot data is `Transform + Presence + Networked + CharacterRecipe`. |
| Client: kaboom-crew gameplay | Fully local. Bombs, blasts, pickups, round-resolve, bot AI all per-tab. |
| Client: remote-bomber-decorator | Spawns the 19-entity procbomber tree for every `Presence`-tagged entity that isn't the local player. Reads `CharacterRecipe` for the right visual identity. |
| Client: remote-bomber-interpolator | Smooths remote `Transform.position` across snapshot ticks. |
| Tests | `tests/e2e/kaboom-multiplayer-roundtrip.spec.ts` — 2 chromium tabs see each other's position move. |

**What's still missing for the "modern network game" headline:**

- Tab A's bomb doesn't appear in Tab B's arena (each tab runs its own
  `bomb-fuse-system`).
- Tab A's blast doesn't kill Tab B's bomber (each tab runs its own
  `blast-propagation-system`).
- Tab A's pickup doesn't show up in Tab B (each tab runs its own
  `pickup-spawn-system`).
- Round resolution is per-tab (different tabs can show different
  scores).
- Bots are per-tab (each tab has its own bot.1 in a different
  position).

---

## 2. The architectural question: where does the Kaboom rules module live?

This is the largest decision. Three options:

### Option A: Kaboom rules ship as a server-only module under `examples/backends/node-world-server`

- Pros: easiest setup; server owns its own kaboom-crew code path.
- Cons: kaboom logic duplicated between client (which still does local
  prediction) and server. Drift risk.

### Option B: Kaboom rules extracted into a shared package importable by both client + server

- Pros: single source of truth for the deterministic systems (bomb
  fuse math, blast walk, RNG seeding, bot AI). Trivial to keep
  client + server in sync.
- Cons: requires a new `examples/kaboom-crew-rules/` package, monorepo
  plumbing.

### Option C: Server imports from `examples/kaboom-crew/src/systems/*` directly

- Pros: zero new package boundary; existing client systems become
  isomorphic.
- Cons: client systems today have DOM + Three.js touchpoints (e.g.
  `bomb-placement-system` reads runtime callbacks). Would need to
  scrub those for node compat.

**Recommendation: Option B — extract a `kaboom-crew-rules` shared
sub-package.** The migration becomes "move pure-ECS system files out
of `examples/kaboom-crew/src/systems/` into the shared module; both
client and server import from there." Concrete sub-tasks:

1. Audit each migration-target system for non-ECS dependencies
   (DOM, Three.js, runtime callbacks). Most are pure ECS — the few
   that touch the renderer (e.g. `pickup-collect-system` spawns a
   particle FX entity) need their renderer-side bit split out into a
   client-only decorator that reads the new `pickupCollected` event.
2. Create `examples/kaboom-crew-rules/` (or use the existing
   `examples/kaboom-crew/src/rules/`) as the shared home.
3. Update tsconfig path mapping so both the kaboom-crew Vite build
   AND the node-world-server tsx entry can import from it.

This is a moderate refactor but the cleanest long-term shape.

---

## 3. System migration order (the per-sprint breakdown)

Migrate in dependency order. Each sub-sprint can ship + verify before
the next starts.

### S117 (foundation): protocol + bomb placement + bomb fuse

- Schema: 9 new message kinds (covered by FEAT-MP-PROTOCOL-EXTENSIONS-001
  in S116 — schema only; no logic).
- Server: extract `bomb-placement-system` + `bomb-fuse-system` into
  the shared rules module; server adds them to its tick loop. Server
  reacts to `placeBombRequest` from clients, ticks fuses, emits
  `blastEvent` (no propagation yet — just the event marker).
- Client: in the `connected` profile, disable the local `bomb-placement`
  + `bomb-fuse` system registrations. Bombs appear in the snapshot
  stream as new entities; existing bomb VFX (the wiggle scale +
  audio) decoders fire from them.
- Acceptance: tab A presses Space → tab B sees the bomb spawn within
  200 ms; fuse ticks visible across tabs.

### S118: blast propagation + block destruction

- Server: port `blast-propagation-system`. Walks the blast on the
  authoritative ECS world, spawns BlastTile entities, flips
  `BomberStats.alive=false` on hit (after `BomberStats.shield`
  consumption check). Destroys soft blocks; emits `blockDestroyed`.
- Client: disable local `blast-propagation`. Existing
  `death-animation-system` + `hit-recoil-system` decoders fire from
  `bomberDied` / `shieldConsumed` snapshot events.
- Acceptance: tab A's bomb chains into tab B's cell → tab B sees the
  ragdoll launch with the correct blast-origin vector + the killer's
  recipe (already shipped in S112).

### S119: pickup spawn + collect + round resolve

- Server: port `pickup-spawn-system` (deterministic RNG seeded by
  worldSeed + cell), `pickup-collect-system`, `round-resolve-system`.
  Emits `pickupCollected`, `roundResolved`.
- Client: disable locals. HUD + audio decoders consume the events.
- Acceptance: tab A walks over a pickup → tab B sees it disappear +
  Tab A's BomberStats.maxBombs += 1; round resolves on both tabs
  simultaneously with the same tally.

### S120: bot AI + final cleanup

- Server: port `bot-AI-system`. Empty player slots auto-filled by
  bots. Bot decisions deterministic per world seed.
- Server: existing `bot-vs-bot` Vitest regression test ports to the
  server side — runs the same 60-second simulation against the
  server's ECS world.
- Client: disable local bot-AI. The `bot.1` entity now comes from
  snapshots like a remote player.
- Acceptance: connecting a single tab still produces a playable
  bot-filled match (bot.1 + bot.2 server-owned); two-tab session
  shares the same arena state.

---

## 4. Protocol contract (locked down in S116)

`schemas/protocol.schema.json` gains 9 new message kinds. Listed here
so FEAT-MP-PROTOCOL-EXTENSIONS-001 in S116 has a single-source
reference.

### Client → server

| Kind | Payload | When sent |
|---|---|---|
| `placeBombRequest` | `{ entityId, gx, gz }` | On Space press (or probe `place-bomb` action) |
| `detonateRemoteRequest` | `{ entityId }` | On F press (or probe `remote-detonate`) when bomber holds Remote power-up + has paused bombs |
| `inputIntent` | `{ entityId, dx, dz, tick }` | Each fixed step, when bomber's queuedDirection changes (replaces / augments existing `intent.move`) |

### Server → client

| Kind | Payload | Purpose |
|---|---|---|
| `blastEvent` | `{ originGx, originGz, range, ownerId, cells: [{gx,gz}] }` | Fires once per detonation. Client uses for SFX + the camera shake + spawning local BlastTile fx (rendered with existing decorators). |
| `pickupCollected` | `{ entityId, kind, gx, gz, pickerId }` | Fires when server's pickup-collect applies a stat boost. Client uses for the spark particles + audio. |
| `bomberDied` | `{ entityId, blastOriginGx, blastOriginGz, killerId? }` | Triggers local death-animation-system. blastOrigin drives the ragdoll launch direction. |
| `shieldConsumed` | `{ entityId, blastOriginGx, blastOriginGz }` | Triggers local hit-recoil-system. Shield pop SFX. |
| `roundResolved` | `{ phase, winnerId?, tally, nextRoundAt }` | Drives the HUD banner + the auto-restart countdown. |
| `blockDestroyed` | `{ gx, gz, droppedPickupKind?: string }` | Drives the soft-block disappear animation + spawn-pickup VFX. |

Each payload is opaque JSON. The existing snapshot stream still
carries entity state; these events are SUPPLEMENTAL for client
decorations that need timing precision (the blast cells need to
spawn EXACTLY when the bomb hits zero, not when the next snapshot
arrives ~33 ms later).

---

## 5. Client prediction strategy

**Prediction enabled for:** local player movement only.

- Local player's `GridMover` updates apply immediately on key press
  (existing behaviour from S109).
- Server snapshot reconciles position:
  - If local grid position differs by ≤ 1 cell, smooth-interp toward
    server value over 200 ms.
  - If > 1 cell, snap (probably a desync after a long stall — server
    is authoritative).

**Prediction disabled for:**

- Bomb placement. Client sends `placeBombRequest`, waits for the
  server's `entity.create` in the snapshot. ~100-200 ms perceived
  latency on placement — acceptable for arcade pace.
- Pickup collection. Server detects + applies.
- Death. Client doesn't ragdoll until `bomberDied` arrives.
- Round resolution. Client doesn't show the banner until
  `roundResolved` arrives.

This split keeps the client responsive on movement (most-pressed input)
while keeping every gameplay-affecting decision server-authoritative.

---

## 6. Determinism + the bot-vs-bot regression

The existing `tests/unit/bot-vs-bot.test.ts` runs the full Kaboom
stack against an in-process world for 60 simulated seconds and asserts
the round resolves within budget. After Sprint B, this test moves
SERVER-SIDE: it instantiates `ServerWorld` + adds 2 bots, ticks for
60 seconds of simulated time, asserts the same outcome.

**Critical:** the server's RNG must be SEEDED per world. The same
worldSeed produces bit-identical bot decisions + pickup drops. The
bot-vs-bot test pins a known seed and expects the same winner.

Client-side visual interpolation may differ tab-to-tab. Per
`docs/game-design/gameplay-systems.md §12.1` (visual determinism not
binding), this is acceptable — only the authoritative ECS state needs
to be deterministic.

---

## 7. Profile + URL wiring

- `?profile=connected` → networked path (default for two-tab playtest).
- `?profile=static` → local single-player offline (unchanged from
  today; useful for dev iteration on the rules systems before
  pushing them over the wire).
- `?world=<id>` → which server world to join. Default `"test"`.

The existing `?server=` + `?playerId=` + `?recipe=` params stay.

---

## 8. Out of scope (explicit hard perimeter)

Anything below is **NOT** in Sprint B (S117-S120):

- **Drop-in / drop-out behaviour** — GDP-2026-05-22-012 (Sprint C).
  Mid-match joiners spectate-until-next-round; the 5-second reconnect
  grace; etc.
- **Lobby / matchmaking / room codes.** Two tabs share the URL.
- **Server-side anti-cheat** beyond schema validation. Trust every
  client; sanitise + bound input.
- **Voice / text chat.**
- **Persistent worlds across server restarts.** Each restart wipes.
- **Mobile / cross-platform.** Browser-only.
- **Player-count cap** beyond a reasonable default (say 8).

Anything in this list that becomes important: open a NEW story in a
future sprint. Don't quietly grow Sprint B.

---

## 9. Risks + open questions

1. **Server-side ECS bootstrap.** The engine ECS lives under
   `engine/core/ecs/`. Today it's only used in the browser via Vite.
   Does it run cleanly under tsx + node? Three.js + DOM-free systems
   should — but the SCENE.LOAD path may import Three.js indirectly.
   **Mitigation:** in S117, the first sprint cuts a minimal
   server-side `World` instance + verifies the protocol echo before
   wiring in any kaboom systems. Cheap to discover here.
2. **Existing kaboom systems' DOM / renderer touchpoints.** Several
   systems (`audio-binding-system`, `pickup-spawn-system`'s particle
   emitter spawn) write entities that the renderer consumes. The
   migration must split each system into a SERVER half (rules) + a
   CLIENT half (decorator from event stream). Audit needed during
   S117.
3. **Snapshot bandwidth.** With bombs + blast tiles + pickups all
   server-owned, the snapshot grows. Need to measure under a busy
   arena. **Mitigation:** delta encoding (only entities that changed
   between ticks) — a known bandwidth optimisation if needed, but
   first measurement should happen before any optimisation.
4. **Bot AI determinism across server restarts.** Bot decisions today
   use Math.random in places. Need to swap to seeded streams. Audit
   in S120.
5. **Client prediction reconciliation glitches.** If the server's
   `intent.move` integration produces slightly different positions
   than the client's `grid-movement-system`, the smooth-interp will
   ping-pong. **Mitigation:** verify both sides use the same
   `PLAYER_SPEED`; widen the snap threshold if needed.

---

## 10. Verification for this spike

This spike is verified by:

- ✅ This document exists; covers architecture, system ordering,
  protocol contract, prediction strategy, determinism, profile
  wiring, out-of-scope, risks.
- ✅ Recommendation locks: Option B (shared rules module).
- ✅ Per-sprint scope (S117 / S118 / S119 / S120) is concrete enough
  to claim the next 4 sprints.
- ✅ 9 protocol message kinds enumerated with exact payload shapes.
- ✅ Out-of-scope perimeter explicit.
- ✅ 5 named risks with mitigation hints.

The companion story `FEAT-MP-PROTOCOL-EXTENSIONS-001` in S116 turns
the §4 protocol table into actual JSON schema entries + unit tests.
