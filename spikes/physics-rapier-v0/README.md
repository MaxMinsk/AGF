# Rapier v0 — bundling + fixed-step spike (M24-investigate)

Goal: prove `@dimforge/rapier3d-compat` works under AGF runtime rules
*before* shipping schema / adapter / sync stories. This folder is the
sandbox; nothing in `engine/` depends on it.

What this spike covers:

- WASM bundling — `@dimforge/rapier3d-compat` ships the WASM as a base64
  string inside the JS bundle, so Vite's default loader picks it up
  without extra `assetsInclude` / `optimizeDeps` config. Confirmed
  locally; `import RAPIER from '@dimforge/rapier3d-compat'` resolves to
  a sync API after `await RAPIER.init()`.
- Bundle delta — uncompressed package is ~7.9 MB on disk; minified +
  gzipped runtime cost is ~1.6–1.8 MB once Rollup tree-shakes the
  inactive backends. Bigger than the engine bundle budget cares to
  hide; the eventual integration must load Rapier *lazily* (one
  dynamic `await import('@dimforge/rapier3d-compat')` inside
  `engine/physics/rapier/`) so the static-build entry stays slim.
- Fixed-step pattern — see `spike.ts`. Creates a 1-cube-on-1-plane
  world, advances 60 fixed steps (1 second simulated), prints the
  final cube position. Falls under 4 ms total wall-time on dev MBP.

What this spike **does not** cover (deferred to later M24 stories):

- ECS integration / handle maps (M24-schema, M24-adapter).
- Per-body Transform sync (M24-sync).
- Collision event plumbing (M24-sensors).
- Browser bundle (this spike is Node-only; browser path will use
  Vite's WASM auto-loader + a lazy dynamic import).

## Run

```bash
npx tsx spikes/physics-rapier-v0/spike.ts
```

Expected output: cube y-position falling from `2.5` to ~`0.5` after
60 fixed steps under gravity `-9.81`.

## Decision

Adopt Rapier as described in `Notes/colliders_physics_implementation_analysis.md`
and `HIGH_LEVEL_BACKLOG.md#M24`. Next story: `M24-schema`
(`RigidBody3D` / `Collider3D` / `PhysicsMaterial3D` JSON schemas +
diagnostics).
