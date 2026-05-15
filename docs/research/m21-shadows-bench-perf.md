# shadows-bench shadow perf deep-dive (2026-05-15)

Filed candidate `SHADOWS-bench-perf-deepdive` from the S51 backlog. After
`shadows.autoUpdate: false` got removed in S51 (so moving cars + swaying
trees actually shadow correctly), the scene regressed in fps vs the
baked-shadow baseline. Measured 6 scenarios via
`scripts/perf-probe-shadows.mjs`.

## Setup

- Project: `examples/shadows-bench` baseline = current production config
  (PCSS + 3-cascade CSM + 1024 shadow map + FXAA + `autoUpdate: true`,
  305 entities through InstancedMesh path).
- Probe: `node scripts/perf-probe-shadows.mjs --durationMs 4000 --sampleMs 250`.
  Patches `project.json`, launches a fresh Chromium per scenario (so
  PCSS's one-way shader-chunk substitution can't carry over), samples
  `__agf.rendererInfo()` + `__agf.frameTiming()` every 250 ms for 4 s,
  restores config on exit (including SIGINT).
- Headless software-WebGL — directional perf numbers are reliable;
  absolute wall-clock differs vs desktop GPU. Repeat on the user's
  machine for VRAM / fill-rate effects (especially shadow-map size).

## Numbers

Means over 10–13 samples per scenario:

| scenario                  | drawCalls | triangles  | renderMs | frameUpdateMs | totalFrameMs |
|---------------------------|----------:|-----------:|---------:|--------------:|-------------:|
| **baseline** (PCSS+3c+1024) |    11    |  450 662  |   0.58   |     0.89      |    1.92      |
| pcf                       |    11    |  450 662  |   0.54   |     0.85      |    1.77      |
| 2 cascades                |     9    |  338 006  |   0.48   |     0.75      |    1.63      |
| 1 cascade                 |     7    |  225 350  |   0.47   |     0.78      |    1.65      |
| 512 shadow map            |    11    |  450 662  |   0.56   |     0.80      |    1.77      |
| pcf + 2c + 512            |     9    |  338 006  |   0.49   |     0.80      |    1.66      |

Deltas vs baseline:

| scenario              | renderMs | totalFrameMs | triangles |
|-----------------------|---------:|-------------:|----------:|
| pcf                   |  −6.5 %  |    −8.0 %    |    0 %    |
| 2 cascades            | **−17.1 %** |  **−15.3 %** |  −25 %    |
| 1 cascade             | −19.4 %  |   −14.3 %    |  −50 %    |
| 512 shadow map        |  −3.8 %  |    −7.7 %    |    0 %    |
| pcf + 2c + 512        | **−15.2 %** |  **−13.7 %** |  −25 %    |

## Hypothesis dispositions

From the 8 probes in `SHADOWS-bench-perf-deepdive`:

- **Cascade count = main lever (confirmed).** Each cascade is a full
  shadow-render pass; dropping 3 → 2 cuts ~17 % renderMs. 3 → 1 only adds
  another 2 pts (the main pass cost stays). This dominates everything else.
- **PCSS cost ≈ +6.5 %, not the big lever many expected (confirmed).**
  Substituted shader chunks are cheaper than feared on this scene; main
  fragment cost lives elsewhere. Don't dismiss PCSS for quality reasons.
- **shadowMapSize at 1024 → 512 saves ~4 % (confirmed, scoped).** Tiny on
  software-WebGL; should re-measure on real hardware where fill rate +
  VRAM bandwidth actually matter.
- **Program count flat (11 → 11) across all scenarios (confirmed).** No
  shader-program churn from BatchingSystem or CSM. Material rebuild
  hypothesis dismissed.
- **shadowNormalBias re-tune** — not measured (visual probe, not perf).
- **FXAA cost** — not measured. Held for follow-up; likely <0.05 ms.
- **Dev-overlay overhead** — not measured. Probe runs without the
  overlay open (Playwright doesn't trigger it), so baseline already
  excludes that bias.
- **Hybrid static/dynamic shadow update** — not measured (requires
  engine work, not a config probe). Becomes a story:
  `M21-shadow-static-caster-tag` — tag static entities, refresh their
  cascade contribution only when they enter/exit the cascade or
  geometry changes; keep moving entities on the per-frame path.

## Recommendation

Three real trade-offs for shadows-bench, sorted by visual cost:

1. **Keep baseline.** Cleanest picture; accept the ~25 % regression
   vs the previous baked-shadow build.
2. **PCF + 2 cascades + 512 map** → 15 % faster. PCF is sharper but not
   ugly; 2 cascades = decent for outdoor; 512 map noticeably softer at
   distance. **Cheapest visual hit per perf point.**
3. **1 cascade** → 19 % faster. Hard cliff at the cascade boundary,
   harsh visuals. Don't recommend.

Not changing `examples/shadows-bench/project.json` yet — config swap is
the user's call. Re-measuring on real hardware first would change the
ranking of the cheap levers (`512 map` likely gains relative weight).

## Follow-up stories worth filing

- **M21-shadow-static-caster-tag.** Reintroduce the static-shadow
  optimization without losing dynamic shadows. Tag entities as
  static (default) vs dynamic (cars + tweened trees). `autoUpdate=false`
  on the renderer; movement systems flip `renderer.shadowMap.needsUpdate`
  on the frame they actually move a shadow caster. Removes the per-
  frame shadow re-render for the ~290 static entities while keeping
  the moving 15 correct. Highest-impact follow-up.
- **M21-shadow-map-size-real-hw.** Re-run `512map` probe on desktop GPU
  — software WebGL undersells the fill-rate savings.
- **M21-fxaa-cost-isolation.** Probe FXAA on/off — confirms or rules
  out a ~0.05 ms tail.
- **M17-bvh-extension.** Adding the BVH extension to BatchedMesh could
  flip the path: "batched" crossover on this scene (see
  `m17-batched-vs-instanced-shadows-bench.md`).
