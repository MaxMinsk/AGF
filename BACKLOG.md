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

## Current Sprint: Sprint 5 - Backend Contracts

Goal: land the backend-facing seams that Sprint 2's archive parked here — a stable wire schema, a clearly-bounded reference backend skeleton, and the scene-side components that make presence and authority explicit.

### Epic 10: Backend-Agnostic Persistent World Seam

**Story 10.1: Protocol Schema v0**

Status: Implemented.

Tasks:

- Author `schemas/protocol.schema.json` as a discriminated union over `kind`.
- Cover four v0 message kinds: `world.snapshot`, `player.join`, `player.leave`, `intent.move`.
- Each variant fixes its payload shape with `additionalProperties: false`; envelope-level `sequence` is optional and monotonic.
- Reuse the dot-namespaced `kind` style from `EngineCommand` so the wire vocabulary stays consistent with the client-side command pipeline.
- Add ADR-0007 documenting the choice (JSON Schema discriminated union; no binary wire format at v0).
- Validate the schema directly via `ajv` in a unit test with valid + invalid fixtures for each `kind`.

Acceptance criteria:

- Schema compiles under `ajv` (`strict: false`) without errors.
- Sample messages of each kind validate; intentionally broken messages (unknown kind, missing required field, wrong-arity vector, unknown reason enum) fail.
- ADR-0007 is referenced from `docs/adr/README.md` placement (numbered next to existing ADRs).

Verification:

- `npm test` — 10 new protocol-schema cases.

**Story 10.2: Reference Backend Skeleton Boundary** (next)

Tasks/acceptance/verification expanded when picked up.

**Story 10.3: Network / World Components In Scene Schema** (next)

Tasks/acceptance/verification expanded when picked up.

### Sprint 5 Candidates Not Picked Yet

- `13.4` Pickup component + spawner — energy core entity, lifetime, world-spawn system.
- `13.5` Carry / deposit interaction — drone picks a core up on proximity, drops it on a beacon, beacon switches to a "repaired" material.
- `14.3` Real authored `.glb` for Beacon World drone/beacons.
- `15.1` In-page inspector overlay.
- `16.1` Material file hot reload.
- `17.1` Scene editor command palette.

## Next Sprint: TBD

Will be detailed when Sprint 5 reaches close.
