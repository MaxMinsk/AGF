# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S102 — Bomber multi-mesh tree + palette/recipe expansion (GDP-2026-05-21 batch)

Status: **active** (started 2026-05-21). Source: `backlog/sprints/S102.sprint.json`.

### Stories

- **PROCBOMBER-VERTEX-COLORS-FIX** — Bench palette dropdown actually changes colours (vertexColors flag) _(implemented)_
  Hotfix the palette-doesn't-affect-anything bug the user reported the moment S101 merged. The bomber's mesh paints colour per-vertex via the palette (linear-RGB on a BufferAttribute), but the renderer's default material (created in adapter.acquireMesh) sets vertexColors=false. The flat MeshStandardMaterial's solid colour wins, every bomber renders white. Add a `vertexColors` field to MaterialPatch + flip it from the bench's bootstrap rebuild loop.
- **CHORE-GDP-2026-05-21-PROMOTION** — Move GDP-2026-05-21-001..007 from proposed-stories/ to the archive _(implemented)_
  Promote the 7 GDP proposals filed by the game-design terminal during S101 into S102 stories below (or defer). Archive the source files under backlog/proposed-stories/archive/S102/ so the inbox empties.
- **PROCBOMBER-MESH-TREE-V0** — Decompose procbomber into 9-pivot + 10-mesh ECS tree (GDP-001) _(implemented)_
  Replace the single-BufferGeometry generator with a hierarchical spawner that creates one root entity, 9 actuated pivot entities (neck, shoulder.l/r, elbow.l/r, hip.l/r, knee.l/r — Transform only, no MeshRenderer), and ~10 body-part mesh entities (torso, head, upperArm.l/r, forearm.l/r, upperLeg.l/r, lowerLeg.l/r — each MeshRenderer ref points at a part-specific procedural key). The 'tree' lives in ECS Transform parent chain — animation systems mutate pivot rotations, child meshes inherit. Fixed naming convention; per GDP-001 acceptance.
- **PROCBOMBER-PART-BUILDERS** — Per-part procedural mesh builders + multi-key registry usage _(implemented)_
  Split generateBomberMesh into per-part generators: generateTorso, generateHead, generateUpperArm, generateForearm, generateUpperLeg, generateLowerLeg. Each returns one BufferGeometry sized by its slice of the recipe. Bench bootstrap registers them under separate procedural keys (procbomber-torso, procbomber-head, …). The mesh tree spawner gives each entity its own ref. Keeps the existing single-mesh path (generateBomberMesh) as a deprecated convenience for any callers still using the v0 shape.
- **PROCBOMBER-LIMB-PIVOTS-COMPONENT** — LimbPivots project component carrying named pivot entity refs _(implemented)_
  Schema entry under examples/procbomber-bench/schemas/scene-extensions.schema.json: `LimbPivots { neck, shoulderL, shoulderR, elbowL, elbowR, hipL, hipR, kneeL, kneeR }` — nine fields, each a string entity id. The spawner writes one LimbPivots on the bomber root so animation systems can lookup pivots by name without traversing the Transform tree every tick. Migrate to examples/kaboom-crew/ later (GDP-007).
- **PROCBOMBER-WALK-SWING-PIVOTS** — Bench walk-swing stub rotates shoulder/hip pivots in counter-phase _(implemented)_
  Update bench-animation-system: walk-swing in the multi-mesh world rotates shoulder.l/r and hip.l/r in counter-phase (left shoulder + right hip swing forward together, then mirror) at WALK_SWING_FREQ_HZ. Idle-bob keeps driving root.position.y. Old whole-body walk-swing on root.position.x deleted — no longer needed once limbs swing. Pure helpers updated + tested.
- **PROCBOMBER-LIMB-TEST-DROPDOWN** — Bench animation dropdown gains 'limb-test' option cycling each pivot _(implemented)_
  Third stub in the dropdown: rotates each LimbPivots field by ±0.3 rad in sequence (one pivot at a time, ~1 s each) so a human can visually confirm every named pivot exists + bends in the expected direction. Useful as a QA stress / debugging tool when later animations land.
- **PROCBOMBER-PALETTE-8CH** — Palette expansion 4 → 8 channels + derived bottom-shadow tints (GDP-003) _(implemented)_
  Expand BomberPalette from { head, torso, limbs, accent } (4) to 8 channels mapped 1:1 onto the post-decomposition mesh tree: head, torsoTop, torsoBottom, upperArm, forearm, upperLeg, lowerLeg, accent. Add `bottomShadow(color)` helper deriving a darker variant per channel for the contact-shadow trick. Existing 8 named palettes get a default mapping (existing torso → torsoTop, derived bottom for torsoBottom, etc). Per-channel overrides land via recipe.paletteOverrides (a per-channel partial). +tests.
- **PROCBOMBER-RECIPE-PARAMS-16** — Recipe parameter expansion 7 → 16 (proportions + posture + mounts + shape) (GDP-002) _(implemented)_
  Expand the bench recipe to 16 deterministic parameters: 7 existing size knobs + forwardTilt + armRestAngle + shoulderMountY + shoulderMountZ + hipMountY + hipMountZ + headShape + torsoShape + limbShape. Each parameter has a clamped range, a default from BOMBER_MESH_DEFAULTS, and a seed-derivation rule so a recipe with only { seed: 42 } produces a fully-specified bomber. Bench panel sliders grow to cover the new knobs; shape knobs are 3-option select inputs (box, capsule, cylinder).

### Notes

- GDP-2026-05-21-004 (procedural texturing — panel seams + decals + shader noise) deferred. Substantial shader work, no immediate consumer until the gameplay shells (S103+) demand visual variety beyond palette + shape.
- GDP-2026-05-21-005 (accessory layer) deferred. Belongs in its own sprint after the joint hierarchy + palette + recipe stabilise.
- GDP-2026-05-21-006 (body-style enum — box/smooth/chunked) deferred. Could-priority; needs the shape knobs from GDP-2026-05-21-002 to land first.
- GDP-2026-05-21-007 (migrate to Kaboom Crew) deferred. Migration is the LAST step after all generator improvements stabilise — premature now.
- GDP-2026-05-20-009 (six animation systems) still blocked on this sprint's joint hierarchy landing — promote after S102 merges.
- GDP-2026-05-20-010 (procedural vocal synth) still deferred — could-priority.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
