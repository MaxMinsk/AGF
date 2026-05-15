# Debug Protocol

Adapted from OpenGame's debug-skill idea for AGF's agent + human development model.

## Principle

Prefer deterministic validation, tests and artifacts over guessing. If the same failure happens twice, turn it into a rule, validator, test or skill memo.

## Loop

1. **Observe.** Collect every available artifact:
   - `engine check` output.
   - `engine doctor` output (Batching / Shadows / Textures / Prefabs / Recommendations sections).
   - `__agf.diagnostics()` and the live SSE stream (`GET /__agf/events`).
   - Playwright trace / screenshot / video under `test-results/`.
   - World snapshot (`__agf.snapshot()` or `engine inspect --save`).
   - Renderer + frame timing (`__agf.rendererInfo()`, `__agf.frameTiming()`).
   - Bug-report bundle (`GET /__agf/bug-report`).

2. **Diagnose.** Identify the failing layer in order:
   1. Schema / project data — caught by `engine check`.
   2. Static project health — caught by `engine doctor`.
   3. Core ECS — diagnostics bus emits a runtime code.
   4. Command pipeline — the command was rejected.
   5. Renderer / asset adapter — `AppliedMaterialRef.status === "failed"`, `AGF_RUNTIME_ASSET_LOAD_FAILED`, etc.
   6. Browser test / Playwright — race or timing.
   7. Backend contract — protocol-schema validation.

3. **Repair.** Make the smallest change at the lowest failing layer. A schema fix is cheaper than a renderer workaround. A scene-data fix is cheaper than a runtime guard.

4. **Verify.** Rerun the smallest failing test first, then broaden:
   - `engine check examples/<project>`.
   - The single unit test that covers the area.
   - The Playwright smoke for the project.
   - `npm run preflight` only at sprint close.

5. **Record.** Update docs / a validator / a skill memo if the issue is likely to recur. Treat the second occurrence as a signal to encode the lesson into the codebase.

## Failure taxonomy + first-look diagnostic

| Symptom | First-look code | First-look file |
|---|---|---|
| Invalid scene path | `AGF_PROJECT_START_SCENE_MISSING` | `project.json#startScene` |
| Unknown component | `AGF_SCHEMA_UNKNOWN_PROPERTY` | scene JSON or `schemas/scene-extensions.schema.json` |
| Duplicate entity id | `AGF_SCENE_DUPLICATE_ENTITY_ID` | scene JSON |
| Prefab instance missing | `AGF_SCENE_INSTANCE_PREFAB_MISSING` | `scene.instances[*].prefab` or `prefabs/*.prefab.json` |
| Instance id collides | `AGF_SCENE_INSTANCE_DUPLICATE_ID` | scene JSON |
| Missing asset / material | `AGF_ASSET_REFERENCE_MISSING` | `MeshRenderer.mesh` / `.material` paths |
| Asset failed to load (runtime) | `AGF_RUNTIME_ASSET_LOAD_FAILED` | runtime diagnostics bus |
| Asset has no loader | `AGF_RUNTIME_ASSET_NO_LOADER` | runtime diagnostics bus |
| Blank canvas | (no diagnostic — manual) | `__agf.rendererReady`, `__agf.rendererInfo().drawCalls === 0` |
| Texture not painting | `AGF_TEXTURE_NO_TRANSCODER` / `AGF_RUNTIME_ASSET_LOAD_FAILED` | manifest texture refs |
| Huge texture warning | `AGF_TEXTURE_HUGE` | doctor Textures section |
| LOD chain ignored | `AGF_LOD_DISTANCES_OUT_OF_ORDER` / `AGF_LOD_MESH_MISSING` | `*.lod.json` |
| Shadow gone / wrong place | (no diagnostic) | doctor Shadows section + `__agf.renderer.invalidateShadowMap()` |
| Shader compile failure | three.js console error | gameplay code (look for inline `new MeshStandardMaterial`) |
| Command rejected | `AGF_RUNTIME_COMMAND_INVALID` | runtime bus |
| World snapshot mismatch | (no diagnostic) | `engine inspect --diff <before.json> <after.json>` |
| Backend protocol mismatch | `AGF_PROTOCOL_*` | `net/protocol/*.schema.json` |

## Artifact targets

- Diagnostics JSON (`__agf.diagnostics()` or `GET /__agf/diagnostics`).
- Playwright screenshot on failure + trace on retry.
- Command log (recording start / stop via dev-bridge).
- World snapshot (`__agf.snapshot()` or `engine inspect --save`).
- Renderer info + frame timing (`__agf.rendererInfo()`, `__agf.frameTiming()`).
- Bug-report bundle (`GET /__agf/bug-report`) — single endpoint that wraps the above for offline triage.

## Dev-bridge surface

DEV-only HTTP under `/__agf/*` — 12 routes, full table in [`skills/playtest-debugging.md`](skills/playtest-debugging.md). Day-to-day:

- `GET /__agf/health` — Playwright uses it to short-circuit dev-server spawn.
- `GET /__agf/snapshot` — same as `__agf.snapshot()` from outside the page.
- `GET /__agf/events` — SSE stream of live diagnostics + reload events.
- `POST /__agf/commands` — apply an `EngineCommand[]` from a debug tool.
- `POST /__agf/project-patch` — deep-merge a patch onto `project.json` on disk + Vite reloads.
- `POST /__agf/asset/invalidate` — drop the cached binding for one ref + refetch.
- `POST /__agf/recording/{start,stop}` — capture a `Recording` for replay.
- `GET /__agf/bug-report` — bundle for offline triage.

Production builds drop the bridge plugin entirely. Don't depend on these endpoints in shipped game code.

## Rules

- Do not patch symptoms in the renderer or browser tests when a schema or project-data validator can catch the issue earlier.
- Do not pattern-match on diagnostic `message` fields — match on `code`.
- Do not silence a diagnostic without filing a follow-up.
- Do not free 5173 between test runs — Playwright reuses the existing dev server.

## After fixing

- Confirm `engine check examples/<project>` is clean.
- Confirm `engine doctor examples/<project>` has no NEW recommendations beyond the ones recorded in the BACKLOG as deferred.
- If the failure could recur with a different project / scene shape, add a unit-test fixture under `tests/fixtures/` or a Playwright spec under `tests/e2e/`.
- If the lesson generalises, add a memo under `docs/agent/skills/` and link it from `claude-code.md`.
