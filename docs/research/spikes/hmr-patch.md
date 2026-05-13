# Spike: HMR Scene Patch

## Goal

Confirm that scene JSON edits can become command patches without full page reload.

## Proposed Experiment

- Import a scene JSON file through Vite.
- Add `import.meta.hot.accept` for scene updates.
- Validate new scene data.
- Diff old normalized scene and new normalized scene.
- Apply `component.set`, `entity.create`, `entity.delete` commands.
- Preserve camera/debug state through `import.meta.hot.data`.

## Fallback Behavior

- Invalid JSON/schema: keep current world alive and report diagnostics.
- Unsafe patch: call `invalidate` and full reload.
- Deleted selected entity: clear inspector selection.

## Recommendation

Sprint 2 should implement scene diff and command patching before script hot reload.

