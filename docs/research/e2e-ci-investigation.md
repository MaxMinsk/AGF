# E2E on CI — root-cause investigation (Sprint 46)

Date: 2026-05-15
Trigger: Sprint 44 added a separate `e2e.yml` workflow that runs Playwright on every PR. The first ~6 CI runs (PRs #47, #48, post-merge `main`) all reported the **same ~10 specs** failing with timeouts. Locally on macOS the same specs pass in 5–15s each.

This document records the actual root cause + the Sprint 46 cleanup that turns the e2e workflow into a useful PR gate.

## Failure inventory

Pulled from `gh run view --log-failed 25887899164` (e2e run on `main` after PR #48 merge). Total: 26 specs scheduled, **10 fail repeatedly**, 16 pass.

| Spec | Local | CI | Pattern |
|---|---|---|---|
| `app.spec.ts` | OK | flaky (passes on retry) | canvas paint check; rendererReady was added in S43, retry covers cold-boot. |
| `beacon-world-gameplay.spec.ts` | OK 5–10s | **fail 36s** | `waitForFunction(Carrier.carrying === "core.north", { timeout: 5000 })` — pickup system races scene-load. |
| `beacon-persistence-reload.spec.ts` | OK | **fail 30s** | After `page.reload()`, `waitForFunction(__agf.snapshot, { timeout: 5000 })` — 5s too tight for Vite re-warm. |
| `dev-tuner.spec.ts` | OK | flaky (56s; passes on retry) | gameplay-heavy; rendererReady not awaited. |
| `hello-3d-hierarchy.spec.ts` | OK | **fail 10s** | `expect.poll({ timeout: 5000 })` against full entity list — scene-load slow on first hit. |
| `material-hmr-audit.spec.ts` | OK | **fail 1.1m** | Iterates every Beacon material, edits each file, waits for HMR event. File-watcher coalesces under SwiftShader load. |
| `playtest-runner pickup-cycle` | OK | **fail 30s** | Playtest steps use `"wait", "seconds": 0.15` — physics step misses on first scene-load. |
| `project-switcher KeyD` | OK (S44 timeout-bump helped) | **fail 35s** | Drone X-position check uses 5s waitForFunction; physics not yet running. |
| `score-pulse.spec.ts` | OK | **fail 43s** | HUD pulse check 5s after gameplay applyCommands; same race. |
| `hmr-stress.spec.ts` | OK 30–45s | **fail 1.6m** | Writes 30 materials sequentially; SwiftShader software-WebGL + parallel renderer redraws miss reload events. |
| `multiclient-roundtrip.spec.ts` | OK | **fail 1.1m** | Spawns Node backend + 2 chromium contexts; backend boot is slow on Ubuntu runner. |

## Hypotheses checked

### H1: SwiftShader software-WebGL is the bottleneck
**Partially confirmed.** Ubuntu runners ship without a real GPU; Chromium falls back to SwiftShader. Render of a 12-entity Beacon scene at 60 fps becomes ~10–15 fps. This widens *every* "wait for scene to stabilise" budget by 3-5×.

Evidence: `dev-bridge` specs (which never read pixels and don't gate on rendererReady) pass in 13s consistently. Specs that depend on the renderer drawing a frame before the assertion lands all fail.

### H2: Vite cold-boot dominates the first navigation
**Confirmed.** First `page.goto` after the dev server starts takes 3–6s for the project bundle alone (cold cache, full TypeScript transform of `engine/`, `examples/<project>/`, Three.js, Rapier). Each subsequent navigation is ~1s. Tests that do back-to-back `goto()` against a fresh dev server compound this.

### H3: Per-test 5s waitForFunction timeouts are too tight
**Confirmed and is the dominant cause.** Most failing specs assert state 5s after an `applyCommands`. Locally the physics system finishes one fixed step in 16ms, so the carry/repair flag flips well before 5s. On CI the chain (scene-load → first scheduler tick → first fixedUpdate batch) can take 4–8s, sometimes >5s. The S44 outer `timeout: 60_000` bump helped per-test runtime but did **not** raise the inline `{ timeout: 5_000 }` ceilings inside the specs.

### H4: Real races (a regression masquerading as a flake)
**Ruled out.** Every failure either:
- Times out at a `waitForFunction` (no expectation evaluated), or
- Reads a snapshot exactly once and the snapshot is too early.

No spec saw "wrong value" failures — only "did not reach value in time" failures. There is no production-code regression.

### H5: Playwright browser install cost
**Ruled out.** `npx playwright install --with-deps chromium` runs once per workflow (logged at 24–28s). Tests run after install; the install time is not counted against any test's budget.

## Verdict

The failures are **timeout calibration**, not regressions. Two structural fixes resolve them at root:

1. **Replace the per-test inline 5s budgets** with a shared helper that gates on `__agf.rendererReady` + the **first fixed-physics step** (so the `Carrier`/`Repairable` predicates have at least one tick to flip). Cap at the outer Playwright timeout (60s) so a real hang still fails fast.
2. **Move pixel-gameplay specs to `vite preview` (production build)**. The build is bundled, single-static-import, no per-request TypeScript transform. CI cold-boot drops from 4–6s to ~300ms; SwiftShader load is the only remaining variable.

Stay on dev-server only for the HMR / dev-bridge specs that *require* HMR (`hmr-stress`, `glb-hot-reload`, `material-hmr-audit`, `hazard-material-hmr`, all `dev-bridge.spec.ts` scenarios). Everything else moves to preview.

## Action plan (Sprint 46)

| Story | Outcome |
|---|---|
| `CI-e2e-artifacts` | Failure-fixture captures trace, screenshot, browser console, `__agf.diagnostics()`, `__agf.rendererInfo()`, `__agf.frameTiming()`. Upload as artifact. |
| `CI-e2e-helpers` | `tests/e2e/_shared/agf.ts` exports `waitForAgfReady(page)` (rendererReady + first fixed tick) and `waitForAgfState(page, pred, { timeout })` that respects the outer test timeout. Refactor failing specs onto these helpers. |
| `CI-e2e-preview-mode` | New Playwright project `chromium-preview` that runs against `vite build` + `vite preview`. Default for all non-HMR specs. |
| `CI-e2e-required-smoke` | ≤6 specs that must be green on every PR (app, project-switcher×2, dev-bridge×1, hello-3d-hierarchy, playtest-hazard). Defined via `testMatch`. |
| `CI-e2e-full-nightly` | Full Playwright suite runs nightly (cron) and on `workflow_dispatch`. PR gate is the smoke project only. |

## What stays out of scope

- Rewriting `hmr-stress.spec.ts` to not depend on file-watcher coalescing. The watcher behaviour on Linux + SwiftShader is the underlying issue; a sane fix would be a programmatic HMR-trigger via the dev bridge (`POST /__agf/asset/invalidate`), but that's a follow-up sprint (`OSS-e2e-bridge-hmr`).
- Migrating the workflow to a self-hosted runner with a real GPU. Tracked as `CI-e2e-gpu-runner` parking lot — only worth doing once macOS/macbookpro runners are in the GitHub matrix.
- Splitting `multiclient-roundtrip` into per-client specs. Today's structure is fine; it just needs `waitForAgfReady` on both pages and a bumped backend-boot timeout.
