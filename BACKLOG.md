# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S138 — Kaboom bomb + pickup colliders — ragdoll interacts with placed objects

Status: **active** (started 2026-05-25). Source: `backlog/sprints/S138.sprint.json`.

### Stories

- **FEAT-KABOOM-BOMB-COLLIDER-001** — Bomb prefab gains a static Rapier collider so ragdolls bounce off _(implemented)_
  examples/kaboom-crew/prefabs/bomb.prefab.json — add RigidBody3D{type:fixed} + Collider3D{kind:sphere,radius:0.175} (matches the 0.35-scale sphere visual). Bomb spawn tweens scale 0 → final but the collider stays at 0.175 from creation — the few-frame size mismatch is irrelevant because nothing collides with a bomb in its spawn-pop window. Cleanup: bomb-fuse-system's world.removeEntity at fuse=0 releases the body via physics-sync phase-1.
- **TEST-KABOOM-BOMB-COLLIDER-001** — Unit test: bomb spawn registers a Rapier body; removal releases it _(implemented)_
  examples/kaboom-crew/tests/unit/bomb-placement-system.test.ts (extend the existing 'spawns a bomb' test) — assert RigidBody3D + Collider3D components are present on the placed bomb. Plus a fresh test that tick + world.removeEntity (mimicking fuse expiry) clears the body from the registry. Schema validation via engine:check ensures the prefab JSON stays valid.
- **FEAT-KABOOM-PICKUP-COLLIDER-001** — pickup-spawn-system writes static colliders on every spawned pickup _(implemented)_
  examples/kaboom-crew/src/systems/pickup-spawn-system.ts — alongside the existing Transform / MeshRenderer / GridPosition / GridOccupant / Pickup / ParticleEmitter writes, also setComponent RigidBody3D{type:fixed} + Collider3D{kind:box,size:[visual.scale[0], visual.scale[1], visual.scale[2]]}. Box covers all pickup mesh kinds (sphere/box/cylinder) with a slight rounding error that's invisible at this scale. removeEntity in pickup-collect-system releases the body via physics-sync phase-1.
- **TEST-KABOOM-PICKUP-COLLIDER-001** — Unit test: spawned pickups carry RigidBody3D + Collider3D; collect releases _(implemented)_
  examples/kaboom-crew/tests/unit/pickup-spawn-system.test.ts (or extend the existing 'spawns a pickup' test) — assert the new RigidBody3D + Collider3D components land on the pickup entity with size matching the visual. examples/kaboom-crew/tests/unit/pickup-collect-system.test.ts — assert the collected pickup's entity removal would release a body (component-level check; the actual Rapier release is covered by S136's physics-sync test).
- **DOC-KABOOM-PHYSICS-OBJECTS-001** — Update ragdoll-playtest.md with the bomb + pickup collider contract _(pending)_
  docs/qa/ragdoll-playtest.md — extend the 'Stays inside the arena' bullet with 'and bounces off live bombs + pickups too'. Mention that the bomb's collider is a sphere matching its rendered radius, and pickups use a box matching their visual scale. Update 'Related systems' with the bomb.prefab.json + pickup-spawn-system entries.

### Notes

- Continuation of the S136 arena-physics arc: floor + hard-blocks + soft-blocks now have static Rapier colliders so ragdoll bodies bounce off them. Bombs + pickups are still visual-only entities, so dead bombers' bodies clip straight through any bomb or powerup sitting on the floor. This sprint closes that gap.
- Both bomb and pickup follow the soft-block pattern: write RigidBody3D{type:fixed} + Collider3D on spawn; entity removal at fuse-expiry / collect lets physics-sync-system's phase-1 release the Rapier body automatically (no extra teardown wiring needed — see TEST-SOFT-BLOCK-COLLIDER-CLEANUP-001 from S136).
- Safety: alive bombers use grid-mover-system (no Rapier body) so the new static colliders don't break the existing kick/bump gameplay. The only thing that touches them is the dead bomber's ragdoll bodies.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
