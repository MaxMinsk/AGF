# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S101 — procbomber-bench — sandbox for the procedural humanoid generator

Status: **active** (started 2026-05-21). Source: `backlog/sprints/S101.sprint.json`.

### Stories

- **CHORE-CHARACTERS-EPIC-ACTIVATE** — Flip KABOOM-CREW-CHARACTERS epic status to active _(implemented)_
  Epic was created in S100 with status 'planned'. This sprint is the first slice of that chain (mesh layer via the bench), so flip it to 'active'.
- **AGF-PROCMESH-REGISTRY** — Engine: procedural mesh dispatcher inside MeshHandleRegistry _(implemented)_
  Add a project-agnostic procedural mesh path: any `MeshRenderer.mesh` value starting with `procedural:<key>` resolves through a per-renderer registry of `(seedHash) => BufferGeometry` builders, instead of the hardcoded primitive switch. Builders register at bootstrap. Cache by `<key>:<seedHash>` so repeat acquires reuse the geometry. (Engine work driven by the KABOOM-CREW-CHARACTERS chain — stays project-agnostic.)
- **AGF-PROCMESH-DOCTOR-LINE** — Doctor: report registered procedural mesh keys + cache size _(implemented)_
  When the renderer exposes its procedural mesh registry, engine doctor prints `Procedural mesh registry: N key(s), M cache entries`. Suppress the line when N=0 (no project registered any).
- **PROCBOMBER-MESH-V0** — Pure humanoid mesh generator (head + torso + arms + legs) _(pending)_
  Pure function `generateBomberMesh(spec) => BufferGeometry`. Six merged box parts (head, torso, left/right arm, left/right leg). Vertex colors from the spec's palette. Deterministic given a seed. Unit-tested for vertex count bounds + head-y > torso-y > leg-y invariant. Lives at `examples/procbomber-bench/src/generators/bomber-mesh.ts`.
- **PROCBOMBER-PALETTE-TABLE** — Eight named palettes + seeded variant picker _(pending)_
  Palettes: sky, ember, mint, plum, sand, jade, rose, slate. Each is `{ head, torso, limbs, accent }` hex colors. `pickBomberPalette(seedHash, override?)` returns one. Pure, unit-tested.
- **PROCBOMBER-BENCH-PROJECT** — examples/procbomber-bench skeleton (scene, bootstrap, camera orbit) _(pending)_
  Vite-compatible AGF project under `examples/procbomber-bench/` with project.json, template.json, performance-budget.json, a `start.scene.json` containing one ground plane + one bomber entity using `mesh: "procedural:procbomber"`, bootstrap that registers the generator + drives a slow camera orbit so the bomber rotates in view.
- **PROCBOMBER-BENCH-UI-CONTROLS** — DOM overlay: sliders + palette dropdown + reroll button _(pending)_
  Plain HTML overlay (no UI framework) injected at bootstrap with: sliders for body-part size knobs (head, torso, arm-length, leg-length), a palette dropdown (8 options), a reroll button. Each control writes to the `ProceduralBomberSeed` ECS component on the bench's single bomber entity; the renderer re-acquires the procedural mesh on seed change.
- **PROCBOMBER-BENCH-ANIM-DROPDOWN** — Animation switcher: idle-bob + walk-swing stub animations _(pending)_
  DOM dropdown picks between {none, idle-bob, walk-swing}. A bench-local placeholder animation system reads `BenchAnimationState.kind` and drives Transform.position.y (bob) or arm/leg yaw (swing) per fixedUpdate. Idle-bob is sine on Y; walk-swing alternates limb yaw +/- 0.3 rad at 4Hz. These are stubs that prove the dropdown wires through the data path — the full S102 animation systems will replace them with proper limb-anchor animation.
- **PROCBOMBER-BENCH-PLAYTEST-SMOKE** — Playwright smoke: bench loads, every UI control responds _(pending)_
  Playtest scenario under `examples/procbomber-bench/playtests/` that opens the page, asserts the bomber mesh is in the scene snapshot, ticks each slider + palette + animation dropdown via DOM events, captures one screenshot per state transition. Adds the bench to the preflight smoke run.

### Notes

- User explicitly asked for a separate bench with sliders + animation toggle. Agent-first stays the default; this is an authorized human-UI exception driven by the need to iterate the generator visually before the polish bar is locked.
- Engine work in AGF-PROCMESH-REGISTRY must stay project-agnostic — no procbomber-specific strings in engine/ paths.
- GDP-009 (the full six animation ECS systems) and GDP-010 (procedural vocal synth) follow in later sprints. This sprint ships only the two stub animations needed to prove the bench dropdown.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
