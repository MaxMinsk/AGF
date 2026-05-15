# Asset Pipeline

End-to-end recipe for shipping assets (meshes, materials, textures, environments) into an AGF project. Pair with the older [`asset-authoring-checklist.md`](asset-authoring-checklist.md) — that file lists the per-asset checks; this file is the loop.

The pipeline:

```
_sources/<source-file>  ──►  engine asset import  ──►  runtime/<kind>/<runtime-file>
                                                            │
                                                            ▼
                                         engine asset optimize [--textures]
                                                            │
                                                            ▼
            asset-sources.json    ◄────  manifest fields (kind / license / source.type)
                                                            │
                                                            ▼
                                  runtime/materials/<id>.material.json
                                                            │
                                                            ▼
                            MeshRenderer.mesh / MeshRenderer.material in scenes
```

## 1. Folder layout

Per project (`examples/<project>/assets/`):

```
assets/
  _sources/
    asset-sources.json      # provenance manifest (tracked)
    <source-files>          # raw inputs (Blender, Meshy, CC0 archives)
  runtime/
    models/                 # *.glb / *.gltf
    materials/              # *.material.json
    textures/               # *.png / *.jpg / *.webp / *.ktx2
    hdr/                    # *.hdr / *.exr  (when env uses kind: "hdr")
    shaders/                # *.vert.glsl / *.frag.glsl
```

`_sources/` is for author-side artefacts (raw exports, photos, source psd / blend); only `runtime/` is consumed at runtime. Both are tracked in git unless a file is too large — keep that judgment in the PR description.

## 2. Provenance — `_sources/asset-sources.json`

Validated by `schemas/asset-sources.schema.json`. Each entry:

```json
{
  "id": "material-bench.hardwood-textures",
  "kind": "texture",
  "runtimeFiles": [
    "runtime/materials/m9-hardwood.material.json",
    "runtime/textures/hardwood2_diffuse.jpg",
    "runtime/textures/hardwood2_bump.jpg",
    "runtime/textures/hardwood2_roughness.jpg"
  ],
  "license": "CC0",
  "source": {
    "type": "cc0",
    "url": "https://github.com/mrdoob/three.js/tree/dev/examples/textures",
    "notes": "Vendored from three.js examples textures, originally CC0."
  }
}
```

Schema enums:

- `kind`: `model` / `texture` / `audio` / `material` / `shader` / `procedural` / `other`.
- `source.type`: `generated` / `cc0` / `licensed` / `original` / `procedural`.

Both lists are intentionally narrow — see the material-bench friction note (`docs/research/material-bench-asset-friction.md`) for known gaps (`environment`, `vendored`).

## 3. Importing a new asset

```bash
npm run engine:asset -- import examples/<project> path/to/source.glb --id <kebab-id>
```

Copies the source into `_sources/`, the runtime form into `runtime/<kind>/`, and stamps an entry in `asset-sources.json`. Exits non-zero if the id clashes with an existing entry.

## 4. Optimising

```bash
npm run engine:asset -- optimize examples/<project>            # all runtime glbs + textures referenced from manifests
npm run engine:asset -- optimize examples/<project> --source runtime/models/foo.glb   # one file
npm run engine:asset -- optimize examples/<project> --textures # also run WebP texture compression
```

The optimize pass calls `@gltf-transform/functions` with `dedup → prune → weld → meshopt`. Writes the result as `<asset>.opt.glb` next to the original; the agent reviews and renames in place when the size delta is acceptable. With `--textures`, every texture referenced by the project's material manifests is re-encoded to WebP via `textureCompress({ targetFormat: "webp" })`.

## 5. Material manifests — `runtime/materials/<id>.material.json`

Validated by `schemas/material.schema.json`. Minimal:

```json
{
  "id": "m1-plastic-rough",
  "shader": "standard",
  "color": "#cccccc",
  "roughness": 1.0,
  "metalness": 0
}
```

Field cheat-sheet:

| Field | Shader | Notes |
|---|---|---|
| `color` | all | Base color, 6-digit hex. |
| `roughness` / `metalness` | standard / physical | Standard PBR knobs. |
| `clearcoat` / `clearcoatRoughness` | physical | Lacquer / car paint. |
| `transmission` / `ior` / `thickness` | physical | Glass / ice; triggers transmission pre-pass. |
| `sheen` / `sheenColor` | physical | Velvet / fabric. |
| `iridescence` | physical | Soap bubble / oil slick. |
| `map` | textured | Base colour texture (sRGB). |
| `normalMap` / `normalScale` | textured | Tangent-space (blue-purple) normal map. |
| `bumpMap` / `bumpScale` | textured | Greyscale height map — three.js derives normals on the fly. |
| `roughnessMap` / `metalnessMap` / `emissiveMap` / `aoMap` | textured | Sampled per glTF convention. |

`bumpMap` vs `normalMap`: if your source file is greyscale (often suffixed `_bump`), use `bumpMap`. If it is blue-purple RGB (often suffixed `_normal` or `_NormalGL`), use `normalMap`. `material-bench` ships an example of each.

