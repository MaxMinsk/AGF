# Skill: scene-authoring

## Trigger

Use when adding or modifying scenes, prefabs or entity/component data.

## Workflow

1. Find the target project manifest (`examples/<project>/project.json`).
2. Inspect existing component names and schemas — `npm run engine:list -- components examples/<project>` shows built-ins + project-local extensions.
3. Use stable, readable entity ids (`drone.player`, `beacon.west`). Avoid random suffixes.
4. Add components as data only — never encode behaviour in scene JSON.
5. For repeated entities, factor a prefab (see [`prefab-authoring.md`](prefab-authoring.md)) and reference it via the scene's `instances[]`.
6. Run `engine check examples/<project>` after every change. Treat warnings as TODOs.
7. If visible output changes, run a browser smoke or playtest.

## Scene shape

```json
{
  "id": "start",
  "environment": {
    "kind": "hdr",
    "url": "runtime/hdr/venice_sunset_1k.hdr",
    "intensity": 1.0,
    "asBackground": true,
    "backgroundBlurriness": 0.35
  },
  "entities": [ /* { id, components } */ ],
  "instances": [ /* { id, prefab, overrides? } */ ]
}
```

- `environment.kind`: `"generated"` (RoomEnvironment, the default), `"none"`, `"hdr"`, `"cube"`. HDR + cube go through PMREMGenerator for IBL; `asBackground` re-binds the texture as the visible sky (with optional `backgroundBlurriness` in `[0, 1]`).
- `entities[]`: full inline declarations. Each entity has `id` (unique, kebab-or-dot-cased) + `components` (a map keyed by component name).
- `instances[]`: prefab instantiation. Each entry references a `prefabs/<id>.prefab.json`; the runtime expands them flat at scene-load time. Diagnostics: `AGF_SCENE_INSTANCE_PREFAB_MISSING` / `AGF_SCENE_INSTANCE_DUPLICATE_ID`.

## Transform + hierarchy

`Transform` carries `position` (xyz), `rotation` (Euler XYZ in **degrees**, converted to radians once by the resolver), `scale`, and an optional `parent` referencing another entity's id. The renderer reads resolved `LocalToWorld` matrices from `TransformResolveSystem` — never store world-space matrices in the scene yourself.

## Built-in components an authoring agent should know

- `Transform { position, rotation, scale, parent? }`
- `Name { label }`
- `Camera { kind: "perspective", active, fov?, near?, far? }`
- `Light { kind: "ambient" | "directional" | "point" | "spot" | "hemisphere" | "rect-area", color, intensity, castShadow?, shadow? }`
- `MeshRenderer { mesh, material?, color? }` — `mesh` is `box / sphere / cylinder / plane` or `runtime/models/<name>.glb`; `material` is the **full path** `runtime/materials/<id>.material.json` (not the bare manifest id).
- `ShadowFlags { cast, receive }`
- `ShadowCaster { dynamic }` — tag entities that move each frame so `DynamicShadowSystem` keeps their shadow up to date; static-tagged casters skip the per-frame shadow re-render.
- `Spin { axis: "x" | "y" | "z", speed }` — continuous rotation in degrees/sec. Use this before scaffolding a project-local rotation system.
- `Tween { component, property, from, to, duration, ease, loop, ... }` — data-driven interpolation.
- `WaypointMover { waypoints, loop, faceForward }` — patrol path with `faceForward` writing yaw.
- `Batchable { enabled?, group?, path? }` — auto-batch override.
- `Pickable / Repairable / Hazard / Pickup` (beacon-world); `RtsCamera` (shadows-bench); `GroupRotator` does NOT exist — use `Spin`.

## Project-local components

Add to `examples/<project>/schemas/scene-extensions.schema.json` under `components.<Name>`. Reference from any entity once declared. `engine check` validates the extension shape and the values in scenes.

## Common pitfalls

- **Bare manifest id in `MeshRenderer.material`.** Use the full path.
- **Pre-converting `Transform.rotation` to radians.** Scenes are degrees.
- **Encoding behaviour in scene JSON** (e.g. a component called `OnClickSpawnEnemy`). Behaviour goes in scheduler-registered systems; the scene declares data.
- **Missing `instances[]` cross-validation.** A typo'd prefab name silently drops the entity in older builds — current `engine check` surfaces `AGF_SCENE_INSTANCE_PREFAB_MISSING`. Always rerun check after authoring.
- **HDR set as env but `asBackground` omitted.** The HDR becomes IBL only; the visible background stays whatever `project.render.background` says.

## Verification

- `npm run engine:check -- examples/<project>` clean.
- `npm run engine:inspect -- examples/<project> --entity <new-id>` shows the entity + component values.
- For visible changes, `npm run dev` and load `/?project=<id>`, or run the existing Playwright smoke for that project.
