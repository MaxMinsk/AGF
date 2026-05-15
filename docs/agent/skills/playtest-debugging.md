# Skill: playtest-debugging

## Trigger

Use when a browser smoke test, robot playtest, screenshot or runtime interaction fails — or when you want to inspect the running game from an agent session without leaving the editor.

## Workflow

1. Read the failing test output + Playwright trace / screenshot artifacts under `test-results/`.
2. Reproduce locally with `npm run dev` and load `/?project=<id>` — or, for headless reproduction, `npm run engine:screenshot -- <id> --out test-results/<name>.png`.
3. Inspect runtime state through the `window.__agf` surface (DEV only) or the dev-bridge HTTP endpoints.
4. Compare expected vs actual world snapshot.
5. Use screenshots for canvas / visual failures; traces / videos for interaction timing failures.
6. Fix the smallest failing layer first: schema → core → adapter → visual polish. Never paper over with a wider try/catch or a disabled check.

## `window.__agf` cheat sheet

| Need | Call | Notes |
|---|---|---|
| ECS snapshot | `__agf.snapshot()` | Returns a serializable `WorldSnapshot` (entities + components + renderer / camera markers). |
| Diagnostics | `__agf.diagnostics()` | Retained diagnostic list (severity / code / source / message / suggestion). |
| Clear diagnostics | `__agf.clearDiagnostics()` | Subscribers stay alive. |
| Live diagnostics stream | `__agf.subscribeDiagnostics(fn)` | Returns an unsubscribe callback. |
| Apply commands | `__agf.applyCommands([...])` | Run any `EngineCommand` array as if it came from a system. |
| Reset round | `__agf.resetRound()` | Project-local action (beacon-world); returns mutation count, 0 for projects without one. |
| Save / load / clear | `__agf.save()`, `__agf.load()`, `__agf.clearSave()` | Backed by `project.persistence.components` allowlist. |
| Renderer info | `__agf.rendererInfo()` | Counters: `geometries / textures / programs / drawCalls / triangles / meshes / lights / shadowCasters / buckets / bucketInstances / batchedBuckets / batchedBucketInstances / handleLeak / gpuMs?`. `gpuMs` defined only when the WebGL2 `EXT_disjoint_timer_query_webgl2` is available. |
| Frame timing | `__agf.frameTiming()` | Windowed averages: `fixedUpdateMs / frameUpdateMs / renderMs / totalFrameMs / samples`. |
| Pick at NDC | `__agf.pick({ x, y })` | Ray cast from normalised screen coords; returns `{ entityId, point, distance }` or `undefined`. |
| Shadow controls | `__agf.renderer.invalidateShadowMap()`, `__agf.renderer.setShadowMapAutoUpdate(boolean)` | Manual control when `project.render.shadows.autoUpdate: false`. |
| Physics raycast | `__agf.physics.raycast({ origin, direction, maxDistance })` | Defined only when `project.physics.enabled: true`. |
| Physics debug overlay | `__agf.physics.setDebugOverlay(true)`, `__agf.physics.isDebugOverlayEnabled()` | Same gating. |
| Live tuner sliders | `__agf.dev.tuner.add({ name, target, min, max, step?, value?, label? })`, `.remove(name)`, `.removeAll()`, `.list()` | See `docs/agent/dev-tuner.md`. |
| Bug report copy | `__agf.copyDiagnostics()` | Returns the JSON string + best-effort clipboard write. |
| Renderer ready | `await __agf.rendererReady` | Resolves once the first frame draws AND every `project.render.criticalAssets` ref is loaded. |
| Asset HMR reload | `__agf.reloadAsset(ref)` | Drops cached binding, refetches on next frame. |
| Recording start / stop | `__agf.startRecording()`, `__agf.stopRecording()` | Used by the dev-bridge /recording routes. |
| Renderer warm-up trace | `__agf.lastReloadedAsset`, `__agf.reloadCount`, `__agf.reloadEvents` | HMR observation tools for tests. |

## Dev-bridge HTTP endpoints

All under `/__agf/*`; DEV-only.

| Endpoint | Purpose |
|---|---|
| `GET /__agf/health` | Liveness probe — Playwright uses this to short-circuit dev-server spawn. |
| `GET /__agf/snapshot` | Same shape as `__agf.snapshot()`. |
| `GET /__agf/diagnostics` | Retained diagnostics + reload events + renderer info. |
| `GET /__agf/renderer-info` | Just renderer info (fast path). |
| `GET /__agf/reload-events` | Append-only HMR reload log. |
| `GET /__agf/events` | SSE stream of live diagnostics + reload events. |
| `POST /__agf/commands` | Apply an `EngineCommand[]` from outside the page. |
| `POST /__agf/project-patch` | Deep-merge a JSON patch onto `project.json` on disk + Vite reloads. Used by shadow-tuner persistence. |
| `POST /__agf/asset/invalidate` | Same effect as `__agf.reloadAsset(ref)`. |
| `POST /__agf/recording/start` | Begin a recording. |
| `POST /__agf/recording/stop` | Stop and return the `Recording`. |
| `GET /__agf/bug-report` | Bundle: project meta + snapshot + diagnostics + renderer info + frame timing. |

Production builds drop the bridge plugin entirely; do not depend on these endpoints in shipped game code.

## Common debugging patterns

- **Renderer counters drifting.** `__agf.rendererInfo().handleLeak !== 0` means `MeshLifecycleSystem` and the registry disagree about mesh handles. Treat as a regression.
- **Black screen / no canvas.** Wait for `__agf.rendererReady`. If it never resolves, check `__agf.diagnostics()` for `AGF_RUNTIME_ASSET_LOAD_FAILED` (critical asset can't load) or `AGF_RENDERER_CONTEXT_LOST`.
- **Shadows stuck.** Toggle `__agf.renderer.setShadowMapAutoUpdate(true)` to confirm the manual control is the cause. `__agf.renderer.invalidateShadowMap()` forces one re-render.
- **Material doesn't paint.** `__agf.snapshot()` → find the entity → check `AppliedMaterialRef.status`. `pending` means it's still loading; `failed` means the manifest path doesn't resolve.
- **Drone refuses to move.** Confirm `__agf.snapshot()` shows `PlayerControlled` on the right entity; physics-driven projects need `__agf.physics?.setDebugOverlay(true)` to see the collider.
- **Idle scene draws too often.** `project.render.idleMode: "on-demand"` should skip frames; if it doesn't, a system is writing components on every frame (Spin, Tween, network adapter).

## Expected artifacts on test failure

- Screenshot at failure (Playwright config writes one automatically).
- Playwright trace on retry / failure.
- World snapshot via `engine inspect` against the running dev server, or via the bridge.
- Metrics JSON when the failure is performance-shaped.

## Verification

- Re-run the failing playtest.
- Re-run the smallest related unit test.
- For ECS regressions, the unit-test fixture set under `tests/unit/` is the right entry point — most behaviour has a focused test.
