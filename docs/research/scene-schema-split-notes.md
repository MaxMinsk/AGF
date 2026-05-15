# scene.schema.json split — pre-investigation notes

Date: 2026-05-15
Status: Draft (Sprint 47 capture of user direction). Promote to a full investigation doc when Sprint 48 picks up `SCHEMA-scene-split`.

## Why split

`schemas/scene.schema.json` is ~800 lines and growing every sprint (Sprint 47 just added Tween / ParticleEmitter / CinematicCamera definitions). The file currently mixes:

- Scene root (id, entities, instances, environment).
- Entity shape + component bag.
- Core components (Name, Transform, Spin).
- Render components (MeshRenderer, Light, ShadowFlags, Batchable, LOD).
- Camera helpers (Camera, OrbitCamera, FollowCamera, CinematicCamera).
- Physics (RigidBody3D, Collider3D, CharacterController3D).
- Game-feel (Tweens, ParticleEmitter).
- Network (Networked, Presence).

For an agent opening the file cold this is becoming "drowned in one document". Splitting by **domain** (not one file per component — that becomes its own noise) keeps a single index file while making individual definitions easy to find.

## Recommended layout

```
schemas/
  scene.schema.json                 # root: id, entities, instances, environment, component registry
  common.schema.json                # vec3, colors, entityId, assetRef, positive numbers

  scene/
    entity.schema.json              # entity + component bag shape
    environment.schema.json         # generated / none / hdr / cube
    prefab-instance.schema.json     # instances[]

  components/
    core.schema.json                # Name, Transform, Spin
    render.schema.json              # MeshRenderer, Light, ShadowFlags, Batchable, LOD
    camera.schema.json              # Camera, OrbitCamera, FollowCamera, CinematicCamera
    physics-3d.schema.json          # RigidBody3D, Collider3D, CharacterController3D
    gamefeel.schema.json            # Tweens, ParticleEmitter
    network.schema.json             # Networked, Presence
    input.schema.json               # later: InputAction, PlayerControlled replacement
```

`scene.schema.json` stays as the entry point and the **component registry**:

```json
{
  "components": {
    "properties": {
      "Transform": {
        "$ref": "components/core.schema.json#/definitions/Transform"
      },
      "MeshRenderer": {
        "$ref": "components/render.schema.json#/definitions/MeshRenderer"
      },
      "RigidBody3D": {
        "$ref": "components/physics-3d.schema.json#/definitions/RigidBody3D"
      }
    }
  }
}
```

Agent opens one root, sees the catalog of available components, navigates to the per-domain file for details.

## Things not to break

1. **`engine check` AJV setup** currently compiles only the base scene schema. Needs a shared `schemaRegistry` that registers every built-in schema via `ajv.addSchema(...)` before compile.
2. **`engine list components` / `engine explain component`** must resolve external `$ref`s, not only `#/definitions/...`. Today the resolver only follows in-file refs.
3. **`engine docs`** must walk external refs when generating the project's Markdown catalog.
4. **Project-local extensions** stay as `examples/<project>/schemas/scene-extensions.schema.json` (the ADR-blessed path).
5. **Regression test**: existing valid + invalid scene fixtures should produce the same diagnostics after the split. Diff `engine check` output before vs after.

## Loose end to fix up-front

`engine/tools/components/list-components.ts` and `explain-component.ts` (S45) look at `project-local-components.schema.json`, but the actual ADR + runtime path uses `schemas/scene-extensions.schema.json`. Fix that mismatch *before* the split, otherwise the post-split component catalog won't see project-local components.

## Suggested rollout

1. **Schema split, no behaviour change.** Move definitions into per-domain files; add a schema registry that loads everything into AJV; keep every `engine check` diagnostic identical.
2. **Tooling update.** `engine list components` / `engine explain component` / `engine docs` learn to resolve external refs; same trip for project `scene-extensions.schema.json`.
3. **Optional bundled schema.** Generate `scene.schema.bundle.json` (inlined) for IDE / VSCode / external users if relative `$ref`s start to bite.

## Story shape

Single story: `SCHEMA-scene-split`. Acceptance criteria:

- [ ] `npm run engine:check:examples` — green, same diagnostics as before.
- [ ] Schema unit tests pass (valid + invalid fixtures).
- [ ] `npm run engine:list -- components` lists the same 17+ engine components + the project-local ones from `scene-extensions.schema.json`.
- [ ] `npm run engine:explain -- component Transform` and `component Collider3D` resolve through the external ref.
- [ ] `npm run engine:docs -- examples/hello-3d` regenerates without errors.
- [ ] No new dependencies. AJV's built-in external-ref resolver is enough.
