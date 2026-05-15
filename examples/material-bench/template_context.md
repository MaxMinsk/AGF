# Material Bench — Template Context

PBR material showcase. A large chrome sphere sits on a cement cylinder pedestal in the centre, with 12 smaller spheres on smaller cement cylinders arranged in a ring around it. The whole ring is parented to `spheres.root`, which carries an engine `Spin` component so the group rotates around the Y axis under the engine's `SpinSystem`. HDR environment (`venice_sunset_1k.hdr`) + ACES filmic tonemap give the materials something interesting to reflect.

## Vocabulary

- **spheres.root** — empty entity at world origin with `Spin { axis: "y", speed: 14 }`. Every pedestal + sphere is parented to it via `Transform.parent`, so they orbit when it spins.
- **sphere.centre** — chrome sphere (`m0-chrome`), scale 2.0 (radius 1.0).
- **sphere.NN** — outer-ring spheres, scale 1.0 (radius 0.5). NN = 01..12, slot N uses material `mN-...`.
- **pedestal.centre / pedestal.NN** — cement (`cement.material.json`) cylinder pedestals under each sphere.

## Material Slots

| Slot | Manifest | Shader | Notes |
|---|---|---|---|
| centre | `m0-chrome` | standard | Roughness ≈ 0, metalness 1 — pure mirror. |
| 01 | `m1-plastic-rough` | standard | Diffuse dielectric, rough. |
| 02 | `m2-plastic-glossy` | standard | Smooth dielectric. |
| 03 | `m3-steel-brushed` | standard | Mid-roughness metal. |
| 04 | `m4-gold-polished` | standard | Low-roughness metal. |
| 05 | `m5-car-paint` | physical | Clearcoat over coloured base. |
| 06 | `m6-glass` | physical | `transmission` + `ior` 1.5. |
| 07 | `m7-velvet` | physical | `sheen` + `sheenColor`. |
| 08 | `m8-iridescent` | physical | `iridescence` 1.0. |
| 09 | `m9-hardwood` | standard | `map` + `normalMap` + `roughnessMap`. |
| 10 | `m10-brick` | standard | `map` + `normalMap` + `roughnessMap`. |
| 11 | `m11-ice` | physical | Textured + light transmission. |
| 12 | `m12-copper` | standard | Warm metal. |

## How To Extend

| Goal | Pattern |
|---|---|
| Add a new material | Drop a new manifest under `assets/runtime/materials/`, append its id to `OUTER_MATERIALS` in `bootstrap.ts`. The ring count is derived from the array length. |
| Change rotation speed | Edit `spheres.root.Spin.speed` in `scenes/start.scene.json` (degrees per second). |
| Stop the rotation | Remove the `Spin` component from `spheres.root`. |
| Swap environment | Replace `assets/runtime/hdr/venice_sunset_1k.hdr` and update `environment.url` in the scene. |
| Re-light | The key light is `light.key`; ambient is `light.fill`. Both authored in the scene. |

## Verify Before Shipping

```bash
npm run engine:check -- examples/material-bench
npm run engine:summarize -- examples/material-bench
```
