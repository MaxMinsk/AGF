# Spike: Schema Validation

## Goal

Choose a validation approach for scene/project/material/protocol files.

## Proposed Experiment

- Create one valid scene fixture.
- Create invalid fixtures for unknown component, duplicate entity id and missing material.
- Compare Ajv and Zod for diagnostics.
- Check how easily JSON path can be reported.
- Check TypeScript type generation strategy.

## Current Leaning

Use JSON Schema as source of truth and Ajv for validation. Add hand-written TypeScript types in Sprint 1 if codegen is too much too early.

## Recommendation

Do not block Sprint 1 on perfect type generation. Prioritize diagnostics quality: file, path, severity, message and suggestion.

