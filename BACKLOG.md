# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S117 — MP Sprint B chunk 1 — server-side bomb-placement + bomb-fuse + BlastEvent emission

Status: **active** (started 2026-05-24). Source: `backlog/sprints/S117.sprint.json`.

### Stories

- **FEAT-SERVER-ECS-BOOTSTRAP-001** — Server-side ECS world + scheduler bootstrap in node-world-server _(implemented)_
  Stand up an engine ECS World + SystemScheduler instance inside node-world-server. Spike (sprint-b-plan.md §9 risk 1) already verified engine/core/ecs/World runs cleanly under tsx + node. This story makes the integration permanent: index.ts spins up a World per server world (start with single 'test' world), runs a fixed-step tick at 30 Hz via existing tick loop, exposes the world to transport-ws (currently uses the bespoke ServerWorld map). ServerWorld migration path: keep its surface (join/leave/setIntent/snapshot/tick) but back it with the engine ECS underneath — Transform component on player.<id> entity, server-tick System reads intent.move + integrates Transform.position. No kaboom systems yet; just the foundation.
- **FEAT-SERVER-PLACE-BOMB-001** — Server reacts to placeBombRequest by spawning Bomb entity on the authoritative world _(implemented)_
  Wire the new placeBombRequest protocol message (S116) into the server. Transport receives the message → calls world.placeBomb(playerId, gx, gz). Server-side kaboom-rules module (extracted bomb-placement-system from kaboom-crew) validates the request (BomberStats.maxBombs cap, not stacking on existing bomb) and spawns the Bomb entity on the server's ECS world. The Bomb appears in the next snapshot to all clients (existing snapshot path picks up any entity with components). Client's connected-profile registers bomb-placement-system with profiles:['static'] so it's NOT active on connected — server is authoritative.
- **FEAT-SERVER-FUSE-TICK-001** — Server ticks Bomb.fuseRemaining + emits blastEvent at zero _(implemented)_
  Extracted bomb-fuse-system runs each server tick. Ticks fuseRemaining by fixedDt; at zero deletes the Bomb entity + emits the new blastEvent protocol message (S116) to every connected client. NO propagation yet (S118). Client connected-profile disables local bomb-fuse-system. Client subscribes to blastEvent and renders the blast tiles + audio locally (existing BlastTile entity life-cycle from blast-tile-lifetime-system stays client-side for visuals).
- **VERIFY-MP-BOMB-SPAWN-PLAYWRIGHT-001** — Playwright two-tab smoke: tab A places bomb → tab B sees it spawn _(pending)_
  Extend tests/e2e/kaboom-multiplayer-roundtrip.spec.ts (or add a sibling spec) with the headline acceptance from sprint-b-plan §3 S117: alpha presses Space → bravo's snapshot includes a Bomb entity with Bomb.ownerId='alpha' within 200 ms. Asserts the full c→s→broadcast path. Best-effort SECOND check: after fuse expires (~2.5s default), the Bomb entity disappears from both tabs' snapshots + a blastEvent was delivered.

### Notes

- First of 4 sprints implementing GDP-2026-05-22-011 (server-authoritative kaboom-crew). Sequencing per docs/research/kaboom-multiplayer-sprint-b-plan.md §3: S117 protocol+placement+fuse → S118 blast+blocks → S119 pickup+round-resolve → S120 bot-AI.
- Per spike §2 Recommendation: Option B — shared rules module. S117 starts the extraction by moving bomb-placement-system + bomb-fuse-system from examples/kaboom-crew/src/systems/ into a server-importable location.
- Acceptance for S117: server tick spawns Bomb entities from placeBombRequest, ticks Bomb.fuseRemaining each step, emits blastEvent at zero. Two browser tabs see each other's bombs spawn within ~200 ms. NO blast propagation yet (that's S118).

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
