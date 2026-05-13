# Skill: engine-check

## Trigger

Use when project data, schemas, scenes, prefabs, materials, shaders or protocol files change.

## Workflow

1. Inspect the changed files.
2. Run `engine check <projectDir>` once the CLI exists.
3. If the CLI is not implemented yet, validate manually against the schema/research notes.
4. Report diagnostics with file, JSON path and suggestion.

## Expected Files

- `schemas/**/*.json`
- `examples/**/project.json`
- `examples/**/scenes/*.scene.json`
- `examples/**/materials/*.material.json`
- `net/protocol/*.schema.json`

## Verification

- Valid fixtures pass.
- Invalid fixtures fail with actionable diagnostics.

