# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S103 — Bomber animation polish: rotation-units fix, segment sliders, real IK reach, walk-cycle++

Status: **active** (started 2026-05-21). Source: `backlog/sprints/S103.sprint.json`.

### Stories

- **PROCBOMBER-ROTATION-DEG-FIX** — Animation system writes degrees, not radians (matches AGF scene convention) _(implemented)_
  Critical bug uncovered after S102 ship. AGF scenes carry Transform.rotation in DEGREES — three-renderer's resolver converts to radians via MathUtils.degToRad before handing the matrix to Three.js. The S102 bench-animation-system writes Math.sin(...) outputs (radian-scale numbers) directly into Transform.rotation; the renderer then treats those 0..0.5 values as 0..0.5 DEGREES — barely visible. Root cause of: walk-swing 'tiny range', arm-rest 'doesn't work', limb-test 'doesn't work', forwardTilt 'small range'. Fix: convert every rotation write in bench-animation-system + bootstrap to degrees. New helper radToDeg + amplitude constants in degrees. All animation-related unit tests adjusted.
- **PROCBOMBER-LIMB-SEGMENT-SLIDERS** — Separate sliders for upperArm / forearm / upperLeg / lowerLeg lengths _(pending)_
  S102 left arm + leg as two segments sharing one length knob — total visible length = 2 × the slider value. User wants independent control. Split into upperArmLength, forearmLength, upperLegLength, lowerLegLength; existing armLength/legLength removed. Spawner + reposition + per-part builders consume the segment lengths. Bench panel gains 4 new sliders (replacing 2).
- **PROCBOMBER-HIP-SPREAD-SLIDER** — hipSpread recipe knob — distance between left + right legs _(pending)_
  Currently hipX = halfTorsoX × 0.5 (fixed ratio). Add a `hipSpread` recipe parameter (0.2..1.4, default 1.0) multiplying that anchor. Wide stance (1.4) for stocky frog-style bombers; narrow (0.2) for stick-figure shapes. Mirror knob `shoulderSpread` for symmetric control of arm anchor X. Both feed buildPivotRepositionCommands.
- **PROCBOMBER-POSTURE-RANGES** — Widen forwardTilt + armRestAngle slider ranges + bump walk-swing amplitude _(pending)_
  forwardTilt extended from [-0.4, 0.6] rad-as-degrees to [-60°, 90°] (lean forward dramatically). armRestAngle extended to [-90°, 90°]. walkSwing default amplitude raised from 0.5 (read as 0.5°) to 35° once the rotation-units fix lands so the gait looks like a real walk. limbTest rotation 0.3° → 30°.
- **PROCBOMBER-ARM-REST-APPLIES** — armRestAngle actually drives the shoulder pose at rest _(pending)_
  S102 added the armRestAngle slider but never connected it to the pose. Fix: when kind=none or idle-bob, the bench-animation-system writes armRestAngle to shoulderL/R Transform.rotation.X (instead of zero). walk-swing + limb-test still take over fully when active. Symmetric on both shoulders.
- **PROCBOMBER-WALK-CYCLE-PLUS** — Walk cycle drives knees + elbows too (not just shoulders + hips) _(pending)_
  S102 walk-swing only rotates shoulder + hip pivots. Real walk bends knees + elbows in phase with the leg/arm swing. Add quarter-phase bend on elbowL/R + kneeL/R during walk-swing: front-swinging leg bends knee, rear-swinging arm bends elbow. Plus subtle vertical bob on the root (Y dips on each foot plant). Visually the bomber actually 'walks' instead of sliding limbs.
- **PROCBOMBER-IK-REACH-TARGET** — Two-bone IK solver for arms + 'reach' animation kind _(pending)_
  Real two-bone IK: given a shoulder anchor + an end-effector world target, solve shoulder + elbow rotations so the hand reaches the target. Implementation: law-of-cosines analytic solver (no iterative CCD needed for two bones). New animation kind 'reach' drives a moving target (circle around the bomber); the IK solver writes shoulderL + elbowL rotations per frame. Pure helpers tested with deterministic targets.
- **PROCBOMBER-BENCH-PANEL-SECTIONS** — Group bench overlay controls into labeled sections (size / posture / mounts / shape / anim) _(pending)_
  After S102 the panel is a long flat list of sliders + dropdowns + a button. With S103 adding ~6 more knobs (segment splits + spread + reach target) it becomes hard to scan. Add section headings (Size, Posture, Mounts, Shape, Palette, Animation) with small visual separators inside the existing panel. Pure DOM cosmetics; no new behaviour.

### Notes

- S103 is the polish + IK pass on the bench. After this sprint the bench should be USABLE for designing actual character recipes, not just demonstrating wiring.
- GDP-2026-05-20-009 (six animation systems pack) still on the roadmap — this sprint's IK + walk-cycle + arm-rest patterns are the foundation those six will share.
- Foot-plant during walk (feet stay on ground) deferred to S104 — it depends on shoulder/hip-Y compensation tracked via IK solver.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
