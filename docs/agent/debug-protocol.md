# Debug Protocol

This draft is inspired by OpenGame's debug-skill idea, adapted for AGF's human + agent development model.

## Principle

Prefer deterministic validation, tests and artifacts over guessing. If the same failure happens twice, turn it into a rule, validator, test or skill.

## Loop

1. **Observe:** collect diagnostics, console output, screenshot, trace, command log, world snapshot and metrics when available.
2. **Diagnose:** identify the failing layer: project data, schema, core ECS, command pipeline, renderer adapter, browser test, asset loading or backend contract.
3. **Repair:** make the smallest change at the lowest failing layer.
4. **Verify:** rerun the smallest failing test first, then broader checks.
5. **Record:** update docs, known failures, tests or validators if the issue is likely to recur.

## Initial Failure Taxonomy

- Invalid scene path.
- Unknown component.
- Duplicate entity id.
- Missing asset or material.
- Asset failed to load.
- Blank canvas.
- Shader compile failure.
- Command rejected.
- World snapshot mismatch.
- Backend protocol mismatch.

## Artifact Targets

- Diagnostics JSON.
- Playwright screenshot.
- Playwright trace on failure.
- Command log.
- World snapshot.
- Playtest metrics.
- Network replay for backend issues later.

## Rule

Do not patch symptoms in renderer or browser tests when a schema or project-data validator can catch the issue earlier.

