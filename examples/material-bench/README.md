# examples/material-bench/

PBR + VFX showcase for AGF. A large chrome sphere in the centre of 12 smaller spheres orbiting on a ring; every sphere stands on a short cement cylinder pedestal; 12 stonehenge stone columns sit around the perimeter; a Venice-sunset HDR drives IBL and a GroundedSkybox; reflection probes feed envmap on the chrome + the orbit ring; ACES tone-mapping + a touch of bloom polish the highlights.

Sibling of `shadows-bench` (CSM), `batch-bench` (renderer batching), `physics-bench` (Rapier), `water-bench` (planar mirror).

## Run

```bash
npm run dev
# open http://localhost:5173/?project=material-bench
```

## What it shows

| VFX surface | Where to look |
| --- | --- |
| HDR + IBL + GroundedSkybox | sky disc, pedestal contact, HDR sunset across the spheres |
| Reflection probe (PMREM) | centre chrome sphere — reflects orbit ring + stonehenge columns, prefiltered for roughness 0.35 |
| Reflection probe (mip-cube) | front + back side probes — feed the orbit-ring outer spheres |
| Multiple PBR materials | 12 outer materials — plastic / steel / gold / car-paint / glass / velvet / iridescent / hardwood / brick / ice / copper |
| Stone bumpMap + roughnessMap | stonehenge columns at radius 11 |
| Shadows on virtual ground | GroundedSkybox `ShadowMaterial` catcher under the sphere ring |
| ACES tone-mapping + bloom | chrome rim highlight, gold sphere edge |

## What ships under the hood

- **`scene.environment.kind: "hdr"`** + `groundedSkybox: { height: -0.75, radius: 60 }` (`scenes/start.scene.json`).
- **3 reflection probes** (`bootstrap.ts`): the chrome ball's own probe at world centre (`prefilter: "pmrem"`, 128² @ 15 Hz), plus `probe.front` and `probe.back` at (0, 1, ±5) feeding outer-ring spheres by initial-angle hemisphere.
- **Bloom post-pass** (`project.json#render.post`): `{ strength: 0.35, radius: 0.55, threshold: 0.92 }` — hero-highlight-only, not "everything bloom".
- **ACES Filmic tone-mapping** + `transmissionResolutionScale: 0.5` so the glass sphere isn't pricey.
- **Stone material** (`assets/runtime/materials/stone.material.json`): grey base + brick_bump + brick_roughness over the cylinders.

See `docs/agent/skills/vfx-authoring.md` for the per-surface authoring guide and `docs/adr/0013-reflection-probe-system.md` for the reflection-probe design rationale.

## FPS knobs

material-bench is FPS-tight on integrated GPUs. The dials worth turning:

| Knob | File | Default | Effect |
| --- | --- | --- | --- |
| Probe resolution | `bootstrap.ts` `ReflectionProbe.size` | 128 | 64 → faster, 256 → sharper, ~4× cost |
| Probe update rate | `bootstrap.ts` `updateRate` | 15 / 30 Hz | Drop to 15 across the board if FPS dips |
| PMREM prefilter | `bootstrap.ts` centre probe `prefilter` | `pmrem` | Drop to `mipmap` to halve the chrome-probe cost (rougher reflection at 0.35) |
| Transmission scale | `project.json#render.color.transmissionResolutionScale` | 0.5 | Halves the glass sphere's pre-pass cost |
| Bloom strength / threshold | `project.json#render.post[0]` | 0.35 / 0.92 | Drop strength to 0 to disable bloom |
| Outer ring count | `bootstrap.ts` `OUTER_MATERIALS` length | 12 | Trim materials list to drop spheres |
| Stonehenge count | `bootstrap.ts` `STONE_COLUMN_COUNT` | 12 | 6–8 still reads as a perimeter |

`__agf.rendererInfo()` exposes the probe + prefilter numbers directly: `{ reflectionProbes, prefilterMs, planarMirrors }` (S59).

## Performance budget

`performance-budget.json` is rebaked for the S57 + S58 surface. Run `npm run engine:check -- examples/material-bench` after any addition to confirm the soft / hard ceilings still fit.

## What this project is NOT

- Not a tutorial — read the skill memo for that.
- Not a level — there's no gameplay loop, no input.
- Not a place to test gameplay code — keep the PBR / VFX signal clean.
