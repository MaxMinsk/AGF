# Skill: playtest-debugging

## Trigger

Use when a browser smoke test, robot playtest, screenshot or runtime interaction fails.

## Workflow

1. Read the failing test output and artifact paths.
2. Inspect runtime diagnostics through `window.__engine` once available.
3. Compare expected world snapshot to actual world snapshot.
4. Use screenshots for canvas/visual failures.
5. Use traces/videos for interaction timing failures.
6. Fix the smallest failing layer first: schema, core, adapter, then visual polish.

## Expected Artifacts

- screenshot on failure;
- metrics JSON;
- command log;
- Playwright trace on retry/failure;
- world snapshot when available.

## Verification

- Re-run the failing playtest.
- Re-run the smallest related unit test.

