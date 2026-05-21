# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S106 — Accessory layer — 5 starter accessories + mount sockets + recipe field + spring sway

Status: **active** (started 2026-05-22). Source: `backlog/sprints/S106.sprint.json`.

### Stories

- **KABOOM-ACCESSORY-MOUNT-SOCKETS** — 5 named mount sockets on the bomber tree (head.crown / head.eyes / torso.back / torso.sideL / torso.sideR) _(implemented)_
  Promoted from GDP-2026-05-22-003. Extend the procbomber-bench bomber-tree-spawner with mount socket positions computed from sizes. The sockets are LOCAL positions in the parent mesh's frame: head.crown sits on top of head, head.eyes on its front face, torso.back on the back face, torso.sideL/R on the side faces. Pure positional helpers + tests; no entities created yet.
- **KABOOM-ACCESSORY-CATALOG** — 5 starter accessory mesh generators (antennae / visor / backpack / cap / fins) _(implemented)_
  Promoted from GDP-2026-05-22-003. Each accessory exports a pure `generate<Name>Accessory(palette)` returning one BufferGeometry. All share the existing 8-channel palette (accent for highlights; head/torsoTop for body fill). Antennae = 2 thin cylinders on head.crown. Visor = wide thin box across head.eyes. Backpack = small box on torso.back. Cap = wide shallow capsule on head.crown. Fins = pair of triangular plates on torso.sideL+R. Pure helpers + tests for vertex counts + color usage.
- **KABOOM-ACCESSORY-RECIPE-FIELD** — CharacterRecipe.accessories field + codec round-trip _(implemented)_
  Extend CharacterRecipe schema + TypeScript type with `accessories?: BomberAccessory[]` where BomberAccessory = { kind: AccessoryKind, mountSocket?: MountSocket }. AccessoryKind = 'antennae' | 'visor' | 'backpack' | 'cap' | 'fins'. Default mount per kind (cap → head.crown, etc); explicit mount override permitted (visor → torso.back for cosmetic-only debug). Validator accepts 0..3 accessories per recipe. encodeRecipe / decodeRecipe round-trips. resolveRecipeFromSeed picks 0..2 accessories deterministically from the seed.
- **KABOOM-ACCESSORY-SPAWNER** — Bomber tree spawner adds accessory entities under their mount sockets _(implemented)_
  spawnBomberTree extends to also walk `recipe.accessories` and spawn one entity per accessory: parented to the named mount socket's parent mesh entity (head / torso), with the socket's local position offset, MeshRenderer pointing at `procedural:procbomber-accessory-<kind>` (six new procedural mesh keys registered by bench / kaboom-crew). Each accessory carries a 'SoftAttached' tag component so the spring system can apply secondary sway. Per-recipe accessory list returned from the spawner so the bench rebuild loop can iterate them.
- **KABOOM-ACCESSORY-SOFT-ATTACH-SWAY** — Soft-attached entities sway via SpringPivot driven by parent motion _(implemented)_
  When a SoftAttached entity's parent moves or rotates between fixedUpdates, infer an angular nudge (velocity delta) and stamp it into the entity's SpringPivot.velocity. The spring-pivot-system (from S105) then decays it back to rest. Net effect: accessories visibly trail behind their parent's motion — cap wobbles when bomber walks, fins flex on direction change. Per-entity tracking of parent's last-frame world transform via a small cache in the system.
- **KABOOM-ACCESSORY-BENCH-CONTROLS** — Bench overlay gains an Accessories section — 3 multi-select dropdowns _(pending)_
  DOM overlay extension. New 'Accessories' section between Shape and Palette. Three independent dropdowns (slot 1 / slot 2 / slot 3); each picks one of {none, antennae, visor, backpack, cap, fins}. State written to bench-state.accessories; rebuild loop re-runs the spawner under a transient 'accessories' branch (delete + recreate accessory entities only — keep the body tree). Pure DOM cosmetics + 1 unit test on the dropdown wiring.
- **KABOOM-ACCESSORY-KABOOM-RECIPE-WIRE** — Kaboom Crew's makeKaboomRecipe seeds 0..2 accessories per bomber _(pending)_
  examples/kaboom-crew/bootstrap.ts: makeKaboomRecipe(ownerId) currently sets only paletteName. Extend it to call resolveRecipeFromSeed so player.1 and bot.1 each get their seed-derived 0..2 accessories. Visual outcome: in-game bombers have visible variety beyond palette — one carries a backpack, the other wears a cap, etc.

### Notes

- S105 deferred this — accessories needed their own focused sprint where each socket + each accessory gets a unit test and the bench previews each variant.
- Builds on S102's mesh tree + S102's 8-channel palette + S104's CharacterRecipe + S105's SpringPivot system.
- GDP-2026-05-22-004 hit-recoil still deferred — current Kaboom is 1-hit-death, no survival case to recoil from.
- Limit accessories to 3 per bomber for budget — 19-entity tree + 3 accessories = 22 entities per bomber × 4 bombers = 88 entities. Still well under the doctor's batch budget.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
