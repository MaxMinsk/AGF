# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S136 — Ragdoll arena physics — soft-block colliders, lifetime + visual playtest

Status: **active** (started 2026-05-25). Source: `backlog/sprints/S136.sprint.json`.

### Stories

- **PHYS-SOFT-BLOCK-COLLIDERS-001** — Add RigidBody3D + Collider3D to the soft-block prefab _(implemented)_
  examples/kaboom-crew/prefabs/soft-block.prefab.json — add RigidBody3D{type:fixed} + Collider3D{kind:box,size:[1,1,1]}. Soft blocks are spawned at scene-build + destroyed mid-round via world.removeEntity in blast-propagation; physics-sync-system's phase-1 release loop already drops the Rapier body when the entity disappears, so no extra teardown wiring needed. Ragdolls now collide with intact soft blocks instead of clipping through them.
- **TEST-SOFT-BLOCK-COLLIDER-CLEANUP-001** — Unit test: soft-block removeEntity releases its Rapier body _(implemented)_
  tests/unit/soft-block-physics-cleanup.test.ts (or extend an existing physics test) — spawn a fixed body via RigidBody3D+Collider3D on an entity, tick physics-sync, observe registry has 1 body. Call world.removeEntity, tick again, assert registry.size() === 0 and adapter.bodyCount() === 0. Catches a regression in the entity-removal release loop in physics-sync-system.
- **SCHEMA-RAGDOLL-LIFETIME-001** — RagdollLifetime component schema _(implemented)_
  schemas/components/ragdoll.schema.json — add RagdollLifetime { secondsRemaining: number } component. The ragdoll spawn-system writes it onto the root next to RagdollActive when a (new) RagdollTemplate.lifetimeSeconds is configured (defaults to undefined = no auto-cleanup). The lifetime-system (next story) decrements per fixedUpdate and issues RagdollTeardownRequest when it hits zero.
- **FEAT-RAGDOLL-LIFETIME-SYSTEM-001** — Engine ragdoll lifetime-system: auto-teardown after N seconds _(pending)_
  engine/physics/ragdoll/lifetime-system.ts (new) — fixedUpdate query on [RagdollActive, RagdollLifetime]; decrement secondsRemaining by dt; on ≤0 write RagdollTeardownRequest on the same root. Register from src/app.ts alongside the spawn/sync/teardown systems. Kaboom-bomber template gains lifetimeSeconds: 4 (one round = 90s, so a 4-second corpse is generous but cleans up before round end). Without lifetime, mid-round multi-kills accumulate bodies until the round timer's bulk teardown.
- **TEST-RAGDOLL-LIFETIME-001** — Unit test for the lifetime-system _(pending)_
  tests/unit/ragdoll-lifetime.test.ts — set up a ragdoll root with RagdollActive + RagdollLifetime{secondsRemaining: 1.0}; tick lifetime-system at dt=1/60; after 60 ticks (1.0s) assert RagdollTeardownRequest is on the root and secondsRemaining ≤ 0. Also: bodies query empty after teardown-system runs.
- **PLAYTEST-RAGDOLL-ARENA-001** — Playwright spec: ragdoll stays in arena after blast death _(pending)_
  tests/e2e/kaboom-ragdoll-arena.spec.ts — load /?project=kaboom-crew, wait for the round to spawn + bots to start moving, place a bomb (via the kbd-press or commands probe) next to a bot, wait ~2s for the blast + ragdoll, snapshot the world. Assert: at least one RagdollBody-bearing entity exists, every body's world position.y is between -0.2 and 4.0, and X/Z are inside the floor extents (15×11 around (7, _, 5) for start.scene). Regression guard for the PR #158 impulse + floor/wall fixes.
- **DOC-RAGDOLL-ARENA-001** — Update ragdoll-playtest.md with arena + lifetime contract _(pending)_
  docs/qa/ragdoll-playtest.md — add bullets covering: (a) ragdoll bodies collide with floor + hard-block walls + intact soft-blocks (no more clipping through); (b) corpses fade out after ~4s (RagdollLifetime); (c) reference the new playwright spec as the regression guarantee. Move the 'related systems' list to mention engine/physics/ragdoll/lifetime-system.ts.

### Notes

- Hot on the heels of PR #158 (impulse-to-root + 0.5× scale + floor/hard-block colliders). This sprint closes the arena-physics story: soft-blocks join the static colliders, ragdolls fade out after a few seconds so corpses don't pile up across a round, and a playwright spec captures the visual contract so future ragdoll changes can't silently break it.
- Soft-block destruction already calls world.removeEntity(id), and physics-sync-system phase-1 releases the Rapier body when the entity disappears, so adding RigidBody3D+Collider3D to the soft-block prefab is a single-file change with no extra teardown code.
- Lifetime story keeps the corpse on screen long enough to feel impactful but cleans up before the round resets — round-reset already handles bulk teardown via RagdollTeardownRequest on every ragdoll root, but mid-round multi-kills used to leak bodies until the round ended.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
