# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S135 — Ragdoll cleanup + accessory sway restoration

Status: **active** (started 2026-05-25). Source: `backlog/sprints/S135.sprint.json`.

### Stories

- **CLEANUP-KABOOM-DEATH-ANIMATION-001** — Delete kaboom-crew death-animation-system + its test (S132 soft archive) _(implemented)_
  examples/kaboom-crew/src/systems/death-animation-system.ts (387 lines) and examples/kaboom-crew/tests/unit/death-animation-system.test.ts (165 lines, already `describe.skip`-style) are S132-orphaned: the engine ragdoll module owns the death visual since S132. Drop both files. Remove the `void createKaboomDeathAnimationSystem` line + its import from examples/kaboom-crew/bootstrap.ts. Drop the orphan DeathAnim component schema entry from examples/kaboom-crew/schemas/scene-extensions.schema.json (if present). Sweep stale comments referencing death-animation-system in hit-recoil-system.ts, audio-binding-system.ts, remote-bomber-interpolator-system.ts, tests/unit/player-input-system.test.ts to point at death-trigger-system.ts instead.
- **CLEANUP-KABOOM-SPRING-PIVOT-IMPORT-001** — Remove the dead `void createSpringPivotSystem` line from kaboom-crew bootstrap _(implemented)_
  examples/kaboom-crew/bootstrap.ts has a `void createSpringPivotSystem;` line from S132 (the import is still pulled in only to satisfy the void). The next story re-registers spring-pivot for real; this cleanup story drops the dead reference + the placeholder block comment so the file is clean before the re-registration commit lands. The spring-pivot-system source file stays — procbomber-bench still uses it.
- **FIX-ACCESSORY-SWAY-IN-KABOOM-001** — Re-register spring-pivot-system in kaboom-crew to restore S106 accessory sway _(implemented)_
  examples/kaboom-crew/bootstrap.ts — register createSpringPivotSystem() AFTER createSoftAttachSwaySystem() so the soft-attach sway nudges (SpringPivot.velocity writes from parent motion deltas) actually decay back into Transform.rotation on accessory entities. S132 deregistered it because the system was originally part of the procedural-spring death cascade — but in kaboom-crew the system also (legitimately) drives accessory sway against the soft-attach nudges. Without it, the 5 procedural accessories (antenna / visor / backpack / cap / fins) have been silently frozen since S132 even on live alive bombers. Side effect during ragdoll: the ragdoll-driven head/torso mesh motion produces sway nudges → accessories swing as they're whipped around with the body, which is the visually-correct outcome (not the prior 'freeze in mid-air' fear).
- **TEST-ACCESSORY-SWAY-IN-KABOOM-001** — Unit test: soft-attach-sway → spring-pivot chain rotates accessory on parent motion _(implemented)_
  examples/kaboom-crew/tests/unit/accessory-sway.test.ts — set up a parent entity with LocalToWorld at p0 + a SoftAttached child with SpringPivot{velocity:[0,0,0], restRotation:[0,0,0]} + Transform.parent = parent. Tick soft-attach-sway with the parent moved by Δx; assert the child's SpringPivot.velocity gained a non-zero Z component (per the linear→angular formula). Then tick spring-pivot; assert the child's Transform.rotation moved off zero and decays toward rest with subsequent ticks at parent rest. Catches re-regression of the S132 deregistration.
- **TEST-RAGDOLL-ACCESSORY-HIERARCHY-001** — Integration test: accessory parented to head mesh follows the ragdoll body _(pending)_
  tests/unit/ragdoll-death-flow.test.ts — extend the existing S134 integration test with one accessory entity (antenna). Spawn the antenna with Transform{parent: head mesh, position: [0, 0.4, 0]}. Run the death-trigger + spawn + sync chain. Insert a transform-resolve-system tick at the end of each loop iteration so accessory LocalToWorld is recomputed. Assert: after 30 ticks under gravity, accessory.LocalToWorld.position ≈ head body world position + [0, 0.4, 0] composed by head's body rotation. Confirms accessories follow via the renderer's hierarchy alone — no new ragdoll binding mode needed. Resolves the S134 'known gap' from docs/qa/ragdoll-playtest.md by proof.
- **DOC-RAGDOLL-PLAYTEST-001** — Update ragdoll-playtest.md: accessory gap closed + system list refreshed _(pending)_
  docs/qa/ragdoll-playtest.md — replace the 'Accessories stay attached (known gap)' bullet with a positive 'Accessories follow head/torso bodies and sway with the ragdoll motion' check (referencing the new integration test as the regression guarantee). Update the 'Related systems' section: remove the soft-archive note pointing at death-animation-system.ts (now deleted) + spring-pivot-system 'only used by bench' caveat (now re-registered in kaboom too). Add a one-line pointer to accessory-sway.test.ts.
- **HOUSEKEEPING-REJECT-QA-2026-05-24-001** — Archive QA-2026-05-24-001 as rejected (already fixed in main) _(implemented)_
  Move backlog/qa-tickets/QA-2026-05-24-001.qa-ticket.json into backlog/qa-tickets/archive/rejected/ + update backlog/qa-tickets/archive/rejected/README.md with the explanation (both flagged unit tests on post-S119 HEAD 8cc8a0e are green on current main — the fix landed via test updates that added `{ spawnBot: false }` defaults in S120-S125, before the ticket was filed on 2026-05-24).

### Notes

- Polish sprint that closes loose ends around the S125-S134 engine-ragdoll migration. Three concrete things landed broken or left undone: (1) examples/kaboom-crew/src/systems/death-animation-system.ts is dead code, kept as a soft archive in S132 with a 'delete in S133' note that S133 + S134 skipped; (2) bootstrap.ts still imports + voids createSpringPivotSystem alongside it; (3) re-registering spring-pivot in kaboom-crew also restores S106 accessory sway, which has been silently broken since spring-pivot was deregistered in S132 (soft-attach-sway-system still writes SpringPivot.velocity each frame in kaboom-crew, but no system reads + decays it to Transform.rotation).
- S134 playtest doc (docs/qa/ragdoll-playtest.md) flagged 'accessories may freeze in mid-air' as a known gap because they are NOT in the 10-body ragdoll template. Investigation: accessory.Transform.parent points at the head/torso MESH entity; after the ragdoll spawns, the engine sync writes world-space Transform on the head/torso mesh (parent cleared), so the renderer's transform-resolve-system naturally composes accessory LocalToWorld = mesh.LTW * accessory.local. Accessories should follow via the hierarchy alone — no new binding needed. This sprint adds an integration test to lock that behavior in.
- Also archives the open QA ticket QA-2026-05-24-001 (filed 2026-05-24 against post-S119 HEAD 8cc8a0e) as `rejected` — both flagged unit tests are green on current main; the fix landed via test updates (spawnBot: false defaults) in S120-S125, before the ticket was filed.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
