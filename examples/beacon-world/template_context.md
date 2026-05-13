# Beacon World — Template Context

This file is the gameplay brief an agent should read before editing Beacon World. It complements `template.json` (machine-readable) and the engine's schema docs (technical truth).

## Pitch

Solo-first persistent salvage world. A `Salvage Drone` (`player.drone`) wanders an arena, picks up `Energy Core` pickups and deposits them at `Beacon` pillars to keep a `WorldSignal` healthy. Two `Hazard` pulses gate the routes; carriers drop their core and take damage on contact.

## Vocabulary

- **drone** — `player.drone` entity, `PlayerControlled` + `Carrier` + `Health` + `Respawnable`. Single-player it moves locally; under the `connected` profile its position is reconciled with the server-owned `player.<playerId>` entity.
- **energy core** — `Pickup { kind: "energy-core", originalPosition, respawnAfter }`. Two on the scene (`core.north`, `core.south`). Re-appear after `respawnAfter` seconds.
- **beacon** — `Repairable { accepts: "energy-core", decayAfter, repairedMaterial }` + `MeshRenderer`. Two on the scene (`beacon.west`, `beacon.east`). Repair on deposit; decay back after `decayAfter` seconds unless held.
- **hazard** — `Hazard { minRadius, maxRadius, period, damage, invulnerabilitySeconds }`. Pulses every `period` seconds. Contact drops the carried core and damages the carrier.
- **round signal** — `WorldSignal { health, target, tau }` + `RoundState { phase, thresholdHealth, holdSeconds, holdProgress, autoResetSeconds, scores }` on the singleton `world.signal` entity. Smoothed ratio of repaired beacons. Hold above threshold for `holdSeconds` → round complete.
- **scoreboard** — cumulative repair count per `playerId` lives on `RoundState.scores`; per-beacon ownership lives on `Repairable.lastRepairedBy` and clears each round.

## How To Extend

| Goal | Pattern |
|---|---|
| Add a new pickup kind | Add a `Pickup` entity to the scene with a new `kind` string. Add or extend a `Repairable.accepts` to match. Run `npm run engine:check -- examples/beacon-world`. |
| Add a new component | Declare in `schemas/scene-extensions.schema.json` under both `components` and `definitions`. Add the matching TypeScript type and a system if behaviour is needed. Register the system in `bootstrap.ts`. |
| Add a material | Drop `<name>.material.json` under `assets/runtime/materials/`. Append an entry to `assets/_sources/asset-sources.json`. `engine check` enforces this. |
| Add a playtest | Drop `<scenario>.playtest.json` under `playtests/`. The robot runner picks it up automatically. |
| Tune the round | Adjust `RoundState.thresholdHealth` / `holdSeconds` / `autoResetSeconds` on `world.signal` in `scenes/start.scene.json`. |

## Profiles

- `static` — the default, single-player loop. Local drone movement, local hazards, local repair / decay.
- `connected` — pairs with a backend over `?server=ws://...&networked=1`. Local drone position becomes a mirror of the server-owned `player.<playerId>` entity, reconciled via rollback-replay against acked inputs.

## Verify Before Shipping

```bash
npm run engine:check -- examples/beacon-world
npm run engine:summarize -- examples/beacon-world
npm run test
npm run playtest examples/beacon-world
```
