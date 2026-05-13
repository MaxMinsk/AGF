# Backlog

Date: 2026-05-13

This file contains only the currently active detailed sprint work and the next detailed sprint. Keep broad roadmap items in `HIGH_LEVEL_BACKLOG.md`. Move completed sprint details to `BACKLOG_ARCHIVE.md` at sprint close.

## Repository Scope

This folder is the public repository root for the engine.

Example games live inside this repo as nested projects under `examples/`. The main dogfood sample game will be `examples/beacon-world/` when implementation reaches that point.

## Backlog Hygiene

- `HIGH_LEVEL_BACKLOG.md` tracks roadmap epics, parking-lot ideas and coarse priorities.
- `BACKLOG.md` tracks only the active detailed sprint and the next detailed sprint.
- `BACKLOG_ARCHIVE.md` stores completed sprint summaries and links to shipped artifacts.
- At sprint close, move completed sprint details out of `BACKLOG.md` and into `BACKLOG_ARCHIVE.md`.
- Do not let completed stories accumulate in the active backlog.
- Keep story text short enough for agents to load quickly.
- Each story should include tasks, acceptance criteria and verification.
- Documentation, code comments, identifiers, diagnostics and in-app text must be English.

## Current Sprint: Sprint 6 - Beacon World Gameplay Loop

Goal: give Beacon World its first real solo gameplay loop — pick up an energy core and deposit it on a beacon — and fix the layering bug it exposed (project-specific code accidentally living in the engine).

### Epic 13: Beacon World Gameplay

**Story 13.4: Pickup Entities In The Scene**

Status: Implemented.

Tasks:

- Add a `Pickup` component to `examples/beacon-world/schemas/scene-extensions.schema.json` (`kind: string`).
- Place two energy core entities (`core.north`, `core.south`) in `examples/beacon-world/scenes/start.scene.json` with `Pickup { kind: "energy-core" }`, an emissive-green sphere mesh and `Networked { authority: "server" }`.
- Static spawn for v0; runtime spawner with lifetime/respawn is a later story.

Acceptance criteria:

- `engine check examples/beacon-world` returns OK.
- `engine inspect` lists both cores with their `Pickup` component.
- The cores render as small emissive spheres in the browser at `?project=beacon-world`.

Verification:

- `npm run engine:check -- examples/beacon-world`
- `npm run engine:inspect -- examples/beacon-world`

**Story 13.5: Carry / Deposit Interaction**

Status: Implemented.

Tasks:

- Add `Carrier` and `Repairable` components to the Beacon World scene-extensions schema.
- Attach `Carrier {}` to the drone; `Repairable { accepts: "energy-core", repaired: false, repairedColor: "#4af0a8" }` to both beacons.
- Implement `examples/beacon-world/src/systems/pickup-system.ts`: per-frame, walks `Carrier + Transform` entities; picks up the nearest `Pickup` within `pickupRadius`; carries it slightly above the drone; deposits at a matching unrepaired `Repairable + Transform` within `depositRadius`. On deposit: remove the carried pickup, set `Repairable.repaired = true`, drop the beacon's material ref and switch to the inline `repairedColor`.
- Register the pickup system in `src/app.ts` only when `projectId === "beacon-world"`.
- Unit tests in `examples/beacon-world/tests/unit/pickup-system.test.ts` cover pick-up, no-pickup-when-out-of-range, follow-carrier transform, deposit on matching beacon, no deposit on mismatched accepts, no double-deposit.
- New Playwright e2e (`tests/e2e/beacon-world-gameplay.spec.ts`) drives the drone via `applyCommands`: teleport next to a core → drone carries it; teleport next to a beacon → beacon becomes repaired (color swap, material ref removed), the carried pickup vanishes, `Carrier.carrying` becomes undefined.

Acceptance criteria:

- Holding WASD into a core in dev mode triggers pickup; into a beacon triggers repair.
- `npm test` covers six unit cases; `npm run test:e2e` adds the gameplay-loop scenario.

Verification:

- `npm test` — 90 unit tests across 14 files.
- `npm run test:e2e` — 6 e2e tests.

### Architectural Fix

**Story F.1: Project-Specific Code Out Of The Engine**

Status: Implemented.

Tasks:

- Move `Pickup`, `Carrier`, `Repairable` component definitions out of `schemas/scene.schema.json` into `examples/beacon-world/schemas/scene-extensions.schema.json`.
- Teach `engine check` to load `<projectDir>/schemas/scene-extensions.schema.json` and merge it with the base scene schema before validation; suggestion list uses `[...builtInComponentNames, ...extensionComponentNames]`.
- Move `pickup-system.ts` out of `engine/core/systems/` into `examples/beacon-world/src/systems/`.
- Update `tsconfig.json` and `vitest.config.ts` to include `examples/*/src/**/*.ts` and `examples/*/tests/**/*.ts`.
- Register project-specific systems conditionally on `projectId` in `src/app.ts`.
- Capture the layering decision in ADR-0008.

Acceptance criteria:

- `engine/` no longer references any project-specific component or system.
- `engine check` on any project works whether or not the project ships a `scene-extensions.schema.json`.
- Test fixtures and existing tests still pass.

Verification:

- ADR-0008 lands; `engine check` green on both `hello-3d` (no extensions) and `beacon-world` (with extensions).

#### Asset polish

- `14.3` Real authored `.glb` for the Beacon World drone and beacons — replace primitives once an art pipeline appears.
- `16.1` Material file hot reload — `*.material.json` edits flow through the asset registry without a page reload.

#### Inspector and authoring tools

- `15.1` In-page inspector overlay — read-only entity/component tree, toggle hotkey TBD (not F12, not F2).
- `17.1` Scene editor command palette — DOM panel that runs `applyCommands` with autocomplete on entity ids and component names.

#### Backend follow-ups (when ready)

- `10.4` WebSocket transport for `node-world-server` — first real round-trip of protocol messages.
- `10.5` C#/.NET reference skeleton — `examples/backends/dotnet-world-server/` mirror of the Node skeleton, validating the same schema.

## Next Sprint: TBD

Will be detailed when Sprint 6 reaches close.
