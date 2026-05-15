# ADR-0011: Prefab instantiation — `scene.instances[]` + shallow override merge

## Status

Accepted (2026-05-15). Shipped Sprint 54 (`M3-c-load` + `M3-c-beacon`). Pure expander `expandScenePrefabs` landed in Sprint 30; runtime wiring + diagnostics + `engine check` cross-validation landed in S54.

## Context

Scenes accumulate copies of "almost the same entity" — the four beacon-world `beacon.west` / `beacon.east` / `core.north` / `core.south` entities each carried ~30 lines of nearly identical components. Without an instantiation layer, every change to the shared shape requires N edits. With one, the duplication collapses into a single `prefab` manifest + per-instance override block.

Three.js / Unity / Unreal solve this with prefab variants + inheritance + scene placement gizmos. AGF is agent-first JSON, so we want the smallest mechanism that an agent can author with confidence and `engine check` can validate statically.

## Decision

Three components, in order of authoring:

1. **Prefab manifest** at `examples/<project>/prefabs/<id>.prefab.json`, validated by `schemas/prefab.schema.json`:

   ```json
   {
     "agfFormatVersion": 1,
     "id": "energy-core",
     "components": {
       "Transform": { "rotation": [0, 0, 0], "scale": [0.4, 0.4, 0.4] },
       "Pickup": { "kind": "energy-core", "respawnAfter": 4 }
     },
     "tags": ["pickup", "core"]
   }
   ```

2. **Scene instance** under `scene.instances[]`:

   ```json
   "instances": [
     { "id": "core.north", "prefab": "energy-core",
       "overrides": { "Transform": { "position": [-1.5, 0.4, -2.5] } } }
   ]
   ```

3. **Pure `expandScenePrefabs(scene, registry)`** in `engine/core/scene/expand-prefabs.ts` flattens instances into entities + emits diagnostics. Called from `engine/runtime/start.ts` before `World.fromScene`. The registry is built at boot by `src/main.ts` via `import.meta.glob('../examples/<id>/prefabs/*.prefab.json')`.

### Override semantics — shallow merge per top-level component

```
overrides: { Transform: { position: [3, 0, 0] } }
prefab:    { Transform: { rotation: [0, 0, 0], scale: [0.6, 2.5, 0.6] } }
result:    { Transform: { position: [3, 0, 0], rotation: [0, 0, 0], scale: [0.6, 2.5, 0.6] } }
```

The override REPLACES the field it touches (`position`) and INHERITS the prefab's other fields (`rotation`, `scale`). Nested arrays do NOT deep-merge — `overrides.Tweens` fully replaces `prefab.Tweens`.

This is the simplest semantic that covers the beacon-world adoption cleanly and keeps `engine check` static. Deep-merge would require shape-aware semantics per component, which the JSON-Schema-first architecture explicitly avoids.

### Diagnostics

- `AGF_SCENE_INSTANCE_PREFAB_MISSING` (error) — instance refs an unknown prefab id.
- `AGF_SCENE_INSTANCE_DUPLICATE_ID` (error) — instance id collides with an existing entity id.
- `AGF_PREFAB_INVALID` (error) — manifest fails its schema.

The expander emits per-instance diagnostics into the project's diagnostics bus (so `__agf.diagnostics()` lists them) and routes the same set through `engine check`.

## Consequences

Pro:

- Beacon-world's scene shrank 356 → 300 lines (15 % reduction) with zero semantic change.
- Two prefab manifests + `instances[]` makes "add another beacon" a 6-line scene patch.
- Diagnostics catch typos at static check time, not at runtime.
- Scene-level fields (`environment`, future top-level keys) survive expansion — the expander preserves everything but `instances`.

Con:

- Shallow merge means an author overriding `Transform.position` must remember to NOT omit `rotation` if the prefab's rotation doesn't apply; the worked example (`beacon.east` with `rotation: [0, 30, 0]`) shows the pattern.
- No nested deep merge for arrays. If a project needs different `Tweens` per instance, it must repeat the whole `Tweens` array.
- No prefab variants / inheritance. Two similar prefabs duplicate; only justified once a project demands the abstraction.

## Validation

- `tests/unit/expand-prefabs.test.ts` — pure-function coverage of merge semantics + diagnostics.
- `tests/unit/scene-load-prefabs.test.ts` — integration with `World.fromScene`.
- `tests/unit/project-check.test.ts` — static cross-validation of `instances[].prefab` against on-disk registry.
- `tests/fixtures/scene-instance-valid` / `scene-instance-missing-prefab` / `scene-instance-duplicate-id` — engine check fixtures.
- Beacon-world Playwright smoke still passes post-refactor.

## Alternatives Considered

- **Deep-merge overrides.** Rejected — would need shape awareness per component (Transform.position is a vector to replace, but `Tweens[]` is an array to concatenate?). The complexity exceeds the savings on the projects we have.
- **Composition by tag** (`tags: ["pickup", "spinning"]` mixing component bundles). Loses the per-instance override fluency.
- **Inline prefab declaration in the scene.** Rejected — scenes stay slim, manifests stay shareable.
- **Runtime prefab spawning via a command (`entity.spawnPrefab`).** Worth doing later; v0 ships authoring-time expansion only.

## Notes

The skill memo `docs/agent/skills/prefab-authoring.md` covers authoring; `engine doctor` Prefabs section surfaces declared / used / unused / missing-ref counts.
