# Agent Review Checklist

Use this before closing a task. Pair with `AGENTS.md#Hard Rules` for the non-negotiables.

## Architecture

- [ ] `engine/core` avoids Three.js, DOM, Vite and Playwright imports.
- [ ] Gameplay logic lives in scheduler-registered systems reading components, not in renderer adapters or bootstrap glue.
- [ ] New runtime mutation is represented as a command when meaningful.
- [ ] No project-local clone of an existing engine primitive (e.g. `Spin`, `Tween`, `WaypointMover`, `ParticleEmitter`).
- [ ] Backend code is optional and does not become a client dependency.

## Data + Schemas

- [ ] New project data has schema coverage (scene / prefab / material / LOD / asset-sources / project / playtest).
- [ ] Material `MeshRenderer.material` refs are full paths (`runtime/materials/<id>.material.json`), not bare ids.
- [ ] Texture refs inside material manifests are project-relative (`runtime/textures/...`), resolved via the asset registry — no absolute URLs.
- [ ] Scene `instances[]` resolve to a real `prefabs/<id>.prefab.json` (engine check catches missing refs).
- [ ] `Transform.rotation` is degrees, not radians.

## Tests

- [ ] Unit tests cover nontrivial core behaviour.
- [ ] Browser behaviour has Playwright coverage or a documented reason.
- [ ] Schema changes have valid and invalid fixtures (paired files under `tests/fixtures/`).
- [ ] Network / protocol changes validate both TS and C# contract expectations.

## Diagnostics + Agent Experience

- [ ] Repository docs, code comments, identifiers, diagnostics and in-app text are in English.
- [ ] New diagnostics carry `code`, `file`, `path`, `severity`, `message`, `suggestion`.
- [ ] `docs/diagnostics.md` lists any new `AGF_*` code.
- [ ] Suggestions are concrete when the fix is guessable.
- [ ] Skills / docs under `docs/agent/` mention new commands, components or workflows.
- [ ] Generated files (`docs/generated/`, `dist/`) are not edited manually.

## Performance Hygiene

- [ ] Frame-update systems read cached `createQuery` handles, not raw `world.query()` (cold paths may use raw `query()` with a `// agf-allow: world.query` marker).
- [ ] No per-frame Three.js resource allocation (`new MeshStandardMaterial`, `new BufferGeometry`, `new Texture`, …).
- [ ] If you added a transmissive material in a batched scene, `render.batching.auto` is still appropriate (transmission pre-pass + auto-batch interact).

## Final Summary

- [ ] State what changed.
- [ ] State how it was verified.
- [ ] State residual risks or skipped checks.
- [ ] BACKLOG.md story is marked `Status: Implemented` with a one-paragraph deliverable description.
