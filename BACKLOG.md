# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S105 — Spring system + ragdoll death + accessory layer

Status: **active** (started 2026-05-22). Source: `backlog/sprints/S105.sprint.json`.

### Stories

- **CHORE-GDP-2026-05-22-005-PROMOTION** — Promote GDP-2026-05-22-005 (ragdoll death) into the sprint _(implemented)_
  Game-design terminal filed GDP-005 (should priority) mid-S104 in response to the user asking 'could we do ragdoll for the characters'. Archive the proposal + promote as the centerpiece of S105 alongside the deferred -003 + -004 from S104.
- **KABOOM-SPRING-PIVOT-SYSTEM** — Generic spring-damped angular pivot system (foundation for sway + ragdoll) _(pending)_
  Promoted from GDP-2026-05-22-004 (spring half). Pure ECS system: reads a `SpringPivot { restX, restY, restZ, velocityX, velocityY, velocityZ, k, damping }` component on any pivot entity. Each fixedUpdate computes Hooke-spring restoring force toward rest + damping, integrates angular velocity into Transform.rotation. Shared by accessories (soft-attached sway) + ragdoll (death flail) + any future secondary motion. Pure helpers + unit tests; no project-side wiring this story.
- **KABOOM-RAGDOLL-STATE-COMPONENT** — RagdollState component + blast-direction capture on alive→dead edge _(pending)_
  Promoted from GDP-2026-05-22-005. New project-local schema entry `RagdollState { blastOriginGx, blastOriginGz, deathStartedAt, magnitude }` written on the bomber at the moment BomberStats.alive flips false. audio-binding-system (the existing edge detector) captures the BlastEvent that caused the kill + records its origin. Single-blast magnitude = 1.0; chained blasts in the same frame clamp to max 1.8.
- **KABOOM-RAGDOLL-ROOT-ARC** — Ragdoll root-arc system replaces the S100 vertical-hop tween _(pending)_
  Promoted from GDP-2026-05-22-005. New death-animation system reads RagdollState + drives the root's Transform.position along a gravity arc: initial velocity (dir.x × magnitude × 1.6, +2.4, dir.z × magnitude × 1.6); vy += -9.0 cell/sec² per fixedUpdate. After ~0.6 s the bomber lands ~0.7 cells from death cell, vertical peak ~0.85 cells. Angular velocity: cross(dir, +Y) × magnitude × π applied to root.rotation per tick — produces natural tumble (east blast tips bomber west). REMOVES the S100 deathLaunchHeight + deathSpinYaw curves from death-animation-system.ts.
- **KABOOM-RAGDOLL-LIMB-FLAIL** — Limb flail via the spring-pivot system + per-pivot initial impulse _(pending)_
  Promoted from GDP-2026-05-22-005 (limb-flail phase). At the alive→dead frame, the 9 limb pivots from LimbPivots each get a deterministic angular impulse: hash(entityId, blastOrigin, pivotName) → ±15..40° offset. SpringPivot components stamped with the offset as initial velocity + the existing rest (0,0,0) target + k=18 damping=0.4. The spring system then flails the limbs back toward rest. Lasts ~0.6s in sync with the root-arc.
- **KABOOM-HIT-RECOIL-SYSTEM** — Hit-recoil — torso punches backward on every blast hit (not only fatal ones) _(pending)_
  Promoted from GDP-2026-05-22-004 (hit-recoil half). Even when the blast doesn't kill (e.g. invuln frames; or non-bomber objects pending), the torso flinches backward briefly. New `HitRecoil { startedAt, blastDirX, blastDirZ }` component; an animation system tweens torso.rotation.X away from the blast for ~0.15s then settles. Decoupled from ragdoll — recoil happens on ANY hit, ragdoll only on the fatal one.
- **KABOOM-ACCESSORY-LAYER** — Accessory layer — 5 starter accessories on named mount sockets _(pending)_
  Promoted from GDP-2026-05-22-003 (re-promote of GDP-2026-05-21-005). Recipe gains an `accessories: BomberAccessory[]` field (0..3 entries from a closed enum: antennae, visor, backpack, cap, fins). Each accessory is a small mesh tree attached to a named mount socket on the bomber. Mount sockets: head.crown, head.eyes, torso.back, torso.sideL, torso.sideR. Accessory entities are tagged 'soft-attached' (a marker) so the spring-pivot system picks them up for secondary sway. Pure recipe extension — palette channels reused (no new colour fields).

### Notes

- GDP-2026-05-22-005 (ragdoll death) is the user-requested centerpiece. Split into RagdollState capture + root-arc + limb-flail stories so each phase has a focused diff.
- Spring-pivot system foundation lands FIRST — both accessory sway + ragdoll flail consume it. Without the foundation, hit-recoil + ragdoll need their own ad-hoc tween systems.
- S100 KABOOM-SLAPSTICK-DEATH (deathLaunchHeight + deathSpinYaw) is REPLACED by the ragdoll root-arc, not layered on top. The cleanup is part of KABOOM-RAGDOLL-ROOT-ARC.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
