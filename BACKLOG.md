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

## Current Sprint: Sprint 28 — Record/Replay v0, schema docs, lazy renderer, bundle doctor, Cyrillic CI, sound pings

Sprint 28 focus: ship **M2** record/replay v0 (foundational for deterministic regression bisection), **M4** schema-driven docs gen, the two deferred polish items (lazy renderer, bundle-in-doctor), the long-pending Cyrillic CI check and Beacon World audio.

### Stories

#### M2 — Record / Replay v0

- `E.65` Recorder core — new `engine/runtime/recording/recorder.ts` captures the initial scene + every applied `EngineCommand` with timestamps. Optional ring-buffered or unbounded mode. Wires through `RuntimeHandle`.
- `E.66` `engine replay <file>` CLI — drives a headless `World` (no renderer) by replaying the captured commands and emits a final snapshot; supports `--expect <snapshot.json>` to fail on drift.
- `E.67` Record-replay unit test — record a deterministic command sequence on `hello-3d`, replay, diff the resulting snapshot — locks the contract.

#### M4 — Schema docs

- `E.68` `engine docs <projectDir>` v0 — render Markdown from `schemas/*.schema.json` and the project's `template_context.md` into `docs/generated/<projectId>/`. Includes one `index.md` per project.

#### Engine polish

- `E.63` Lazy renderer import — convert `engine/runtime/start.ts` to dynamically `import("../render/three-renderer")`; pair with the renderer-import-boundary lock so headless tooling can drop three from the chunk. (Carried over from Sprint 27.)
- `E.64` `engine doctor` bundle pass — re-use the existing `scripts/check-bundle-size.mjs` logic (or invoke it) and fold the largest-chunk gzipped size + bundle soft/hard violations into the doctor report.

#### Repo hygiene

- `RH.1` Cyrillic-in-repo GitHub Action — `.github/workflows/cyrillic-check.yml` greps tracked files for Cyrillic characters and fails CI. Outstanding since Sprint 2.

#### Beacon World gameplay

- `13.12` Sound pings — first audio cue on pickup / deposit / hazard damage in Beacon World. Use the Web Audio API; project-local audio under `examples/beacon-world/assets/runtime/audio/` (or short procedural beeps).

### Carried to Sprint 29

- `10.5+` C# skeleton WebSocket transport — real transport on top of the smoke skeleton.
- `10.14` Server-authoritative carry, `10.16` Snapshot delta encoding, `10.18` Server-side hazard / pickup state.
- `M13` Project-file patch contract (parking-lot, per kenji takeaways).
