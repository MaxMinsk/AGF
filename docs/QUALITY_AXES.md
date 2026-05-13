# Quality Axes

AGF needs more than "the build passed." These axes define how agents and humans should evaluate progress.

## Build Health

The codebase compiles and tests run.

Planned checks:

- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run preflight`

## Runtime Health

The browser app opens without fatal runtime errors.

Planned checks:

- Playwright smoke test.
- Nonblank canvas assertion.
- Runtime diagnostics snapshot.

## Scene Validity

Project data is valid and actionable errors are reported before runtime.

Planned checks:

- `engine check`
- valid and invalid fixtures;
- diagnostics with file/path/severity/message/suggestion.

## Playability

A robot or scripted policy can complete a small goal.

Planned checks:

- robot playtests;
- command logs;
- goal metrics;
- screenshots on failure.

## Visual Readability

The rendered scene communicates expected objects, camera framing and state.

Planned checks:

- screenshot artifacts;
- pixel/canvas checks;
- later optional human or model review after deterministic checks.

## World Contract Health

Client and backend implementations agree on protocol and world-state contracts.

Planned checks:

- protocol schema validation;
- generated or validated TS/C#/Node contracts;
- simulated clients;
- network replay fixtures later.

