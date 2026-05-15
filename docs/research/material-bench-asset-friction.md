# material-bench asset workflow — friction log

Notes from bootstrapping `examples/material-bench` (S54 BENCH-material-bench).
This was the first AGF example project to use textured material manifests
(map / normalMap / roughnessMap) and an HDR environment loaded from a project
asset, so several gaps that didn't surface in hello-3d / beacon-world / shadows-bench
bit immediately. Captured here so we can fix them properly in a follow-up sprint.

## What was painful

### 1. Texture refs inside material manifests didn't resolve to the project's `assetRoot`

`MaterialManifest.map` / `normalMap` / `roughnessMap` were passed straight from
the JSON into `Three.TextureLoader.load(url)`. `TextureLoader` resolves relative
URLs against `document.baseURI` — i.e. the dev-server root, not
`examples/<project>/assets/`. So a manifest line like

```json
"map": "runtime/textures/hardwood2_diffuse.jpg"
```

silently 404'd when the page lived at `/`. The 404 surfaced only as a
"texture missing" visual — no diagnostics event.

**Fix landed in this PR:** `material-binding-system` now calls
`assetRegistry.urlFor(ref)` on every texture ref before forwarding it as a
`MaterialPatch`. The same registry already prefixes the project's
`assetRoot` to `.material.json` / `.glb` refs; textures now share that
contract.

**Better fix (deferred):** texture refs should travel through
`AssetRegistry.get()` with a dedicated loader, so:
- HMR can invalidate one texture without remounting the whole material;
- 404s emit `AGF_RUNTIME_ASSET_LOAD_FAILED` like every other asset;
- the `engine doctor` texture pass (S54 ASSET-texture-doctor) can prove
  the texture was actually fetched, not just referenced.

### 2. HDR / cube environment URLs had the same problem

`scene.environment.url` for `kind: "hdr"` went straight to `RGBELoader.load()`
— again resolved against the document URL. Patched in `engine/runtime/start.ts`
the same way (via `assetRegistry.urlFor`).

Pre-existing projects (hello-3d, beacon-world, shadows-bench, batch-bench,
physics-bench) all use `kind: "generated"`, so this had never been exercised
on a project asset.

### 3. The MeshRenderer.material field accepts two unrelated shapes

Scenes have always used the full path: `"material": "runtime/materials/foo.material.json"`.
That is what the runtime resolves through the AssetRegistry. But the manifest's
`"id"` field (e.g. `"id": "m1-plastic-rough"`) looks like the natural thing
to reference, and `engine check` doesn't reject the wrong form — it accepts any
string with `minLength: 1`. I burned one iteration writing
`material: "cement"` in bootstrap.ts and getting silent fallbacks before
realising the scene's path-style was the contract.

**Improvements to consider:**
- `engine check` should flag a `MeshRenderer.material` value that is not
  a known ref (doesn't end in `.material.json`, doesn't resolve to a
  manifest under `assetRoot`).
- Either accept the manifest `id` and look it up in a project-level
  registry, or document the path form explicitly in the schema description.
- The doctor batch-candidates section already groups by `material` — it
  could surface "this material ref resolves to no file" as a warning.

### 4. The cylinder primitive didn't exist

The dogfood request was "the spheres stand on cement cylinders". The engine
shipped `box` / `sphere` / `plane` only, so I added `cylinder` to:
- `engine/render/mesh-handle-registry.ts` (CylinderGeometry)
- `engine/render/systems/batching-system.ts#PRIMITIVE_MESHES`
- `engine/tools/check/project-check.ts#primitiveMeshes`
- `engine/tools/doctor/project-doctor.ts#PRIMITIVE_MESHES`
- `schemas/components/render.schema.json#meshRendererComponent.mesh.enum`

The five-place change is duplication smell. The single-source-of-truth
would be a `PRIMITIVE_MESHES` constant exported from one place that
every consumer imports — schema codegen included.

### 5. asset-sources.schema is stricter than the manifests it gates

I tried to record provenance for the bundled HDR + texture files and got bounced
several times because the schema's `kind` enum lacks "environment", `source.type`
lacks "third-party" / "vendored", and `source.vendor` isn't a known property.
Settled on `kind: "texture"` + `source.type: "cc0"` for HDR-from-Poly-Haven,
which is technically true but loses the "this is an IBL skybox" intent.

**Suggestions:**
- Add `kind: "environment"` (or `"hdr"`) for image-based-lighting sources.
- Add an optional `source.vendor` / `source.attribution` field — license
  alone doesn't tell us *who* released it.
- Consider a `source.type: "vendored"` option for things copied from
  `References/three.js`.

### 6. No "what materials does the project use, and do they resolve?" check

The engine has `engine doctor` for renderer health and `engine check` for
schema validity, but nothing aggregates manifests. For 13 materials I had to
visually inspect each file to confirm I'd covered the slot list in
`bootstrap.ts#OUTER_MATERIALS`. A small `engine doctor` section that lists
every manifest under `assetRoot`, the entities referencing it, and any
unreferenced manifests (dead weight) would have caught two slot-name mistakes
faster than running the scene.

### 7. Texture pipeline ergonomics for vendored CC0 assets

I copied 9 jpgs and one .hdr from `References/three.js`. The path I needed
inside the manifest (`runtime/textures/Ice002_1K-JPG_Color.jpg`) is
load-bearing — the JPGs had to land in exactly that subtree, with the
exact filename, with the manifest agreeing. There is no `engine asset
import --textures <dir>` companion to S54's `engine asset optimize`
that takes a source folder and produces both the `runtime/textures/`
copy and the runtime URL. Two mismatches between filename in the manifest
and filename on disk produced silent textureless surfaces.

## Suggested follow-ups (ranked by friction × frequency)

1. **AssetRegistry-aware texture pipeline.** Move texture refs onto
   `AssetRegistry.get<TextureAsset>()` so 404s emit diagnostics and HMR
   works per-texture. The two-line `urlFor` patch landed in this PR
   is a workaround.
2. **Schema validation for `MeshRenderer.material`.** Reject anything
   that isn't a path to an existing manifest under `assetRoot`, or
   that doesn't end in `.material.json`.
3. **Single source of truth for primitive mesh names.** One exported
   constant; schemas + doctor + batcher + registry all import it.
4. **`engine doctor` material/texture inventory.** List manifests,
   referenced-from entities, orphans, and unresolved texture URLs.
5. **`asset-sources.schema` enrichment.** `kind: "environment"`,
   `source.type: "vendored"`, optional `source.vendor`.
6. **`engine asset import --textures` companion to optimize.** Given
   a source folder, copy + rename + write asset-sources entries so a
   manifest can reference the result by id.
