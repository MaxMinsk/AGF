# Dev Loop Best Practices

Sprint 0 note. Focus: fast agent iteration.

## Target Loop

```text
edit project files -> validate -> normalize -> diff -> commands -> browser state update -> inspect/screenshot/playtest
```

## Vite HMR Rules

- Use `import.meta.hot.accept` for HMR boundaries.
- Use `import.meta.hot.dispose` to clean persistent side effects.
- Use `import.meta.hot.data` for state that must survive module replacement.
- Use `import.meta.hot.invalidate` when a patch cannot be safely applied.
- Scene JSON HMR should compile to command patches, not full reload by default.

## Playwright Rules

- Browser smoke tests should prove the canvas is present and nonblank.
- Visual checks should prefer stable screenshots and explicit pixel/canvas assertions.
- Save screenshots on failure.
- Enable traces on retry/failure once Playwright is configured.
- Use runtime inspect APIs for state assertions instead of only image comparison.

## Agent Artifacts

Target artifact layout:

```text
.agent/
  screenshots/
  traces/
  metrics/
  replays/
  diagnostics/
```

## Open Questions

- Whether `.agent/` should be gitignored by default.
- Exact nonblank canvas assertion strategy.
- When to record video versus screenshots/traces.

## Sources

- Vite HMR API: https://vite.dev/guide/api-hmr
- Playwright visual comparisons: https://playwright.dev/docs/test-snapshots
- Playwright traces: https://playwright.dev/docs/trace-viewer-intro

