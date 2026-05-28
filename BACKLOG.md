# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S170 — Kaboom Crew Wang autotile integration — Stage 3 of GDP-2026-05-28-004

Status: **active** (started 2026-05-28). Source: `backlog/sprints/S170.sprint.json`.

### Stories

- **FEAT-KABOOM-WANG-LOOKUP-001** — Wang-bitmask → 4-variant lookup table for hard + soft blocks _(implemented)_
  examples/kaboom-crew/src/blocks/wang-family-lookup.ts (NEW). hardBlockBitmaskToVariant + softBlockBitmaskToVariant both delegate to a frozen 16-entry table: isolated→3, single-edge→0, two-edge / T-junction→1, surrounded→2. Defensive clamping mirrors the engine resolver. Pure helper buildWangTo4LookupTable() exposed for tests + diagnostics.
- **FEAT-KABOOM-WANG-FAMILIES-001** — registerKaboomWangFamilies — register kaboom-hard-block + kaboom-soft-block families _(implemented)_
  examples/kaboom-crew/src/blocks/register-wang-families.ts (NEW). Each family carries 16 variants; the meshKey of every entry is procedural:kaboom-{hard|soft}-block-N where N is the 4-variant index pulled from the lookup table. HMR-safe via try/catch on the duplicate-name guard.
- **FEAT-KABOOM-WANG-MESH-SYNC-001** — createKaboomWangMeshSyncSystem — bridge WangTile.currentVariantIndex → MeshRenderer.mesh _(implemented)_
  examples/kaboom-crew/src/systems/block-variant-system.ts (MODIFIED). The S165 random-per-cell rewrite was replaced with a two-step Wang pipeline. createKaboomBlockVariantSystem now stamps WangTile + WangTileFamilyMember; the engine resolver writes currentVariantIndex; createKaboomWangMeshSyncSystem (NEW, same file) maps the bitmask through the lookup table and writes procedural:kaboom-{hard|soft}-block-N onto MeshRenderer.mesh. Per-entity dedup keeps the per-frame cost at one map lookup once each cell has settled.
- **FEAT-KABOOM-WANG-BOOTSTRAP-001** — Register per-variant procedural mesh keys + engine resolver in bootstrap _(implemented)_
  examples/kaboom-crew/src/register-block-builders.ts (MODIFIED) — adds HARD_BLOCK_VARIANT_KEYS + SOFT_BLOCK_VARIANT_KEYS + 4 per-variant builders per family alongside the original family-keyed builders. examples/kaboom-crew/bootstrap.ts (MODIFIED) — scheduler order now: variant-system → engine.wang-tile-resolver → kaboom.wang-mesh-sync; attachUi calls registerKaboomWangFamilies after registerKaboomBlockBuilders.

### Notes

- Implements Stage 3 of GDP-2026-05-28-004 — Kaboom Crew adopts the engine Wang tile autotile primitive (S169) to drive per-cell mesh selection for hard + soft blocks. Stages 1 (variants) shipped in S165; Stage 2 (lighting) deferred to the lighting engine GDP-2026-05-28-001.
- Project-local 16→4 lookup table collapses Wang's 16-bitmask space onto the 4 procedural mesh builders S165 already ships: isolated→3, single-edge→0, two-edge / T-junction→1, surrounded→2. Hard + soft families share the same table.
- Engine resolver writes WangTile.currentVariantIndex (= the bitmask 0..15); a project-local mesh-sync bridge maps that through the lookup and writes procedural:kaboom-{hard,soft}-block-N onto MeshRenderer.mesh. The previous S165 random-per-cell rewrite was REPLACED, not run in parallel, so the two paths don't fight each other.
- Per-variant mesh keys (procedural:kaboom-hard-block-0..3 and soft-block-0..3) registered in addition to the existing family-level keys so the renderer caches 4 BufferGeometries per family.
- Family registration in attachUi is HMR-safe via a try/catch on the duplicate-name guard.
- Out of scope (will land in follow-up GDPs): lighting + shadows (Stage 2 / GDP-001), bomb point lights, pickup glows, per-arena themes, sub-variant random within Wang index, README + visual-style docs.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
