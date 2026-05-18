# Backlog

This file is **generated**. The active sprint section between the marker pair below is rewritten by `npm run backlog:render` from `backlog/sprints/*.sprint.json`. Do not edit the content between the markers — the next render will overwrite it. Everything outside the markers (this preamble, the Next-Sprint placeholder at the bottom) stays as hand-authored Markdown.

<!-- backlog:render:start -->

## Current Sprint: S081 — Kaboom Crew pre-game platform — orthographic camera, damped follow, 2D HUD, grid primitives, generator framework

Status: **active** (started 2026-05-18). Source: `backlog/sprints/S081.sprint.json`.

### Stories

- **KABOOM-ORTHO-CAMERA** — Orthographic camera path in the render adapter _(implemented)_
  Today `ThreeRenderAdapter.acquireCamera` always constructs a `PerspectiveCamera`. Kaboom Crew's top-down arcade view + the existing `shadows-bench` RTS camera both want orthographic projection (cleaner gameplay readability, no foreshortening artefacts on the grid). Extend the scene `Camera` component schema with a `projection: "perspective" | "orthographic"` field (default perspective for backward compat); ortho mode reads `orthographicSize` + `near` / `far` from the same component. WebGPU + WebGL paths both honour the projection field. `engine inspect` reports it. Existing scenes keep perspective by absence; opting a scene into ortho is a one-line edit.
- **KABOOM-DAMPED-FOLLOW** — Damped follow camera system + `FollowTarget` / `CameraDamping` components _(pending)_
  Engine-level `DampedFollowCameraSystem` reads a `FollowTarget { entityId, offset, lookAtOffset }` and a `CameraDamping { positionTau, rotationTau, lookAheadMs }` component on a camera entity. Outputs a smoothed camera transform per frame (exponential damping driven by frameDeltaSeconds — works under variable frame time, unlike fixed-tau). Look-ahead extrapolates the target's recent velocity by `lookAheadMs`; Kaboom Crew uses ~120 ms. Lives under `engine/render/systems/damped-follow-camera-system.ts`. Bench-camera follow already exists for shadows-bench (RtsCameraSystem) — that one stays sample-local; this is the generic primitive every game can pick up.
- **KABOOM-HUD-RUNTIME** — 2D HUD runtime primitive (`engine/runtime/ui/`) _(pending)_
  Engine ships an HTML-overlay HUD primitive so games don't keep rolling ad-hoc DOM (beacon-world's HP/SIG widget pattern). The runtime mounts a single `<div data-agf-hud>` adjacent to the canvas, exposes `runtime.hud.add({ id, render, slot })` / `runtime.hud.update(id, data)` / `runtime.hud.remove(id)`. `slot` is one of `topLeft | topRight | bottomLeft | bottomRight | center`. Per-widget render is a pure function `(data) => string | HTMLElement`. Strict CSP-friendly (no innerHTML on raw strings — the runtime escapes); fully removable when the runtime tears down. Lives under `engine/runtime/ui/hud.ts`; DOM dependency stays inside this single file.
- **KABOOM-MINIMAP-WIDGET** — Generic minimap widget on top of the HUD runtime _(pending)_
  Project-agnostic minimap widget: a `<canvas>`-backed HUD slot that takes a list of `{ x, z, color, shape: dot | triangle | rect, size }` markers + a `bounds: { minX, maxX, minZ, maxZ }` and draws them at the configured slot. Project code queries the ECS each frame (cached query) and pushes the marker list via `runtime.hud.update`. Kaboom Crew's player / bots / objectives all share this one widget; no project-specific minimap implementation is needed. Lives under `engine/runtime/ui/minimap.ts` next to `hud.ts`.
  Depends on: KABOOM-HUD-RUNTIME.
- **KABOOM-GRID-POSITION** — `GridPosition` + `GridOccupant` components + `Grid` config schema _(pending)_
  Engine grid primitives: `Grid { cellSize, originX, originZ, sizeX, sizeZ }` lives on a scene-level config entity (or scene.metadata). `GridPosition { gx, gz }` carries the cell coordinates; `GridOccupant { layer, blocksMovement, blocksBlast }` describes how the entity interacts with grid queries. Conversion helpers `worldToGrid(grid, worldVec3): { gx, gz }` and `gridToWorld(grid, gx, gz): Vec3` ship as pure functions under `engine/core/grid.ts`. Schema validation on out-of-bounds cell ids. Lives under `engine/core/` because it's reusable across roguelike / tower-defense / RTS / Kaboom Crew.
