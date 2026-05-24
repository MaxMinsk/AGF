# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S118 — MP Sprint B chunk 2 — server-side blast propagation + block destruction + bomber death

Status: **active** (started 2026-05-24). Source: `backlog/sprints/S118.sprint.json`.

### Stories

- **FEAT-SERVER-MAP-LOAD-001** — Server loads start.scene.json → 2D obstacle grid _(implemented)_
  On boot, ServerWorld parses examples/kaboom-crew/scenes/start.scene.json and builds a 2D grid of cell types: 'empty' | 'hard-wall' | 'soft-block'. The map uses 15×11 cells (Grid component) with hard-block instances at fixed corners + soft-blocks at 4 dynamic cells. Exposed via ServerWorld.cellAt(gx, gz) and ServerWorld.gridSize(). For S118 we hard-code which scene to load (start.scene.json) — multi-map / dynamic scene selection lives in a later sprint. Soft-blocks are mutable: blast-propagation removes them via destroySoftBlock(gx, gz); cellAt() returns 'empty' afterward.
- **FEAT-SERVER-BOMBER-GRID-POSITION-001** — Server derives GridPosition for player.<id> each tick from Transform.position _(implemented)_
  Every server tick, for each joined player, round Transform.position [x, _, z] to integer (gx, gz) and write it to the GridPosition component on player.<id>. Snapshot emits the new GridPosition so clients (today's local + future server-driven death-anim) can use it. This is the lookup blast-propagation will use to decide whether a bomber is in a blast cell.
- **FEAT-SERVER-BLAST-CELLS-001** — Server computes blast cells in 4 cardinal directions; populates blastEvent.cells _(implemented)_
  On bomb detonation, walk +X / -X / +Z / -Z from the bomb's GridPosition. For each step (up to bomb.range): if cellAt is 'hard-wall', stop (DON'T include the wall cell). If 'soft-block', include the cell + stop (the blast hits the block, then halts). If 'empty', include the cell + continue. Origin cell is always included. The cells[] list ships in blastEvent.cells (S116 protocol). Pure math + cellAt lookups — no side-effects in this story; destruction lives in FEAT-SERVER-BLOCK-DESTROY-001.
- **FEAT-SERVER-BLOCK-DESTROY-001** — Server destroys soft-blocks hit by blast; emits blockDestroyed _(implemented)_
  After blast cells are computed, scan them for soft-block hits. Each hit: call ServerWorld.destroySoftBlock(gx, gz) (the grid mutation from FEAT-SERVER-MAP-LOAD-001) and emit a blockDestroyed protocol message (S116) per destroyed block. droppedPickupKind stays undefined in S118 (pickups in S119). Transport broadcasts blockDestroyed alongside the blastEvent frame. Client side: a new connected-profile decoder applies entity.delete for matching soft.* entities (the existing snapshot delete path doesn't fire because soft-blocks are CLIENT-only entities today).
- **FEAT-SERVER-BOMBER-DEATH-001** — Server flips BomberStats.alive=false when a bomber stands on a blast cell _(implemented)_
  Bombers carry a BomberStats component server-side (range=2, maxBombs=1, alive=true defaults). After blast cells are computed, scan each cell for a bomber with matching GridPosition. Each hit: set BomberStats.alive=false on the server world + emit bomberDied{entityId, blastOriginGx, blastOriginGz, killerId} (S116). Snapshot now ships BomberStats so clients see alive=false. Shield consumption (shieldConsumed event) is OUT of scope — shields are a pickup-derived stat, paired with S119. NO ragdoll spawn here either — the client-side death-animation-system is what handles that; on connected profile it reads BomberStats.alive instead of the local DeathAnim transient.
- **FEAT-SERVER-BOMB-CHAIN-001** — Server chain-detonates bombs caught in another blast _(implemented)_
  When a blast cell contains an existing Bomb entity, drop its fuseRemaining to 0 — so it detonates the same/next tick. Multi-level chains (bomb A → B → C) cascade because each detonation's blast cells are recomputed in the next sub-tick walk. To avoid infinite loops in pathological cases, cap chain depth per tick at 64 detonations.
- **FEAT-CLIENT-DISABLE-LOCAL-BLAST-001** — Client drops local blast-propagation on connected; decoder consumes inbound blastEvents _(implemented)_
  On the `connected` profile: drop blast-propagation-system + blast-tile-lifetime-system + the local soft-block-destroy effects. Add a new connected-blast-decoder system that drains the WS adapter's blastEvent inbox each frame and spawns the visual BlastTile entities + audio cues locally (the entities still need to exist for blast-tile-lifetime + camera-shake decorators to fire). Also drain blockDestroyed events and entity.delete the matching soft.* on connected. The static (single-player) profile keeps the existing local pipeline unchanged.
- **VERIFY-MP-BLAST-PROPAGATION-PLAYWRIGHT-001** — Playwright e2e: two tabs see same blast cells + destroyed soft block _(implemented)_
  Extend tests/e2e/kaboom-multiplayer-roundtrip.spec.ts: alpha walks adjacent to a soft block at (4, 5) → presses Space → both tabs see the soft.1 entity disappear from the snapshot within 5 s. Stretch goal: alpha places a bomb on bravo's cell → bravo's player entity BomberStats.alive flips to false on both tabs.

### Notes

- Second of 4 sprints implementing GDP-2026-05-22-011 (server-authoritative kaboom-crew). Sequencing per docs/research/kaboom-multiplayer-sprint-b-plan.md §3: S117 ✅ → S118 blast+blocks (this) → S119 pickup+round-resolve → S120 bot-AI.
- Scope expansion vs sprint-b-plan.md §3.S118: shield consumption + ragdoll/hit-recoil details are deferred to S119 (paired with pickups, since shield is a pickup-derived stat). S118 ships the bare-minimum kill chain: bomber on blast tile → BomberStats.alive=false → bomberDied broadcast.
- Acceptance for S118: tab A places a bomb adjacent to a soft block → both tabs see the block disappear on detonation. Tab A's bomb lands on tab B's cell → both tabs see B's alive flip to false in the snapshot.
- Server-side rules module strategy stays Option A (server-only) per S117 — porting blast-propagation logic into examples/backends/node-world-server/src/. A shared-module refactor stays an open question for S120 if duplication hurts.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
