# Diagnostic Codes

AGF diagnostics are designed for agents. Every emitted diagnostic must include `code`, `file`, `path`, `severity`, `message` and, when possible, `suggestion`. This document is the canonical list of `code` values so they do not drift between tools.

## Naming

Codes follow `AGF_<DOMAIN>_<SUBJECT>_<DETAIL>`:

- `AGF_` prefix is mandatory so codes do not collide with external tools.
- `<DOMAIN>` is one of: `PROJECT`, `SCENE`, `ASSET`, `LOD`, `TEXTURE`, `PREFAB`, `SCHEMA`, `JSON`, `FILE`, `CLI`, `RUNTIME`, `PROTOCOL`, `RIGIDBODY3D`, `COLLIDER3D`, `SHADOW`, `CSM`, `TRANSFORM`.
- `<SUBJECT>` names the offending concept (e.g. `START_SCENE`, `ASSET_ROOT`, `ENTITY_ID`).
- `<DETAIL>` is the failure mode (e.g. `MISSING`, `DUPLICATE`, `INVALID`).
- Use uppercase ASCII letters, digits and underscores only. No locale-sensitive characters.
- Once shipped, treat a code as a stable identifier. Renaming a code is a breaking change for any agent or test that pattern-matches on it.

## Severities

- `error` — blocks further work; CLI exits with code `1`.
- `warning` — surfaces a likely issue but does not block.
- `info` — runtime only (diagnostics bus); never returned by `engine check`.

## Schema / file domain

| Code | Severity | Where it fires | Notes |
| --- | --- | --- | --- |
| `AGF_FILE_MISSING` | error | `engine/tools/check/project-check.ts` | Required JSON file does not exist on disk. |
| `AGF_JSON_PARSE_FAILED` | error | `engine/tools/check/project-check.ts` | JSON file present but could not be parsed. |
| `AGF_SCHEMA_VALIDATION_FAILED` | error | `engine/tools/check/project-check.ts` | Generic AJV failure that does not fit a more specific code. |
| `AGF_SCHEMA_REQUIRED_PROPERTY` | error | `engine/tools/check/project-check.ts` | A required JSON property is missing. |
| `AGF_SCHEMA_UNKNOWN_PROPERTY` | error | `engine/tools/check/project-check.ts` | Schema has `additionalProperties: false` and the file added an unknown key. |

## Project / scene domain

| Code | Severity | Notes |
| --- | --- | --- |
| `AGF_PROJECT_START_SCENE_MISSING` | error | `project.json#startScene` points to a file that does not exist. |
| `AGF_PROJECT_ASSET_ROOT_MISSING` | error | `project.json#assetRoot` is not a directory. |
| `AGF_SCENE_DUPLICATE_ENTITY_ID` | error | Two entities in the same scene share an `id`. |
| `AGF_SCENE_INSTANCE_PREFAB_MISSING` | error | A `scene.instances[].prefab` ref does not resolve to a declared `prefabs/<id>.prefab.json`. (S54 M3-c-load) |
| `AGF_SCENE_INSTANCE_DUPLICATE_ID` | error | A `scene.instances[].id` collides with an existing entity id in the same scene. (S54) |
| `AGF_TRANSFORM_PARENT_MISSING` | error | `Transform.parent` references an entity not in the scene. |
| `AGF_TRANSFORM_PARENT_SELF` | error | `Transform.parent` is the entity's own id. |
| `AGF_TRANSFORM_PARENT_CYCLE` | error | The parent chain forms a cycle. |

## Asset / LOD / texture domain

| Code | Severity | Notes |
| --- | --- | --- |
| `AGF_ASSET_SOURCES_MISSING` | warning | `assets/_sources/asset-sources.json` is absent under `assetRoot`. |
| `AGF_ASSET_REFERENCE_INVALID` | error | A mesh / material reference escapes `assetRoot` or is absolute. |
| `AGF_ASSET_REFERENCE_MISSING` | error | A mesh / material reference points to a non-existing file. |
| `AGF_LOD_DISTANCES_OUT_OF_ORDER` | error | A `.lod.json` chain's `maxDistance` values are not strictly ascending. (S54) |
| `AGF_LOD_DISTANCE_DUPLICATE` | error | Two LOD levels share the same `maxDistance`. (S54) |
| `AGF_LOD_MESH_MISSING` | error | An LOD level's `mesh` ref does not resolve under `assetRoot`. (S54) |
| `AGF_TEXTURE_HUGE` | warning | A texture referenced from a material manifest is uncompressed and `> 1 MB`. (S54 texture-doctor) |
| `AGF_TEXTURE_NPOT` | warning | A material-map texture has non-power-of-two dimensions; some GPUs miss mipmap filtering. (S54) |
| `AGF_TEXTURE_NO_TRANSCODER` | error | A `.ktx2` ref appears in a manifest but the Basis transcoder is not vendored. (S54) |

## Prefab domain

| Code | Severity | Notes |
| --- | --- | --- |
| `AGF_PREFAB_INVALID` | error | A `prefabs/<id>.prefab.json` fails its schema. |

## Physics domain (M24)

| Code | Severity | Notes |
| --- | --- | --- |
| `AGF_RIGIDBODY3D_DYNAMIC_TRIMESH` | error | A dynamic `RigidBody3D` carries a `Collider3D { kind: "trimesh" }` — Rapier does not support dynamic trimeshes. |
| `AGF_COLLIDER3D_HEIGHTFIELD_DIMS` | error | A heightfield collider's `rows × cols` does not match the inline `heights` array length. |
| Other `AGF_RIGIDBODY3D_*` / `AGF_COLLIDER3D_*` | error / warning | See `engine/tools/check/project-check.ts#validatePhysicsColliders` for the full list. |

## Shadow / CSM domain

| Code | Severity | Notes |
| --- | --- | --- |
| `AGF_CSM_DIRECTIONAL_CONFLICT` | warning | Scene has a `castShadow: true` directional light while `project.render.shadows.csm.enabled: true` is also set — CSM brings its own lights. (S47) |

## Runtime domain

These fire from the diagnostics bus inside the page, not from `engine check`:

| Code | Severity | Notes |
| --- | --- | --- |
| `AGF_RUNTIME_ASSET_NO_LOADER` | error | An asset ref has no matching `AssetLoader.matches` entry. |
| `AGF_RUNTIME_ASSET_LOAD_FAILED` | error | A loader matched but the fetch / parse failed. |
| `AGF_RUNTIME_CONTEXT_LOST` | warning | WebGL context loss event observed. |
| `AGF_RUNTIME_CONTEXT_RESTORED` | info | WebGL context restored; renderer rebuilt GPU resources. |

## Workflow

When adding a new validator or tool that emits diagnostics:

1. Pick the smallest existing code that fits. Prefer reusing over inventing.
2. If a new code is needed, choose the domain / subject / detail and add a row to the table above in the same patch.
3. Add a unit test that asserts on the new `code` so accidental renames break a test.
4. Surface a useful `suggestion` for the most likely fix.

## Anti-Patterns

- Do not localize messages or codes. Diagnostics are an agent contract, not user-facing UI.
- Do not free-form messages without a code; downstream tooling matches on `code`.
- Do not change a code's meaning to fit a new case — add a new code instead.