- **KABOOM-GRID-OCCUPANCY** — `GridOccupancySystem` — sparse cell → entity index _(pending)_
  ECS system that maintains a `Map<cellKey, EntityId[]>` derived from every entity with both `GridPosition` and `GridOccupant`. Invalidates on add / remove / move. Exposes `runtime.grid.occupants(gx, gz, layer?)` for project code (Kaboom Crew bomb placement, blast propagation, AI danger-map all hit this). Cache lifetime survives HMR; `world.query` style cached handle. Authoring rule: project gameplay never calls `world.query()` over GridPosition entities — always hit `runtime.grid.occupants`.
  Depends on: KABOOM-GRID-POSITION.
- **KABOOM-GRID-MOVER** — `GridMover` component + `GridMovementSystem` (smooth tween between cells) _(pending)_
  Component shape: `GridMover { speed, queuedDirection: { dx, dz }, currentLerp: 0..1 }`. System interpolates the entity's render Transform between the start cell (gx,gz) and the target cell over `1 / speed` seconds, then snaps to the new GridPosition and pulls the next queuedDirection. Plays well with `GridOccupancySystem` (movement only commits to the new cell when free + not blocked). Lane-assist: if the queuedDirection's target is blocked, the system tries the perpendicular cardinal first (so you don't get stuck on a corner). Lives under `engine/core/systems/grid-movement-system.ts`. Project code (Kaboom Crew player controller, bot AI) writes `queuedDirection` from input; system does the rest.
  Depends on: KABOOM-GRID-POSITION, KABOOM-GRID-OCCUPANCY.
- **KABOOM-GENERATOR-FRAMEWORK** — Seed-driven procedural generator framework + first Kaboom Crew level template _(pending)_
  Generator framework lives under `engine/tools/generators/`. Surface: `generateScene({ seed, template, params }): SceneFile` where `template` is a registered generator function in a project's `bootstrap.ts`. Generators are pure functions (Mulberry32 PRNG) → JSON scene. Engine ships: (a) the PRNG primitive (already in `engine/core/random.ts`? check; add if missing), (b) a `validateGenerated(scene): Diagnostic[]` pass that runs the same `engine check` rules as static scenes, (c) one CLI: `engine generate <projectDir> --template <name> --seed <int> --out <file>`. First Kaboom Crew template: `kaboom-arena-small` — soft-blocks scattered around hard walls in a 15×11 grid with 1 player spawn + 1 bot spawn. The template generator lives under `examples/kaboom-crew/generators/`.
  Depends on: KABOOM-GRID-POSITION.
- **KABOOM-PROJECT-SCAFFOLD** — `examples/kaboom-crew/` project scaffold _(pending)_
  Scaffold `examples/kaboom-crew/` as an AGF project: `project.json` (id `kaboom-crew`, agfFormatVersion 1, render.mode webgpu, performance budget), `bootstrap.ts` (registers the generator + a Kaboom-Crew-local set of placeholder components for upcoming bomb / block work), `scenes/start.scene.json` (small primitive-only test arena loaded by the runtime), `assets/_sources/asset-sources.json`, `prefabs/` skeleton (one player capsule, one bot capsule, one soft-block cube, one hard-block cube). README points to `notes/DynaBomber.md` for the codename history + Kaboom Crew memory entry. `engine:check examples/kaboom-crew` passes. No gameplay code yet — that lands as S082+ stories.
  Depends on: KABOOM-ORTHO-CAMERA, KABOOM-DAMPED-FOLLOW, KABOOM-HUD-RUNTIME, KABOOM-GRID-POSITION.

### Out of scope

- Bombs, blasts, pickups, power-ups — all S082 work.
- Multiplayer, client prediction, snapshot relevance — KABOOM-CREW-MVP-1 epic.
- Procedural character generator — own epic, post-MVP-0.
- Decal-on-grid renderer / region rules (M27 / M28) — required for MVP 2, not MVP 0.

### Follow-ups already noted

- S082: bot AI primitives (danger map + basic pathfinding), bomb / blast / pickup pipeline as project-local Kaboom Crew systems, win/loss state.
- Procedural character generator (the standalone tool) stays parked until MVP 0 ships; capsule placeholders are fine for now.
- Audio system stays out of MVP 0 — sound is part of MVP 2.

### Notes

- First sprint with the new epic graph in place — every story tags KABOOM-CREW-MVP-0 so the doctor + the HIGH_LEVEL_BACKLOG view rolls them up automatically.
- Order-of-operations rationale lives in notes/dynabomber-readiness-analysis.md §11.

<!-- backlog:render:end -->

## Next Sprint (placeholder)

After S78 lands the backlog engine, the next sprint is the DynaBomber pre-game platform: `BACKLOG-NEXT` + `BACKLOG-CLI-MUTATE` from this sprint's follow-ups, then `DYN-ortho-camera` / `DYN-damped-follow` / `DYN-2d-hud-runtime` / `DYN-grid-primitives` from `notes/dynabomber-readiness-analysis.md` §11.