Texture refs inside the manifest are **project-relative** — `runtime/textures/foo.jpg`, not absolute URLs. The runtime resolves them through `AssetRegistry.urlFor` so they hit the project's `assetRoot`.

## 6. Reference from a scene

In `*.scene.json`:

```json
{
  "id": "sphere.brick",
  "components": {
    "Transform": { "position": [0, 0.5, 0] },
    "MeshRenderer": {
      "mesh": "sphere",
      "material": "runtime/materials/m10-brick.material.json"
    }
  }
}
```

The `material` field is the **full manifest path**, not the manifest's `id`. The schema currently accepts any non-empty string, but the runtime needs the path to resolve through the asset registry.

`mesh` accepts the built-in primitives `box / sphere / cylinder / plane`, or a project-relative GLB path (`runtime/models/<name>.glb`).

## 7. HDR environment

Scene-level:

```json
"environment": {
  "kind": "hdr",
  "url": "runtime/hdr/venice_sunset_1k.hdr",
  "intensity": 1.0,
  "asBackground": true,
  "backgroundBlurriness": 0.35
}
```

Three.js loads the file once via `RGBELoader`, runs it through `PMREMGenerator` for IBL, and (when `asBackground`) re-binds the raw equirect texture as `scene.background` with optional blur. `kind: "cube"` takes six face URLs the same way.

## 8. Verify

```bash
npm run engine:check -- examples/<project>     # schema + asset-ref resolution
npm run engine:doctor -- examples/<project>    # Batching / Shadows / Textures / Prefabs sections + recommendations
```

Doctor sections relevant to assets:

- **Textures.** Reports `AGF_TEXTURE_HUGE` (uncompressed PNG/JPEG > 1 MB), `AGF_TEXTURE_NPOT` (non-power-of-two map used as a material texture), `AGF_TEXTURE_NO_TRANSCODER` (`.ktx2` ref without a vendored decoder).
- **Batching.** Auto-batch state + per-class entity counts. Transmissive materials force the transmission pre-pass — costly when `auto: true` is on a primitive-rich scene.
- **Shadows.** Shadow algorithm + autoUpdate + CSM cascade count + `ShadowCaster { dynamic }` tag counts.
- **Prefabs.** Declared / used / unused / missing-ref counts.

## 9. Critical assets gate

If a scene is unwatchable without a specific hero asset loaded, declare it as critical in `project.json`:

```json
"render": { "criticalAssets": ["runtime/materials/hero.material.json"] }
```

`window.__agf.rendererReady` stays pending until each listed ref resolves to `applied` or `failed`. Every other asset stays on the placeholder-then-swap path — the default.

## What NOT to do

- **Do not commit binary assets without an `asset-sources.json` entry.** `engine check` will flag it.
- **Do not reference an asset by absolute URL** (`https://...`) or by paths that escape `assetRoot`. CDN hosting will land later via the Addressables-lite epic; until then, paths are project-relative.
- **Do not edit generated files** (`dist/`, future generated network contracts).
- **Do not bypass the material schema** with inline material data in the scene — keep gameplay state in components and rendering data in manifests.
- **Do not call `new TextureLoader().load()` from gameplay code.** Texture refs go through material manifests + the asset registry.

## Diagnostics catalogue

The codes `engine check` and `engine doctor` emit for the asset path:

- `AGF_ASSET_REFERENCE_MISSING` — referenced file does not exist under `assetRoot`.
- `AGF_ASSET_REFERENCE_INVALID` — reference escapes `assetRoot` or is absolute.
- `AGF_ASSET_SOURCES_MISSING` — `_sources/asset-sources.json` is missing.
- `AGF_SCHEMA_*` — material / asset-sources / LOD manifest fails its schema.
- `AGF_LOD_DISTANCES_OUT_OF_ORDER` / `AGF_LOD_DISTANCE_DUPLICATE` / `AGF_LOD_MESH_MISSING` — `.lod.json` validation (S54).
- `AGF_TEXTURE_HUGE` / `AGF_TEXTURE_NPOT` / `AGF_TEXTURE_NO_TRANSCODER` — texture-doctor (S54).
- `AGF_RUNTIME_ASSET_LOAD_FAILED` / `AGF_RUNTIME_ASSET_NO_LOADER` — runtime registry (asset never delivered or has no matching loader).

## Future

- **Remote/CDN delivery.** Tracked under `HIGH_LEVEL_BACKLOG.md` as the Addressables-lite epic.
- **`engine asset import --textures` companion to optimize.** Today vendored textures are copied by hand and the asset-sources entry is written manually.
- **Texture refs via `AssetRegistry.get`.** Today `material-binding-system` calls `assetRegistry.urlFor()` before passing to `TextureLoader`; moving textures onto the registry's typed `get<T>()` API would emit `AGF_RUNTIME_ASSET_LOAD_FAILED` on 404s and let HMR invalidate one texture without remounting the whole material.
