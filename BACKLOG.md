# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S108 — Bomber facing direction + ragdoll ground clamp

Status: **active** (started 2026-05-22). Source: `backlog/sprints/S108.sprint.json`.

### Stories

- **KABOOM-BOMBER-FACE-MOVEMENT** — Bombers rotate to face their movement direction _(implemented)_
  User reported: bombers never turn — when walking right the body still faces forward. New project-local system reads GridMover state per bomber: when mid-lerp (currentLerp > 0), face the (targetGx - gx, targetGz - gz) direction; else when queuedDirection is non-zero, face that; otherwise preserve previous yaw. Writes Transform.rotation.Y on the root entity. yaw = atan2(dx, -dz) so -Z is 0° (default Three.js forward) and +X is +90°. Skips dead bombers so the ragdoll arc isn't fought.
- **KABOOM-RAGDOLL-GROUND-CLAMP** — Ragdoll stops rotating when the root lands on the floor _(implemented)_
  User reported: 'the ragdoll lacks a floor collider — the bomber rotates around the attachment point on the floor'. Today death-animation-system clamps root Y >= baseY but keeps integrating angular velocity forever — the body parts swing through the ground in arcs. Fix: detect the landed state (root Y at base + vy <= 0) and (a) zero angular velocity, (b) clamp Transform.rotation.X + Z to [-90°, 90°] so the body doesn't continue past 'lying flat'. The bomber settles into a final tumble pose. Pure addition to the existing system — no new component.
- **KABOOM-REMOTE-DETONATE-PRESS-SPLIT** — Space press places OR detonates, never both on the same press _(implemented)_
  Follow-up to S104 KABOOM-REMOTE-DETONATE-SPACE-BIND. The S104 fix made Space fire BOTH PlaceBombRequest + RemoteDetonateRequest on the same edge — but bomb-fuse-system's trigger pass then detonates the bomb that was JUST placed this frame. User sees the bomb appear-and-instantly-disappear. Fix: in player-input-system, when Space fires, check whether the player has any paused bombs (fuseRemaining=Infinity) already in the world. If YES → emit RemoteDetonateRequest only (the player is detonating their chain); if NO → emit PlaceBombRequest only. F key still always fires detonate explicitly. Result: tap-tap-tap places 3 paused bombs (one per press, charges permitting), the 4th press detonates the chain.
- **KABOOM-INPUT-DEAD-BOMBER-LOCKOUT** — Dead bombers ignore input (corpse can't steer mid-air) _(implemented)_
  Player-input-system was still writing GridMover.queuedDirection on dead bombers — the ragdoll arc kept logging keyboard updates. Fix: in the per-bomber loop, if BomberStats.alive === false → zero queued direction + skip all input writes (place/detonate/move). R-key restart still fires.
- **KABOOM-RAGDOLL-WALL-COLLISION** — Ragdoll stops at hard-block walls (grid-raycast, no Rapier) _(implemented)_
  User noted: 'will obstacles block them from flying over'. Current ragdoll is pure scalar math — no collision checks, the bomber could visually clip through walls. Add a simple per-fixedUpdate guard in death-animation-system: before writing nextPos, sample the destination cell via GridOccupancyQuery.blocked(gx, gz, 'blast'). If a hard-block sits there, zero the corresponding horizontal velocity axis (x or z) so the bomber stops along that direction but keeps falling. Cheap + project-local + no physics.
- **KABOOM-BENCH-EDIT-GAME-RECIPE** — Bench preset selector — load game characters into the editor + export URL _(implemented)_
  User asked: in the character editor be able to pick which bomber is used in-game (player.1, bot.1, eventually any registered character) and edit + save its recipe. MVP this sprint: bench panel gets a 'Preset' dropdown listing { custom, player.1, bot.1 }. Picking a preset writes resolveRecipeFromSeed(name) into the bench state (every slider snaps to the preset's value); picking 'custom' is a no-op. A new 'Copy recipe URL' button below the dropdown serialises the current bench state to a base64 recipe via stateToRecipe → encodeRecipe and copies `?project=kaboom-crew&recipe=<encoded>` to the clipboard. That URL is the canonical export — paste it into Kaboom Crew to USE the edited bomber. Disk-write workflow (a dev-bridge /__agf/recipe/save endpoint that persists into kaboom-crew/recipes/<owner>.recipe.json) deferred to a follow-up sprint — clipboard URL unblocks the immediate iteration loop.

### Notes

- Both stories pulled directly from user live-test feedback after S107 merged. Small focused sprint.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
