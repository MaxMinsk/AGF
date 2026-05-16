# examples/webgpu-spike/

AGF's continuous WebGPU smoke trail. Hello-3d-shaped scene (cube + sphere + cylinder + floor, sun + hemi fill, spinning hero cube) that boots end-to-end on `WebGPURenderer` via `project.json#render.mode: "webgpu"`. Use this project as the template when adding WebGPU to a new game.

Sibling of `hello-3d` (renderer fixture), `material-bench` (PBR + VFX), `shadows-bench` (CSM), `batch-bench` (M17 batching), `physics-bench` (Rapier), `water-bench` (planar mirror).

## Run

```bash
npm run dev
# then open http://localhost:5173/?project=webgpu-spike
```

A WebGPU-capable browser is required. On macOS / Linux / Windows Chrome 113+ should work out of the box; older builds need the `--enable-unsafe-webgpu` flag. If `navigator.gpu` is unavailable, the page errors out — there's no automatic fallback to WebGL today.

Open DevTools and run `__agf.rendererInfo().renderer` — should report `"webgpu"`.

## What works (S61 core path)

- `MeshRenderer` with built-in primitives (cube / sphere / cylinder / floor).
- `MeshStandardMaterial` direct-light path.
- `Light` (directional / hemisphere) + basic PCF shadow map.
- `Spin` component (hero cube rotates 45 °/s around Y).
- `__agf.rendererInfo().renderer === "webgpu"` reads.
- ACES Filmic tone mapping.

## What's intentionally absent

- No reflection probes / planar mirrors / post-processing / CSM / PCSS — those features silently no-op on the WebGPU adapter pending S63 port.
- Batching disabled in project.json — the bucket path falls back to per-entity Mesh on WebGPU.

## What S62 added

- **HDR + generated IBL** — the adapter now routes through `three/webgpu`'s `PMREMGenerator` (different class than the WebGL one). `environment.kind: "generated"` (RoomEnvironment) and `environment.kind: "hdr"` both work now. The spike's scene uses `"generated"`; flip to `"hdr"` + add an HDR file under `assets/runtime/hdr/` to see image-based lighting come through on metallic / glossy materials.

## Doctor

`npm run engine:check -- examples/webgpu-spike` should report no blockers in the `WebGPU readiness:` section. If you add features that aren't WebGPU-supported yet (post-passes, CSM, etc.), doctor flags them with a recommendation to either revert mode or wait for the port.

## Smoke

`tests/e2e/webgpu-spike.spec.ts` boots this project under playwright. The test self-skips on browsers without `navigator.gpu` (most headless Linux CI), so local developer runs exercise it but CI smoke stays green.

## See also

- Skill memo: [`docs/agent/skills/webgpu-rendering.md`](../../docs/agent/skills/webgpu-rendering.md).
- S60 spike numbers: [`docs/research/m21-webgpu-spike.md`](../../docs/research/m21-webgpu-spike.md).
- Adapter sketch: [`docs/research/m21-webgpu-adapter-sketch.md`](../../docs/research/m21-webgpu-adapter-sketch.md).
- Comparison harness: [`tests/manual/webgpu-vs-webgl/`](../../tests/manual/webgpu-vs-webgl/).
