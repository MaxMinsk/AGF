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
      forever.
- [ ] **No body part shoots off.** No limb flies away from the
      torso. Joint disconnections suggest the joint anchors don't
      match the body anchors.
- [ ] **Accessories stay attached** (known gap: the 5 procedural
      accessories — antennae / visor / backpack / cap / fins — are
      NOT covered by the 10-body ragdoll template. They currently
      stay parented to head/torso mesh entities. After detach, head
      and torso are positioned by the engine sync, and accessories
      compose against the now-detached parent's local transform.
      If accessories freeze in mid-air at the death frame, that's
      the gap — file a ticket for an accessory-ragdoll sprint).
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

After S132+, the death visual is driven by:

- `examples/kaboom-crew/src/systems/death-trigger-system.ts` —
  writes `RagdollSpawnRequest` on the alive→false edge with a
  `meshMap` + `bodyPoses` snapshot of the 10 procedural meshes.
- `engine/physics/ragdoll/spawn-system.ts` — consumes the request,
  creates Rapier bodies, writes `RagdollMeshBinding` per mesh.
- `engine/physics/ragdoll/sync-system.ts` — mirrors body world
  transforms onto each bound mesh per fixed tick.
- `engine/physics/ragdoll/teardown-system.ts` — disposes bodies +
  clears bindings on round reset.

Orphaned but kept as soft archives (deleted in a future sprint
once playtest confirms no regression):

- `examples/kaboom-crew/src/systems/death-animation-system.ts`
- `examples/procbomber-bench/src/systems/spring-pivot-system.ts`
  (still used by the procbomber-bench's standalone slider tweens
  — only de-registered from kaboom-crew).
