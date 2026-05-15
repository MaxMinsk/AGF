# Skill: prefab-authoring

## Trigger

Use when ≥2 entities in a scene would share ≥3 components — that's the rough threshold where a prefab cuts duplication. Also use when an agent needs to spawn the same entity shape at runtime later (planned `entity.spawnPrefab` command lands in a future sprint).

## Concepts

- **Prefab manifest** — a `examples/<project>/prefabs/<id>.prefab.json` declaring shared default components.
- **Scene instance** — a `scene.instances[]` entry referencing a prefab id + per-instance overrides.
- **Expansion** — at scene-load time, `expandScenePrefabs(scene, registry)` flattens every instance into a regular entity, then `World.fromScene` creates the world. Expansion diagnostics route to the project's diagnostics bus.

## Workflow

1. Identify shared components. The threshold is "would I copy-paste this entity block more than once".
2. Author the manifest:

   ```json
   {
     "agfFormatVersion": 1,
     "id": "energy-core",
     "description": "Pickup core that drones can carry to a beacon.",
     "components": {
       "Transform": { "rotation": [0, 0, 0], "scale": [0.4, 0.4, 0.4] },
       "MeshRenderer": { "mesh": "runtime/models/core.glb", "color": "#4af0a8" },
       "Pickup": { "kind": "energy-core", "respawnAfter": 4 },
       "Networked": { "authority": "server" },
       "RigidBody3D": { "type": "fixed" },
       "Collider3D": { "kind": "sphere", "radius": 1.2, "sensor": true }
     },
     "tags": ["pickup", "core"]
   }
   ```

3. In the scene, replace inline entities with `scene.instances[]`:

   ```json
   "instances": [
     {
       "id": "core.north",
       "prefab": "energy-core",
       "overrides": {
         "Name": { "label": "Energy Core (north)" },
         "Transform": { "position": [-1.5, 0.4, -2.5] },
         "Pickup": { "originalPosition": [-1.5, 0.4, -2.5] }
       }
     }
   ]
   ```

4. Run `engine check`. The checker resolves every `instances[].prefab` against the on-disk registry — typos surface as `AGF_SCENE_INSTANCE_PREFAB_MISSING`.

## Overrides

`overrides` is a **shallow merge per top-level component**. The instance's `Transform.position` replaces the prefab's `Transform.position`; the prefab's `Transform.rotation` / `Transform.scale` survive because the override doesn't mention them.

Nested arrays do **not** deep-merge. If the prefab has `Tweens: [{...A}]` and the instance overrides with `Tweens: [{...B}]`, the result is `[{...B}]` — not the concatenation.

Per-instance fields the override usually carries:

- `Name.label` — human-readable label.
- `Transform.position` (always per instance).
- `Transform.rotation` / `Transform.scale` when they differ.
- `Spin.speed` direction (e.g. `25` vs `-25` for left/right rotation).
- `Pickup.originalPosition` — must match the entity's spawn pos so respawn lands in the same spot.
- `BeaconLight.beaconId` — when a light points at a specific entity.

## When NOT to extract a prefab

- Only one entity will ever match the shape.
- Components differ enough that the override list rivals the manifest in size.
- The shared entity needs runtime spawning *today* — current `M3` v0 supports authoring-time expansion only.

## Diagnostics

- `AGF_SCENE_INSTANCE_PREFAB_MISSING` — the prefab id doesn't resolve to a `prefabs/<id>.prefab.json`. Fix: add the manifest or correct the ref.
- `AGF_SCENE_INSTANCE_DUPLICATE_ID` — an instance id collides with an existing entity id in the same scene. Fix: rename one.
- `AGF_PREFAB_INVALID` — the manifest itself fails its schema. Check `id` is kebab-case, `components` is a non-empty object.

## Doctor section

`engine doctor` `Prefabs:` section reports:

- Total declared prefab count.
- Total scene-instance count across all `scenes/**/*.scene.json`.
- Top-3 most-used prefab ids.
- Unused declared prefabs (candidate for deletion or runtime-only spawn).
- Missing prefab refs (paired with the engine-check error).

## Worked example — beacon-world (S54 M3-c-beacon)

`examples/beacon-world/prefabs/beacon.prefab.json` declares the shared bits of a salvage beacon (Spin / Repairable / Networked / capsule collider / mesh + material). Four inline `beacon.west` / `beacon.east` / `core.north` / `core.south` entities collapsed into a `scene.instances` block with per-instance `Name` / `Transform` / `Spin.speed` / `Pickup.originalPosition` overrides. Scene JSON dropped from 356 → 300 lines; entity ids preserved so `BeaconLight.beaconId` cross-references still resolve.

## Verification

- `engine check examples/<project>` passes.
- `engine inspect examples/<project>` shows every instance materialised with the correct merged components.
- `engine doctor examples/<project>` Prefabs section reports the expected counts.
- Scene visually identical before / after the refactor — capture a Playwright screenshot or run the playtest as a guard.
