# Template Policy

AGF examples may become templates, but examples are maintained source projects, not generated archives.

## Principles

- A template must come from a working, tested example.
- A template must be small enough for agents to inspect quickly.
- A template must encode AGF best practices: schemas, commands, tests and asset metadata.
- A template should not include protected IP or untracked generated assets.

## Initial Candidates

- `examples/hello-3d`
- `examples/beacon-world`
- `examples/shader-lab`
- `examples/persistent-world-client`
- `examples/backends/dotnet-world-server`
- `examples/backends/node-world-server`

## Promotion Criteria

Promote an example pattern into a template only when:

- it has passed typecheck, unit tests and browser smoke tests;
- project data validates through `engine check`;
- assets have source metadata;
- docs explain how an agent should modify it;
- at least two future examples would benefit from the pattern.

## Anti-Goals

- Do not treat one-shot generated game archives as maintained examples.
- Do not build template evolution machinery before AGF has several stable examples.
- Do not let templates bypass normal engine APIs.

