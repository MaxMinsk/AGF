# Diagnostic Codes

AGF diagnostics are designed for agents. Every emitted diagnostic must include `code`, `file`, `path`, `severity`, `message` and, when possible, `suggestion`. This document is the canonical list of `code` values so they do not drift between tools.

## Naming

Codes follow `AGF_<DOMAIN>_<SUBJECT>_<DETAIL>`:

- `AGF_` prefix is mandatory so codes do not collide with external tools.
- `<DOMAIN>` is one of: `PROJECT`, `SCENE`, `ASSET`, `SCHEMA`, `JSON`, `FILE`, `CLI`, `RUNTIME`, `PROTOCOL`.
- `<SUBJECT>` names the offending concept, e.g. `START_SCENE`, `ASSET_ROOT`, `ENTITY_ID`.
- `<DETAIL>` is the failure mode, e.g. `MISSING`, `DUPLICATE`, `INVALID`.
- Use uppercase ASCII letters, digits and underscores only. No locale-sensitive characters.
- Once shipped, treat a code as a stable identifier. Renaming a code is a breaking change for any agent or test that pattern-matches on it.

## Severities

- `error` — blocks further work; CLI exits with code `1`.
- `warning` — surfaces a likely issue but does not block.

## Current Codes

| Code | Severity | Where it fires | Notes |
| --- | --- | --- | --- |
| `AGF_FILE_MISSING` | error | `engine/tools/check/project-check.ts` | Required JSON file does not exist on disk. |
| `AGF_JSON_PARSE_FAILED` | error | `engine/tools/check/project-check.ts` | JSON file present but could not be parsed. |
| `AGF_SCHEMA_VALIDATION_FAILED` | error | `engine/tools/check/project-check.ts` | Generic AJV failure that does not fit a more specific code. |
| `AGF_SCHEMA_REQUIRED_PROPERTY` | error | `engine/tools/check/project-check.ts` | A required JSON property is missing. |
| `AGF_SCHEMA_UNKNOWN_PROPERTY` | error | `engine/tools/check/project-check.ts` | Schema has `additionalProperties: false` and the file added an unknown key. |
| `AGF_PROJECT_START_SCENE_MISSING` | error | `engine/tools/check/project-check.ts` | `project.json#startScene` points to a file that does not exist. |
| `AGF_PROJECT_ASSET_ROOT_MISSING` | error | `engine/tools/check/project-check.ts` | `project.json#assetRoot` is not a directory. |
| `AGF_ASSET_SOURCES_MISSING` | warning | `engine/tools/check/project-check.ts` | `assets/_sources/asset-sources.json` is absent under `assetRoot`. |
| `AGF_ASSET_REFERENCE_INVALID` | error | `engine/tools/check/project-check.ts` | A mesh/material reference escapes `assetRoot` or is absolute. |
| `AGF_ASSET_REFERENCE_MISSING` | error | `engine/tools/check/project-check.ts` | A mesh/material reference points to a non-existing file under `assetRoot`. |
| `AGF_SCENE_DUPLICATE_ENTITY_ID` | error | `engine/tools/check/project-check.ts` | Two entities in the same scene share an `id`. |

## Workflow

When adding a new validator or tool that emits diagnostics:

1. Pick the smallest existing code that fits. Prefer reusing over inventing.
2. If a new code is needed, choose the domain/subject/detail and add a row to the table above in the same patch.
3. Add a unit test that asserts on the new `code` so accidental renames break a test.
4. Surface a useful `suggestion` for the most likely fix.

## Anti-Patterns

- Do not localize messages or codes. Diagnostics are an agent contract, not user-facing UI.
- Do not free-form messages without a code; downstream tooling matches on `code`.
- Do not change a code's meaning to fit a new case — add a new code instead.
