# examples/shadows-bench/

CSM (Cascade Shadow Maps) showcase. Not a game. Boots a large field with a procedural "village" — varied-height buildings along two crossing streets, a forest of trees around them, and rocks scattered at the edges — under an RTS-style camera. The project's `project.json#render.shadows.csm` opts in to CSM; every material the renderer manages is routed through `csm.setupMaterial`.

Sibling of `batch-bench` (renderer batching) and `physics-bench` (Rapier). This one stresses shadow cascade selection at multiple camera distances.

## Run

```bash
npm run dev
# then open http://localhost:5173/?project=shadows-bench
```

## Controls

| Input | Action |
| --- | --- |
| `W`/`A`/`S`/`D` or arrows | Pan camera |
| Mouse wheel | Zoom in / out |
| `Q` / `E` | Keyboard zoom (no wheel needed) |

The camera's tilt is authored once in `scenes/start.scene.json`; `RtsCameraSystem` only writes `Transform.position` each frame, so zoom adjusts both Y AND Z proportionally to keep the camera tracking the same point on the ground.

## URL params

| Param | Range | Default | Notes |
| --- | --- | --- | --- |
| `buildings` | `[0, 200]` | 28 | Boxy buildings + pitched roofs. |
| `trees` | `[0, 600]` | 80 | Trunk (box) + canopy (sphere). |
| `rocks` | `[0, 400]` | 50 | Squashed spheres at the field edges. |

Push `buildings=120&trees=400` for a dense scene; the cascades should still cover the visible range, with the inner cascade staying sharp at full zoom-in.

## What this project is NOT

- Not a tutorial — the camera system is intentionally a single file kept under `src/systems/`.
- Not a gameplay sample.
- Not a place to land project-specific systems beyond the camera helper — keep the perf signal clean.

## Notes on three.js bundled models

`node_modules/three` does NOT ship the GLBs you see on threejs.org/examples (LittlestTokyo, Flamingo, etc.) — those are hosted separately. This project stays procedural-only on purpose so it works offline and across CI. A future story under the `M25` asset pipeline epic will let an agent download CC0 assets into `assets/runtime/` reproducibly.
