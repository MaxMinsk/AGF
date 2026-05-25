# Ragdoll death-flow playtest checklist

Manual checklist a human QA can run after any change touching the
engine ragdoll module (`engine/physics/ragdoll/`), the kaboom-crew
death-trigger (`examples/kaboom-crew/src/systems/death-trigger-system.ts`),
or related animation gates. Catches visual regressions the unit tests
can't see.

## Quick path

1. `npm run dev` → open `http://localhost:5173/?project=kaboom-crew`
2. Wait for the round to spawn + bots to start moving.
3. Place a bomb near a bot so it dies in the blast.
4. Walk through the checks below.

## What to verify

- [ ] **Bomber falls naturally.** Body tips and tumbles in the blast
      direction — not a vertical bounce, not a sideways slide, not
      a rigid stick.
- [ ] **Limbs flop independently.** Arms + legs + head each move on
      their own physics-driven trajectory — you can see the elbow
      bend, the knee fold, etc.
- [ ] **No T-pose jump on death.** The ragdoll spawns at the
      bomber's current pose. Limbs should NOT snap back to a rest
      pose on the death frame before the physics integrator starts
      (the S133 pose-snapshot fix targets this — if you see a single-
      frame T-pose, that's a regression).
- [ ] **Lands on the floor.** Body rests on the ground after a few
      seconds — no penetration through the floor, no bouncing
      forever. (S135 hotfix #158 added `RigidBody3D{type:fixed}` +
      `Collider3D` to the floor entity in start.scene + wide.scene.
      If a body sinks below y = 0, that's a regression — check the
      floor entity still has both components.)
- [ ] **Stays inside the arena.** Body does NOT fly across the
      perimeter wall and disappear off-screen. (S135 hotfix #158 made
      hard-blocks physical. S136 also made soft-blocks physical so
      ragdolls bounce off intact blocks; destroyed soft-blocks
      release their Rapier body automatically via the entity-removal
      path in `physics-sync-system`.)
- [ ] **Blast feels punchy but not nuclear.** Bomber travels 1-2
      grid cells before coming to rest, not 10. (S135 hotfix #158
      applies the impulse only to the first body in the template +
      scales by 0.5× in `death-trigger-system`. If bodies launch out
      of the arena even with the colliders, the impulse scale or the
      first-body-only logic has regressed.)
- [ ] **Body fades out after a few seconds.** The corpse should
      disappear ~4 s after death (per `kaboom-bomber` template
      `lifetimeSeconds: 4`). If a corpse persists across the entire
      round, S136's `RagdollLifetime` countdown was lost or the
      lifetime-system wasn't registered.
- [ ] **No body part shoots off.** No limb flies away from the
      torso. Joint disconnections suggest the joint anchors don't
      match the body anchors.
- [ ] **Accessories follow head/torso and sway with the ragdoll
      motion.** The 5 procedural accessories (antennae / visor /
      backpack / cap / fins) are NOT in the ragdoll template — they
      stay parented to the head/torso mesh entities. The renderer's
      hierarchy resolve composes `accessory.LTW = parentMesh.LTW *
      accessory.local`; the parent mesh is driven by the ragdoll
      sync, so the accessory follows for free. S135 added
      `tests/unit/ragdoll-death-flow.test.ts` 'accessory parented to
      head mesh follows the ragdoll body via hierarchy' as the
      regression guard. The accessory ALSO sways via the S106
      soft-attach chain (`soft-attach-sway-system` →
      `spring-pivot-system`) as the ragdoll whips the parent around.
      If accessories freeze in mid-air, check that
      `createSpringPivotSystem` is still registered in
      `examples/kaboom-crew/bootstrap.ts` — S135 restored it after
      S132 dropped it.
- [ ] **Next round resets cleanly.** Start a new round (let the
      current one timeout or place enough kills to finish). No
      leftover body entities should remain from the prior round.
- [ ] **Multiple deaths in one round don't slow the game down.**
      Kill all bots in quick succession. Frame rate should hold.
      A Rapier body leak would manifest as gradual stutter.

## What to capture

If any check fails:

- Take a screenshot (visual evidence).
- Run `curl http://localhost:5173/__agf/snapshot > /tmp/snap.json`
  immediately after the failure — captures ECS state including
  RagdollState + RagdollActive + RagdollMeshBinding components.
- Note the steps to reproduce.
- File a QA ticket in `backlog/qa-tickets/` per `docs/qa/ticket-template.md`.

## Related systems

After S132+ (death visual handover) and S135 (cleanup + accessory
sway restoration), the death visual is driven by:

- `examples/kaboom-crew/src/systems/death-trigger-system.ts` —
  writes `RagdollSpawnRequest` on the alive→false edge with a
  `meshMap` + `bodyPoses` snapshot of the 10 procedural meshes.
- `engine/physics/ragdoll/spawn-system.ts` — consumes the request,
  creates Rapier bodies, writes `RagdollMeshBinding` per mesh.
- `engine/physics/ragdoll/sync-system.ts` — mirrors body world
  transforms onto each bound mesh per fixed tick.
- `engine/physics/ragdoll/teardown-system.ts` — disposes bodies +
  clears bindings on round reset.
- `engine/physics/ragdoll/lifetime-system.ts` (S136) — decrements
  `RagdollLifetime.secondsRemaining` per fixed tick; when it hits
  zero, issues `RagdollTeardownRequest` on the root so the same
  teardown path runs mid-round. Activated by
  `RagdollTemplate.lifetimeSeconds` (4 s for kaboom-bomber).
- `examples/kaboom-crew/scenes/start.scene.json` + `wide.scene.json`
  `floor` entity (S135 #158) + `examples/kaboom-crew/prefabs/
  hard-block.prefab.json` (S135 #158) + `soft-block.prefab.json`
  (S136) carry `RigidBody3D{type:fixed}` + `Collider3D{box}` so
  the Rapier world has the arena static geometry the ragdoll
  bodies bounce off of.
- `examples/procbomber-bench/src/systems/soft-attach-sway-system.ts`
  + `spring-pivot-system.ts` — accessory sway during walk AND while
  the ragdoll whips the head/torso around. Both registered in
  `examples/kaboom-crew/bootstrap.ts`. Regression-tested by
  `examples/kaboom-crew/tests/unit/accessory-sway.test.ts` (chain)
  + `tests/unit/ragdoll-death-flow.test.ts` (accessory-hierarchy).

The S132-era `death-animation-system.ts` was deleted in S135.
