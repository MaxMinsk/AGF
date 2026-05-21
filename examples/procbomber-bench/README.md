# procbomber-bench

Visual sandbox for the procedural humanoid mesh generator. One bomber
stands on a slow-spinning turntable in front of the camera so every face
of the merged box mesh comes around in view.

The bomber uses `MeshRenderer.mesh = "procedural:procbomber"` — the
renderer's `ProceduralMeshRegistry` (`engine/render/procedural-mesh-registry.ts`)
routes through the project's builder, which calls
`generateBomberMesh({ palette })` to produce the six-box humanoid each
time a new seed is requested.

## Run

```bash
npm run dev -- --project examples/procbomber-bench
```

## URL knobs

- `?bomberPalette=sky|ember|mint|plum|sand|jade|rose|slate` — override
  the seed-driven palette for every spawned bomber.

## Where things live

- `src/generators/bomber-mesh.ts` — pure `generateBomberMesh` (S101)
- `src/generators/bomber-palette.ts` — 8 named palettes + picker (S101)
- `bootstrap.ts` — registers the `procbomber` builder with the renderer
- `scenes/start.scene.json` — camera + ground + turntable + bomber
- `tests/unit/*.test.ts` — pure unit tests for the generator

## Roadmap

- S101-7: DOM overlay with body-part size sliders + palette dropdown + reroll button.
- S101-8: Animation dropdown (idle bob / walk swing stubs).
- S101-9: Playwright smoke confirming the bench loads + every UI control responds.
- S102+: Replace the box parts with sculpted procedural geometry; add the six animation ECS systems (GDP-009); add the procedural voice synth (GDP-010); integrate into Kaboom Crew.
