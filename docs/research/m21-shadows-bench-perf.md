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

## Sprint 52 — M21-shadow-static-caster-tag landed

Shipped `ShadowCaster { dynamic: boolean }` component + `DynamicShadowSystem`
(`engine/render/systems/dynamic-shadow-system.ts`). System is dormant
unless the scene tags ≥1 entity as `dynamic: true`; when it sees one
it flips `renderer.shadowMap.autoUpdate = false` and calls
`invalidateShadowMap()` only on frames where a tagged entity's
LocalToWorld actually changed (epsilon 1e-5). 5 unit tests cover the
contract (dormant / first-bake / move-triggers / static-ignored /
tag-removal-restores-autoUpdate).

shadows-bench tags applied: 6 cars + ~80 tree roots. The remaining
~290 entities (buildings, rocks, lampposts, plaza props, ground,
trunks, canopies, car body/cabin/wheels children) stay untagged →
static.

Live probe (4 s × 250 ms samples, headless software-WebGL, scene
grew from 305 → 327 bucket instances after S52 composition story):

|                  | renderMs | totalFrameMs |
|------------------|---------:|-------------:|
| S51 baseline (autoUpdate=true, no tag, 305 instances) |  0.58  |  1.92  |
| S52 with tag    (autoUpdate=false, 327 instances)     |  **0.48**  |  **1.82**  |
| Delta            |  **−17 %**  |  **−5.2 %**  |

The drop happens even though shadows-bench cars + trees move every
frame (both well over the 1e-5 epsilon). Hypothesis: three.js's
`autoUpdate=true` path issues a slightly heavier shadow-pass
dispatch than `autoUpdate=false + needsUpdate=true` does, so even a
"invalidate every frame" pattern saves overhead. The real payoff
will be on scenes with idle dynamic casters (beacon-world drone,
NPC patrols) where many frames skip the invalidate entirely — those
should approach the original baked-shadow perf.

## Sprint 52 — M21-fxaa-cost-isolation result

Added a `noFXAA` scenario to `scripts/perf-probe-shadows.mjs` (patches
`render.post = []`). Measured on the post-S52 shadows-bench (sky
gradient + lampposts + plaza props + tagged dynamic casters; 327
bucket instances):

|                  | drawCalls | renderMs | totalFrameMs |
|------------------|----------:|---------:|-------------:|
| baseline (FXAA on) |   12     |   0.49   |   1.76      |
| noFXAA           |   10     |   0.42   |   1.63      |
| Δ                |   −2     | **−14 %**  |  **−7.6 %**   |

The original hypothesis (< 0.05 ms) was wrong by roughly an order of
magnitude — FXAA + its supporting OutputPass + composer dispatch is
~0.07 ms per frame on this scene, ~14 % of renderMs. Two draw calls
disappear when the post chain empties: the FXAA quad and the
composer's appended OutputPass.

This means FXAA is the second-largest single perf lever after cascade
count (cascade 3 → 2 saved ~17 %, FXAA-off saves ~14 %). Project teams
that don't strictly need antialiasing for their visual style can
remove it as a meaningful win.

## Sprint 53 — BEACON-shadow-caster-tag confirms the idle-caster hypothesis

S52's `M21-shadow-static-caster-tag` landed the mechanism but only
saw `−17 %` renderMs on shadows-bench because cars + trees move every
frame. The note predicted the real payoff was on scenes with idle
dynamic casters. S53 measured beacon-world (drone sitting still, no
key presses) with `scripts/perf-probe-beacon-tag.mjs` (toggles
`ShadowCaster { dynamic: true }` on `player.drone`, reloads, samples):

| metric         | tag absent | tag on | Δ       |
|----------------|-----------:|-------:|--------:|
| drawCalls      |    39      |    6   | **−85 %** |
| triangles      | 1 156      |  136   | **−88 %** |
| renderMs       |   0.41     |  0.26  | **−37 %** |
| totalFrameMs   |   0.79     |  0.61  | **−22 %** |

The 39 → 6 drawCalls drop reflects the directional + 2 point lights
in beacon-world skipping their shadow re-bake: with `autoUpdate=true`
each light's shadow map renders the whole scene every frame; once
the only `dynamic` caster (the drone) sits still, `DynamicShadowSystem`
keeps `shadowMap.autoUpdate=false` and never invalidates, so all
three lights skip the shadow pass entirely. As soon as the drone
moves, the tag flips back to dirty and the per-frame bakes resume.

Acceptance from Story 10's backlog spec (≥ 25 % renderMs drop) is
**exceeded** (−37 %). The hypothesis is confirmed: tag-driven
shadow update is the right primitive for player-focused scenes; the
right place to scale it next is multiplayer (NPCs / projectiles).

## Future follow-ups
- **M21-shadow-map-size-real-hw.** Re-run `512map` probe on desktop GPU
  — software WebGL undersells the fill-rate savings.
- **M21-fxaa-cost-isolation.** Probe FXAA on/off — confirms or rules
  out a ~0.05 ms tail.
- **M17-bvh-extension.** Adding the BVH extension to BatchedMesh could
  flip the path: "batched" crossover on this scene (see
  `m17-batched-vs-instanced-shadows-bench.md`).
