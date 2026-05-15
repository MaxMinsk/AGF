# Skill: engine-check

## Trigger

Use when project data, schemas, scenes, prefabs, materials, LOD chains, asset-source manifests, shaders or protocol files change. Also use as the first probe when a project misbehaves at runtime — many runtime failures have a static cause `engine check` catches.

## Sibling commands

| Command | What it does | When to run |
|---|---|---|
| `engine check <projectDir>` | Schema + asset-ref + prefab-instance validation. Hard gate. | After every JSON edit. |
| `engine doctor <projectDir>` | Static health report (Batching / Shadows / Textures / Prefabs / Material sharing / Bundle / Recommendations). Recommendations are advisory. | After every change that touches rendering / materials / prefabs / batching / shadows. |
| `engine inspect <projectDir>` | Static ECS view: entities + components + parents. `--watch`, `--json`, `--entity`, `--component` flags. | When validating a specific entity / component shape without running the browser. |
| `engine docs <projectDir>` | Regenerates Markdown under `docs/generated/<projectId>/` from every `schemas/*.schema.json` + the project's `template_context.md`. | When schemas changed and the docs need a refresh. |
| `engine list components <projectDir>` | Built-in + project-local component catalogue. | When discovering what components exist. |
| `engine explain component <Name>` | Component schema fields with an authoring example. | When stuck on the shape of a single component. |
| `engine asset optimize <projectDir> [--source <path>] [--textures]` | gltf-transform + WebP texture pass. | When prepping assets for production. |
| `engine asset import <projectDir> <source> --id <id>` | Drop a new asset into `_sources/` + record provenance. | When adding a CC0 asset. |

## Workflow

1. Run `engine check` first. Most failures come back with a `suggestion` field — read it.
2. If `engine check` is clean, run `engine doctor` to surface the soft warnings (huge textures, missing dynamic-caster tags, unused prefabs, suboptimal batching path, bundle-size violations).
3. Cross-reference any diagnostic `code` against `docs/diagnostics.md` if the message is unclear.
4. Fix at the lowest layer the diagnostic points at. A schema error means the JSON is wrong; a runtime diagnostic on the bus means an asset / component contract is wrong; never paper over with renderer-side workarounds.

## Diagnostic catalogue (most useful subset)

See `docs/diagnostics.md` for the full table. Common codes by symptom:

| Symptom | First-look code |
|---|---|
| Engine check exits non-zero on a new JSON file | `AGF_SCHEMA_VALIDATION_FAILED`, `AGF_SCHEMA_REQUIRED_PROPERTY`, `AGF_SCHEMA_UNKNOWN_PROPERTY` |
| Scene loads but no entity for a `prefab` instance | `AGF_SCENE_INSTANCE_PREFAB_MISSING` |
| New entity id silently disappears | `AGF_SCENE_INSTANCE_DUPLICATE_ID`, `AGF_SCENE_DUPLICATE_ENTITY_ID` |
| Black sphere where a material should be | `AGF_ASSET_REFERENCE_MISSING` (path wrong), `AGF_RUNTIME_ASSET_LOAD_FAILED` (404 at runtime), `AGF_RUNTIME_ASSET_NO_LOADER` (unknown extension) |
| Shadow-tuner says "no dynamic casters" | (no diagnostic) — read `engine doctor` Shadows section. |
| Texture not showing up | Doctor warning `AGF_TEXTURE_HUGE` is a hint, but most often the runtime emits `AGF_RUNTIME_ASSET_LOAD_FAILED` because the texture path resolved against the page URL not the project root. |
| `.ktx2` material not painting | `AGF_TEXTURE_NO_TRANSCODER` |
| LOD chain ignored at runtime | `AGF_LOD_DISTANCES_OUT_OF_ORDER`, `AGF_LOD_DISTANCE_DUPLICATE`, `AGF_LOD_MESH_MISSING` |
| CSM shadows over-bright | `AGF_CSM_DIRECTIONAL_CONFLICT` — disable `castShadow` on the manual directional light. |
| Drone-style entity refuses to move | Check `Transform.parent` chain via `AGF_TRANSFORM_PARENT_*`. |

## Files engine check validates

- `examples/<project>/project.json` (against `schemas/project.schema.json`)
- `examples/<project>/scenes/**/*.scene.json` (`scene.schema.json` + scene-extensions)
- `examples/<project>/prefabs/**/*.prefab.json` (`prefab.schema.json`)
- `examples/<project>/assets/runtime/materials/**/*.material.json` (`material.schema.json`)
- `examples/<project>/assets/runtime/**/*.lod.json` (`lod.schema.json`)
- `examples/<project>/assets/_sources/asset-sources.json` (`asset-sources.schema.json`)
- `examples/<project>/playtests/**/*.json` (`playtest.schema.json`)
- `examples/<project>/schemas/scene-extensions.schema.json` (drift only — extensions reference engine schemas)
- `net/protocol/*.schema.json` (when the project declares a multiplayer profile)

## Rules

- Run `engine check` BEFORE running any browser test. Static failures are cheaper to diagnose.
- Diagnostics ARE the contract. Don't pattern-match on the `message` field — it's free-form. Match on `code`.
- Adding a new code requires a unit test (paired with a fixture under `tests/fixtures/`). See the S54 `scene-instance-*` fixtures for the pattern.
- Warnings are TODOs. A scene at sprint close should have zero warnings unless deliberately deferred.

## Verification

- Valid fixtures pass.
- Invalid fixtures fail with the expected `code`.
- `engine doctor` recommendations reflect the project state (e.g. Prefabs section reports the actual instance / unused counts).
