# ADR-0012: AssetRegistry-resolved texture refs in material manifests

## Status

Accepted (2026-05-15). Workaround shipped Sprint 54 (`BENCH-material-bench`): `MaterialBindingSystem` calls `assetRegistry.urlFor(ref)` before forwarding texture refs to `TextureLoader`. Full registry integration (`AssetRegistry.get<TextureAsset>()`) tracked as the S56 `ASSET-textures-via-registry` story; this ADR records the contract regardless of which implementation step is current.

## Context

Material manifests carry texture refs:

```json
{
  "id": "m9-hardwood",
  "map":          "runtime/textures/hardwood2_diffuse.jpg",
  "normalMap":    "runtime/textures/hardwood2_bump.jpg",
  "roughnessMap": "runtime/textures/hardwood2_roughness.jpg"
}
```

Through Sprint 53 these strings travelled unchanged from JSON → `MeshRenderer.material` → manifest → `MaterialPatch.map` → `THREE.TextureLoader.load(url)`. Three.js's `TextureLoader` resolves relative URLs against `document.baseURI` — i.e. the dev-server root (`/`), not the project's `assetRoot` (`examples/<project>/assets/`). Material-bench was the first project to ship textured materials, and every texture silently 404'd. `TextureLoader` doesn't surface 404s through any diagnostic channel; the page just rendered a black surface.

The material manifest itself loads through `AssetRegistry.get<MaterialManifest>(ref)`, which builds the URL with `urlFor(ref) = new URL(ref, baseUrl).href` where `baseUrl = examples/<project>/assets/`. So the manifest path resolves correctly; only the texture refs inside the manifest didn't.

## Decision

Texture refs inside material manifests are **project-relative paths** (the same shape as the manifest ref itself, e.g. `runtime/textures/foo.jpg`). The runtime resolves them through `AssetRegistry.urlFor` before passing the URL to `TextureLoader` (or any other texture decoder).

The same rule applies to HDR / cubemap environment URLs declared at `scene.environment.url` / `scene.environment.faces[]`.

Two follow-on rules:

1. **Texture refs MAY NOT be absolute URLs.** No `https://...` paths in manifest fields. CDN delivery lands later via the Addressables-lite epic; until then, the registry's `baseUrl` is the project's `assetRoot`.
2. **Gameplay code MAY NOT bypass the registry.** No raw `new THREE.TextureLoader().load(url)` calls in systems / bootstrap / project code. The registry is the single point of texture-URL translation.

## Two implementation steps

Sprint 54 (shipped) — `urlFor` workaround:

```ts
// engine/render/systems/material-binding-system.ts
const resolveTexture = (ref: string): string =>
  deps.assetRegistry !== undefined ? deps.assetRegistry.urlFor(ref) : ref;
if (manifest.map !== undefined) patch.map = resolveTexture(manifest.map);
```

The texture URL is correct, but the load still goes through Three.js's `TextureLoader` directly. Pros: minimal change, no new loader registration. Cons: 404s don't emit `AGF_RUNTIME_ASSET_LOAD_FAILED`, HMR can't invalidate one texture without remounting the whole material.

Sprint 56 (planned, `ASSET-textures-via-registry` story) — registry integration:

```ts
deps.assetRegistry.get<TextureAsset>(ref).then((texture) => { patch.map = texture; ... });
```

The texture rides the standard async-binding path (`AppliedTextureRef` component, status: pending / applied / failed). Diagnostics emit on failure. HMR invalidate works per-ref.

## Consequences

Pro:

- Texture URLs resolve correctly regardless of dev-server route.
- After Step 2, 404s are visible through the regular diagnostics surface; HMR is fine-grained.
- One contract for every asset kind (manifests, GLBs, textures, HDR envs).

Con:

- Existing projects that hand-wrote absolute texture URLs (none on AGF; this is a forward rule) would need migration.
- Step 2 adds another async layer; the placeholder-then-swap flow already used for materials applies to textures too.

## Validation

- Material-bench textured spheres (hardwood / brick / ice) render correctly through the urlFor workaround.
- `tests/unit/runtime-critical-assets.test.ts` already exercises the AppliedRef status flow; texture support extends it.
- `engine doctor` Textures section catches secondary issues (huge / NPOT / no-transcoder).

## Alternatives Considered

- **Manifest-side absolute URL.** Rejected — locks AGF projects to a specific hosting URL; breaks dev-server routing.
- **Special-case texture refs as a different schema field.** Rejected — texture refs are just project-relative URLs like every other asset; the contract should be uniform.
- **Vite-import textures at build time.** Works for static projects but defeats HMR and the runtime asset registry. Rejected.

## Notes

The skill memos `docs/agent/skills/material-authoring.md` and `docs/agent/asset-pipeline.md` codify the authoring contract. The friction log `docs/research/material-bench-asset-friction.md` recorded the original failure mode.
