# Skill: scene-authoring

## Trigger

Use when adding or modifying scenes, prefabs or entity/component data.

## Workflow

1. Find the target project manifest.
2. Inspect existing component names and schemas.
3. Prefer stable, readable entity ids.
4. Add components as data only.
5. Run `engine check`.
6. If visible output changes, run a browser smoke/playtest when available.

## Rules

- Do not encode behavior inside scene data.
- Do not use random ids if a human-readable id is stable enough.
- Do not reference missing assets or materials.
- Keep component values serializable.

## Verification

- Scene passes validation.
- Runtime inspect can show the new entity.
- Screenshot/playtest confirms visible changes when relevant.

