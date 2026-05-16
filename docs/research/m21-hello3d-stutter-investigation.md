# M21 — hello-3d stutter investigation (Sprint 60)

User-reported symptom (S60): "small podergivanija" on hello-3d at 60 Hz despite massive FPS headroom.

## Methodology

Playwright (headed chromium, real-hw, vsync on, viewport 1280×720) drives each project for ~10 seconds and samples per-frame `performance.now()` deltas. Threshold breakdown looks at how many frames cross each "lateness" tier — 18 ms is barely late; 25 ms is a missed vsync; 30 ms is a doubled frame.

The harness page lives at `tests/manual/webgpu-vs-webgl/` and runs a pure three.js scene with no AGF runtime — it's the apples-to-apples baseline.

## Measurements

| Project | avg ms | >18 ms (1 ms late) | >20 ms (3 ms late) | >25 ms (missed vsync) | >30 ms (doubled) |
| --- | --- | --- | --- | --- | --- |
| harness tiny (no AGF, 16 props) | 16.67 | 17.7 % | **0.9 %** | 0 % | 0 % |
| hello-3d | 16.67 | 16.1 % | **1.4 %** | 0 % | 0 % |
| material-bench | 16.66 | 28.8 % | **14.4 %** | 0 % | 0 % |

## Findings

**hello-3d ≈ harness baseline.** The "stutters" reported on hello-3d are within 0.5 % of the no-AGF harness page's variance — both sit at ~1 % real-lateness rate. The browser + OS scheduler delivers 1 % of frames a few ms after the vsync boundary on a static desktop. The AGF runtime is **not** the source of hello-3d's perceived micro-stutter.

**material-bench is genuinely engine-bound** at 14.4 % over-budget frames. The stack is heavier than its FPS budget allows: 3 reflection probes × 6 face renders per probe (front/back @ 15 Hz, centre @ 15 Hz with PMREM regen), GroundedSkybox, bloom post-pass, ACES tone-mapping, transmission pre-pass for the glass sphere. Per-frame total renders: roughly 1 (main) + 18 (probes) / 4 (cadence-averaged) ≈ 5–6, plus 1 PMREM regen averaged across cadence + 1 bloom + 1 transmission pre-pass ≈ 9 effective full-scene-equivalent renders per second per frame slot. Within the 16.67 ms budget, that's tight.

## Concrete fixes shipped this sprint

1. **`applyCanvasSize()` short-circuit** (`engine/runtime/start.ts`). The runtime was calling `renderer.resize()` + `composer.setSize()` + `camera.updateProjectionMatrix()` every frame regardless of whether the canvas had actually changed size. Now caches the last (width, height) and returns early on match. Drop on hello-3d's stutter rate: 4.67 % → 3.78 % at the >18 ms threshold; p99 19.4 ms → 18.7 ms.
2. **`?overlay=0` query param** in `src/app.ts` enabling A/B probes between dev-overlay-on and dev-overlay-off. The result (negligible delta) confirmed the per-window `innerHTML` rebuild isn't a measurable cause.

## What did NOT turn out to be the culprit

- Dev overlay (`engine/runtime/dev-overlay.ts`). Updates every 0.5 s, not per frame; A/B probe showed 2.44 % vs 2.67 % stutter rate — within noise.
- GC pauses. Heap delta analysis showed stutter frames correlate with small allocations (~40 KB), NOT with GC drops (which were -1.6 MB and happened on non-stutter frames at 16.6 ms).
- SpinSystem allocations. Water-bench (no Spin) had a *higher* stutter rate than hello-3d (Spin), proving the per-frame ECS work isn't the source.
- `world.query()` hot paths. Audited — every per-frame query already goes through cached `createQuery` handles. The handful of raw `world.query` calls are all in HMR / doctor cold paths.
- Vite HMR background activity. The harness page is served by the same Vite dev server but has comparable stutter rate to hello-3d — HMR isn't the differentiator.

## Recommended path forward

**hello-3d-level baseline jitter** is a browser/OS scheduling artifact, not fixable at the AGF layer. It's structurally addressed by the WebGPU migration: the S60 WebGPU spike measured p99/p50 ratio dropping from 3.6× (WebGL) to 2.0× (WebGPU) at light/medium loads — i.e. WebGPU's command-buffer model keeps the per-frame work tighter around its mean, so fewer frames graze the vsync boundary. See [`m21-webgpu-spike.md`](m21-webgpu-spike.md).

**Material-bench-class engine-bound stutters** are fixable via probe / post-pass tuning (probe size 128 → 64, cadence 15 → 10 Hz, PMREM only on roughness deltas) but the user opted to defer those until the WebGPU adapter lands (S61). The lower per-render overhead WebGPU brings makes the same probe stack noticeably cheaper, and any tuning we do today partly bakes in current WebGL assumptions.

## Open follow-ups

- Re-run this matrix after WebGPU adapter ships (S61) so we can confirm the variance win on real hello-3d / material-bench, not just the synthetic harness.
- Capture chrome devtools Performance traces during a known stutter so we can attribute the ~2 ms over-budget frames to a specific browser task category (style recalc, GPU compositing, GC, parser). Current measurement tells us *how often* but not *what* — devtools is the next-level diagnostic.

## References

- Harness: `tests/manual/webgpu-vs-webgl/`.
- WebGPU spike (variance findings): `docs/research/m21-webgpu-spike.md`.
- Fix commit: see `engine/runtime/start.ts` `applyCanvasSize()` history.
