# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S137 — Ragdoll polish v3 — joint spawn correction + death dust puff

Status: **active** (started 2026-05-25). Source: `backlog/sprints/S137.sprint.json`.

### Stories

- **FEAT-RAGDOLL-JOINT-SPAWN-CORRECTION-001** — Compute joint anchorB at spawn time to satisfy constraints from frame 0 _(implemented)_
  engine/physics/ragdoll/spawn-system.ts — after the per-body loop and before the per-joint loop, for each joint def: (a) read bodyA's spawn pose (from bodyPoses, falling back to root+anchor); (b) compute jointWorld = bodyA.position + quat(bodyA.rotation) * template.anchorA; (c) read bodyB's spawn pose; (d) compute corrected anchorB = quat(bodyB.rotation)^-1 * (jointWorld - bodyB.position). Pass the corrected anchorB to adapter.acquireJoint instead of the template's. When bodyPoses isn't provided (rest-pose spawn), the corrected anchorB equals the template anchorB — backward-compatible.
- **TEST-RAGDOLL-JOINT-SPAWN-CORRECTION-001** — Engine test: joint world anchors match at spawn under arbitrary bodyPoses _(implemented)_
  tests/unit/ragdoll-joint-spawn-correction.test.ts — register a 3-body chain template (torso → head → hat, two joints), give bodyPoses with non-rest positions + rotations. After spawn (single tick, no gravity, no impulse, no damping), assert each body's Transform.position has moved by less than 0.005 m. Pre-fix the bodies would have shifted under the joint correction impulse; post-fix the constraint is satisfied at frame 0 so no impulse fires.
- **FEAT-KABOOM-DEATH-DUST-PUFF-001** — Add a spark burst alongside the S86 glow puff for a punchier death cue _(implemented)_
  examples/kaboom-crew/src/systems/audio-binding-system.ts — on the same alive→false edge that already spawns the 'glow' puff, also spawn a 'spark' emitter at the same cell with lifetime 0.35s, rate 80, maxParticles 24. The visual reads as glow + debris simultaneously, matching the ragdoll launch frame. Existing glow stays as the lingering aura.
- **TEST-KABOOM-DEATH-DUST-PUFF-001** — Unit test: alive→false edge spawns both the glow + spark emitters _(implemented)_
  examples/kaboom-crew/tests/unit/audio-binding-system.test.ts — extend an existing death-flow test (or add a new one) that flips BomberStats.alive=false on a bomber with GridPosition, ticks the system, and asserts both `<id>.death-puff` (glow) AND the new `<id>.death-dust` (spark) entities exist with the expected ParticleEmitter preset + lifetime + position.
- **DOC-RAGDOLL-PLAYTEST-S137** — Refresh ragdoll-playtest.md with the spawn-pose smoothness guarantee + dust puff _(pending)_
  docs/qa/ragdoll-playtest.md — note that the S137 joint spawn correction means the bodies stay put on frame 1 even when bodyPoses is non-rest (no visible 'jolt' when a bomber dies mid-walk). Replace the 'death feels punchy' check's reference to dust with the new glow+spark pair. Update the related-systems list with the corrected joint-spawn behaviour.

### Notes

- Continuation of the ragdoll arc (S125-S136 + hotfixes #158 / #160). Two distinct themes share this sprint because both are tightly scoped and ride the same playtest feedback loop:
- (1) Engine-side fundamental jitter fix. The damping bump in #160 (linearDamping 0.4→1.2, angularDamping 0.6→2.0) covered the symptom but the root cause is joint anchorB mismatch at spawn — the S133 bodyPoses path positions bodies at the snapshotted mesh LTW (so the visible pose continues), but the joint anchors are still calibrated for the REST pose. When the bomber dies mid-stride the joint world positions on each side don't match → the constraint solver fires a corrective impulse on the first tick → visible spring. The fix is to compute anchorB at spawn time so jointWorld_A == jointWorld_B at the death frame, then the constraint is satisfied at frame 0 and damping handles any subsequent motion.
- (2) Visible polish — the existing S86 'glow' death puff is one subtle emitter (10 particles over 0.5s). Add a paired 'spark' burst for a more impactful debris cue so the death frame reads as 'BOOM' instead of 'fizz'.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
