# ASSET-gltf-transform-investigate

Date: 2026-05-14
Owner: ASSET pipeline (M25)

## Question

Which packaging shape should AGF use to run the offline asset-optimization pipeline (Meshopt / Draco geometry compression, KTX2 / Basis texture compression, LOD chains)? Three reasonable options:

1. **Dev dep — `@gltf-transform/core` + `@gltf-transform/functions`** inside the repo, exposed through `engine asset optimize <project> <asset>` CLI.
2. **External CLI** — agent runs `npx gltf-transform optimize input.glb output.glb`.
3. **Optional agent skill** — a `/optimize-glb` slash command that wraps option 2 with project conventions.

The AGENTS hard rule "loaders / decoders are constructed once" already pins the **runtime** shape: a single `DRACOLoader` / `KTX2Loader` shipped via `engine/render/asset-decoders/decoders.ts` (S38). This note picks the build-time shape.

## What's on npm

```
@gltf-transform/core         v4.3.0   (parse / serialise GLB)
@gltf-transform/functions    v4.3.0   (compress, prune, weld, dedup, simplify, ...)
@gltf-transform/extensions   v4.3.0   (KHR_draco_mesh_compression, KHR_mesh_quantization, EXT_meshopt_compression, KHR_texture_basisu, ...)
```

All three install clean as devDependencies; runtime cost = zero (gameplay never imports them — only the CLI tool does).

The package author publishes `gltf-transform` (the CLI) as well; it wraps the same `functions` module. The CLI takes a positional input + a chain of subcommands (`optimize`, `meshopt`, `etc1s`, `uastc`, `simplify --ratio 0.5`).

## Recommendation

**Adopt option 1 — devDependency + AGF-owned CLI**. Three reasons:

1. **Pre-set policies.** Beacon's runtime assets need a specific compression mix (UASTC for normal maps + emissive, ETC1S for diffuse, Meshopt for geometry). Encoding that as a `gltf-transform` invocation chain is fragile; baking it into `engine asset optimize` means the same `assets/_sources/*.glb` always produces the same `assets/runtime/*.glb`, regardless of who runs it.
2. **Schema alignment.** `assets/_sources/asset-sources.json` already records source metadata; the CLI can write `pipeline` settings + a hash so a regenerate-on-CI step rebuilds exactly the same output.
3. **Agent ergonomics.** `engine asset optimize <project>` is one verb. The same agents that run `engine check` / `engine inspect` / `engine doctor` pick it up uniformly; option 2 forces the agent to remember a flag chain.

Option 3 (skill) re-emerges later as a thin convenience wrapper around the CLI if the workflow stabilises — but only after the CLI exists.

## Sub-decisions

- **Where the CLI lives**: `engine/tools/asset/asset-optimize.ts`, registered in `engine/tools/cli.ts` alongside `check` / `inspect` / `summarize` / `doctor` / `docs` / `migrate` / `asset import`.
- **Default chain** (overridable per project):
  - `dedup` (vertex + texture)
  - `prune` (remove unused)
  - `weld` (within tolerance)
  - `simplify` (only when the source carries an `lodIntent` hint — defer to `ASSET-lod-metadata`)
  - `meshopt` (geometry compression — set up `EXT_meshopt_compression` extension)
  - `textureCompress` (UASTC for normal/AO/roughness maps + ETC1S for diffuse — Basis Universal via `KHR_texture_basisu`)
- **Project override**: optional `assets/_sources/asset-pipeline.json` declaring per-asset overrides (e.g. `{ "drone.glb": { "skipSimplify": true } }`). Validated by `engine check`.
- **Output location**: `assets/runtime/...` mirrors the `_sources/...` tree. Existing runtime files are overwritten; the CLI prints a per-file size delta + bail-out diagnostics if a transform fails.
- **Loader wiring**: `createGlbLoader({ draco: true, ktx2: true, meshopt: true })` already exists (S38). Beacon flips the flags when `ASSET-compression` ships and starts loading the compressed variants.

## Out of scope here

- Bundling the basis transcoder + draco decoder files. `getKtx2Loader` / `getDracoLoader` default to the three.js examples CDN today; switching to a vendored path in `/public/draco/` + `/public/basis/` is a separate story (`ASSET-decoder-vendor`).
- Atlasing, LOD generation, normal-map chunking. Tracked separately (`M17-atlas-investigate`, `ASSET-lod-metadata`, `M21-mat-textures-atlas`).
- Animation compression. Beacon's GLBs are static today; revisit when Beacon adds an idle/run animation graph.

## Next stories

- `ASSET-optimize-command` — implement `engine asset optimize <projectDir> [--asset <ref>]`, default chain above, writes runtime files.
- `ASSET-decoder-vendor` — copy `node_modules/three/examples/jsm/libs/{draco,basis}/` into `/public/` at build time + point the runtime loaders at the vendored URLs.
- `ASSET-compression` — flip `createGlbLoader` flags on for Beacon, run `engine asset optimize examples/beacon-world`, verify the runtime GLBs are now compressed + the runtime loads them.
