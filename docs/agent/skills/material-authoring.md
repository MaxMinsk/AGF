# Skill: material-authoring

## Trigger

Use when you author a new `<id>.material.json` manifest, modify an existing one, or troubleshoot a "why is this surface not painting / lit right?" failure.

## Shader pipeline

Manifests declare a `shader` field that picks the Three.js material class:

| `shader` | Three.js class | Use case |
|---|---|---|
| `standard` | `MeshStandardMaterial` | PBR baseline. Default for everything dielectric or metal. |
| `physical` | `MeshPhysicalMaterial` | PBR + extras: clearcoat, transmission (glass / ice), sheen (fabric), iridescence. |
| `lambert` | `MeshLambertMaterial` | Cheap diffuse. No specular. Use for very low-end fallbacks. |
| `phong` | `MeshPhongMaterial` | Cheap specular highlight. Stylized look (toy-shiny). |
| `basic` | `MeshBasicMaterial` | Unlit. Useful for UI billboards, particles, debug. |
| `custom` | `ShaderMaterial` | Inline GLSL via `vertexShader` / `fragmentShader` or external `*ShaderRef` paths. |

Pick the cheapest shader that paints what you want. `physical` adds shader-compile and per-frame cost over `standard`; only pay it when you need clearcoat / transmission / sheen / iridescence.

## Field cheat-sheet

```json
{
  "id": "m9-hardwood",
  "shader": "standard",
  "color": "#ffffff",
  "roughness": 1.0,
  "metalness": 0,

  "map":          "runtime/textures/hardwood2_diffuse.jpg",
  "bumpMap":      "runtime/textures/hardwood2_bump.jpg",
  "bumpScale":    1.5,
  "roughnessMap": "runtime/textures/hardwood2_roughness.jpg"
}
```

| Field | Meaning |
|---|---|
| `color` | Base colour. Multiplies with `map` if both are set. 6-digit hex. |
| `roughness` | 0 = mirror, 1 = fully diffuse. Multiplies with `roughnessMap`'s green channel. |
| `metalness` | 0 = dielectric, 1 = metal. |
| `emissive` / `emissiveIntensity` | Self-illumination (ignored by lights / shadows). |
| `map` | Base-colour texture, sRGB-tagged. |
| `normalMap` / `normalScale` | Tangent-space (blue-purple) normal map. Three.js auto-derives tangents when missing. |
| `bumpMap` / `bumpScale` | Greyscale height map. Three derives normals on the fly from texture gradient. Cheaper to author than `normalMap`. |
| `roughnessMap` / `metalnessMap` | Per-channel maps (glTF: green = roughness, blue = metalness). |
| `emissiveMap` / `aoMap` | Self-illumination texture / ambient-occlusion texture. |
| `alphaMode: "opaque" \| "blend"` + `opacity` | Standard alpha blending. |
| `clearcoat` / `clearcoatRoughness` | (physical only) Lacquer layer. Car paint. |
| `transmission` / `ior` / `thickness` | (physical only) Refractive volumes. Triggers WebGLRenderer's transmission pre-pass. |
| `sheen` / `sheenColor` | (physical only) Fabric / velvet softness. |
| `iridescence` | (physical only) Soap bubble / oil slick. |
| `shininess` / `specular` | (phong only) Specular falloff + tint. |

## bumpMap vs normalMap — how to choose

- **Source file is greyscale, often named `*_bump.jpg`** → `bumpMap` + `bumpScale` (typical 0.5–3.5).
- **Source file is blue-purple RGB, often named `*_normal.jpg` or `*_NormalGL.jpg`** → `normalMap` + `normalScale` (typical 0.5–1.5).
- **Source file is named "bump" but stored as 3-channel RGB greyscale** — still treat as `bumpMap`; feeding a height map into `normalMap` will paint garbage.
- `material-bench` ships both: `m11-ice` uses `normalMap` (Ice002_NormalGL is a real tangent-space map); `m9-hardwood` and `m10-brick` use `bumpMap` (the `_bump.jpg` source files are height maps).

If a project's texture-doctor would benefit from auto-flagging this misuse, file a follow-up.

## Texture resolution

Texture refs inside the manifest are project-relative (`runtime/textures/foo.jpg`). The renderer resolves them through `AssetRegistry.urlFor(ref)` before passing to `TextureLoader.load`. Never write absolute URLs (`https://...`) into manifest fields; do not bypass the registry with raw `new TextureLoader().load(...)` from gameplay code.

The registry's `baseUrl` is the project's `assetRoot` (`examples/<project>/assets/`), so `runtime/textures/foo.jpg` resolves to `examples/<project>/assets/runtime/textures/foo.jpg`.

## Reference from a scene

```json
"MeshRenderer": {
  "mesh": "sphere",
  "material": "runtime/materials/m9-hardwood.material.json"
}
```

The `material` field is the **full manifest path**, not the manifest's `id`. The schema currently accepts any non-empty string; the runtime needs the path. (Backlog candidate: tighten `engine check` to reject bare ids.)

## Common pitfalls

- **Bare manifest id in `MeshRenderer.material`** (`"m9-hardwood"`). Use the full path.
- **`_bump.jpg` in `normalMap`.** Will paint corrupt normals. Use `bumpMap`.
- **`roughnessMap` darkening to full mirror.** When the map is dark grey, `material.roughness * map.green` lands near 0; set `roughness: 1.0` so the map's value is preserved.
- **Absolute texture URLs.** Texture refs go through the asset registry. Absolute URLs bypass it and resolve against the page URL.
- **Transmissive material (`transmission > 0`) with auto-batch on a primitive-rich scene.** Each frame the renderer runs an extra transmission pre-pass that re-renders all opaque geometry. Reduce cost with `project.json#render.color.transmissionResolutionScale: 0.5` (half-res RT).
- **`new MeshStandardMaterial({...})` in gameplay code.** Each unique signature pays a shader-compile cost and breaks batching. Per-entity colour overrides go on `MeshRenderer.color`; behaviour overrides go on a new manifest.
- **HDR set as IBL but `asBackground` omitted.** The HDR becomes IBL only; the visible background stays `project.render.background`. See `scene.environment.asBackground` in [`scene-authoring.md`](scene-authoring.md).

## Doctor checks

- **Material sharing.** `engine doctor` reports duplicate material signatures across manifests — fold them into one shared manifest to shrink M17 bucket counts.
- **Texture warnings.** `AGF_TEXTURE_HUGE` (uncompressed > 1 MB; run `engine asset optimize --textures`), `AGF_TEXTURE_NPOT` (non-power-of-two; some GPUs miss mipmaps), `AGF_TEXTURE_NO_TRANSCODER` (`.ktx2` ref without vendored decoder).

## Verification

- `engine check examples/<project>` passes (schema + texture-ref resolution).
- `engine doctor examples/<project>` Material Sharing + Textures sections look clean.
- Visual check: `npm run dev`, load the project, confirm the surface paints as expected. For glass / clearcoat / iridescence, screenshot before/after the change.
