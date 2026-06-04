# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S179 — Terrain & visual finishing — scene-validation contract, cliff faces, outline gating, step-jump polish

Status: **active** (started 2026-06-04). Source: `backlog/sprints/S179.sprint.json`.

### Stories

- **S292-SCENE-VALIDATION-OVERLAY-ADJACENCY** — Scene validation — reject cardinally-adjacent different floor-overlay biomes (tile-edge C-2) _(implemented)_
  GDP-2026-06-04-005. The curved-outline overhang relies on C-2: every open edge faces base floor, never a different biome. Add an engine-check terrainmap scan that fails with a clear diagnostic when two different non-floor overlay families sit on cardinally-adjacent cells. Same-family adjacency is fine; only different non-floor families are rejected. Makes the tile-edge contract self-enforcing instead of silently violable by scene authors.
- **S293-KABOOM-CLIFF-FACE-WANG** — Cliff face Wang autotiling — vertical edge meshes between height-differing cells (GDP-2026-06-04-001) _(implemented)_
  Extend the tile-edge pattern to LAYER 4 (cliff faces): vertical edges between cells of differing height get curved-outline edge meshes per cliff orientation, reusing the same Wang shape+rotation factoring. Cliff-grass + cliff-stone biome variants + corner caps so plateaus read as natural terraces, not raw extruded boxes.
- **S294-KABOOM-OUTLINE-TALL-OCCLUDER-GATE** — Outline silhouette only behind TALL occluders — gate the x-ray (GDP-2026-06-04-007) _(pending)_
  GDP-2026-06-04-007. The outline-occluder currently x-rays bombers behind ANY occluder including thin floor overlays / short blocks. Gate the silhouette so it only appears when the occluding geometry is actually TALL enough to hide the bomber (hard blocks, cliffs), not low terrain — so the outline reads as 'hidden behind a wall', not a constant ghost.
- **S295-KABOOM-STEP-JUMP-CLIFF-ANIM** — Step-jump animation — bombers auto-arc onto delta=1 cliffs with crouch+launch+landing (GDP-2026-05-28-015) _(pending)_
  GDP-2026-05-28-015. When a bomber moves onto a cell one height-step up, play an auto-arc hop: crouch anticipation, launch arc, landing settle. Builds on the S181/S182 step-jump tween + S267/S268 audio/landing-pop. Makes variable-height arenas read as climbable terraces.
- **S296-ENGINE-BILLBOARD-PRIMITIVE** — Engine world-space billboard primitive — engine/render/billboard/ for above-entity HUD (GDP-2026-05-27-008) _(pending)_
  GDP-2026-05-27-008. A reusable engine billboard primitive (camera-facing quad anchored above an entity) for above-head HUD elements (bluff tags, personality icons, damage numbers). Foundation work with a concrete first consumer: move the kaboom bluff/shift HUD tags from DOM overlay to world-space billboards.
- **S297-KABOOM-WALL-SHADOW-CURVED** — Wall-shadow overlay on the curved-outline pipeline — soft contact shadow under blocks/cliffs _(pending)_
  S287 added a box-based wall-shadow Wang layer; re-do it on the curved-outline builder so the darkening overlay near walls/cliffs reads as a soft organic contact shadow matching the new tile silhouettes, not a hard square.
- **S298-KABOOM-ALL-BIOMES-POLISH** — all-biomes-demo polish pass — height variation + path roads connecting rooms _(implemented)_
  Iterate the showcase arena: add a heightmap step (a low plateau) so cliff faces (S293) are exercised, route the path biome as actual connecting roads between biome rooms (floor-margined per C-2), and tune block layout for balanced play. Keep it in the match rotation.

### Out of scope

- Multiplayer parity sweep (GDP-2026-05-27-010) — networked, separate sprint
- Ragdoll physics engine module — depends on physics integration planning

### Notes

- Builds on the S178 curved-outline biome system. Closes the tile-edge contract (scene validation C-2), extends the pattern to cliff faces, and finishes the deferred visual-polish items (outline-occluder gating, step-jump cliff animation, billboard primitive).
- Sprint size target 8 (post-2026-05-13 doubled default). Mostly visual/terrain follow-ups from the GDP-2026-06-04 batch + a couple older deferred should-haves.
- Single sprint branch / atomic commits; per-story acceptance line for the QA terminal.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
