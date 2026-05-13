# Asset Authoring Checklist

Use this when adding a new asset (mesh, material, texture, shader) to an AGF project, starting with Beacon World. Keep entries small enough that an agent can fill them in without external context.

## Folder Convention

Per project (`examples/<project>/assets/`):

```
assets/
  _sources/
    asset-sources.json     # tracked, English-only metadata
  source/                  # raw inputs (Blender files, Meshy exports, references)
  runtime/
    models/                # *.glb, *.gltf
    materials/             # *.material.json
    textures/              # *.png, *.jpg, *.ktx2
    shaders/               # *.vert.glsl, *.frag.glsl  (when shader manifest lands)
```

`source/` contents are author-side artefacts; only `runtime/` is consumed at runtime.

## Per-Asset Checklist

1. **Decide the kind.** One of `mesh`, `material`, `texture`, `shader`, `procedural`.
2. **Pick a stable id.** Kebab-case, prefixed by project: `beacon-world.beacon-pillar`, `hello-3d.cube-hero-material`. Unique within `asset-sources.json`.
3. **Place the source file.** If the asset has an authored source (Blender, Meshy, Photoshop), drop it under `assets/source/` with the same kebab-case name.
4. **Place the runtime file(s).** Export the runtime form into the matching `runtime/<kind>/` folder. Prefer:
   - `.glb` for 3D meshes (binary glTF 2.0).
   - `.png`/`.jpg` for textures; `.ktx2` later for compressed.
   - `.material.json` for materials (see schema).
5. **Update `asset-sources.json`.** Add an entry with `id`, `kind`, `runtimeFiles[]`, `license`, `source.{type, notes, url?, prompt?}`. Use `procedural` for engine-generated or hand-tuned configs (e.g. the cube material in `hello-3d`).
6. **Reference the asset from the scene.** In `*.scene.json`, set `MeshRenderer.mesh` and/or `MeshRenderer.material` to the path relative to `assetRoot`.
7. **Run `engine check`.** Confirms `assetRoot` exists, references resolve and material manifests validate against the schema.
8. **Browser smoke or playtest.** Confirm visible result for renderable assets; run the robot playtest if a system depends on the asset.

## Material Manifest

Validated by `schemas/material.schema.json`. Required: `id`, `shader`, `color` (six-digit hex). Optional: `roughness` (0–1), `metalness` (0–1), `emissive` (hex), `alphaMode` (`opaque` | `blend`). v0 supports only `shader: "standard"` (Three.js `MeshStandardMaterial`).

## Shader Manifest (spike)

Drafted in `schemas/shader.schema.json` and described in `docs/research/spikes/shader-manifest.md`. Not yet consumed by the runtime — do not add `.shader.json` files until that lands.

## What NOT To Do

- Do not commit anonymous binary assets without an `asset-sources.json` entry.
- Do not place source files under `runtime/` or vice versa.
- Do not reference assets by absolute path or by paths that escape `assetRoot`.
- Do not edit generated files (e.g. the `dist/` build, future generated network contracts) by hand.
- Do not bypass the material schema by adding inline material data into the scene — keep gameplay state in components and rendering data in manifests.

## Diagnostics To Expect

If something is wrong, `engine check` reports:

- `AGF_ASSET_REFERENCE_MISSING` — referenced file does not exist under `assetRoot`.
- `AGF_ASSET_REFERENCE_INVALID` — reference escapes `assetRoot` or is absolute.
- `AGF_SCHEMA_*` — material manifest fails its schema.
- `AGF_ASSET_SOURCES_MISSING` — `_sources/asset-sources.json` is missing under `assetRoot`.

Fix at the lowest layer that the diagnostic points at; do not work around it in the renderer.
