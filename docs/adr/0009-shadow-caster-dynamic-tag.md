# ADR-0009: ShadowCaster dynamic tag + DynamicShadowSystem

## Status

Accepted (2026-05-15). Implementation shipped Sprint 52 (`M21-shadow-static-caster-tag`) + Sprint 53 (`BEACON-shadow-caster-tag` + DSS visual-regression fix).

## Context

`WebGLRenderer.shadowMap.autoUpdate = true` is the three.js default — every directional light re-renders its shadow map every frame, regardless of whether anything in the scene moved. For static scenes (a parked camera, a procedural village asleep until the player walks in) this is pure waste. The S51 shadows-bench perf deep-dive (`docs/research/m21-shadows-bench-perf.md`) measured cascade count + autoUpdate as the dominant shadow-pipeline levers.

A simple global `project.json#render.shadows.autoUpdate: false` exists but it's all-or-nothing: every shadow gets baked once at boot and never updates, including the player's drone shadow. We need a per-entity signal.

Three.js's own API (`directionalLight.shadow.needsUpdate = true` once per frame the caster moved) isn't friendly to an ECS authored from JSON. We want a declarative tag on the entity, not a per-frame imperative call.

## Decision

A new ECS component `ShadowCaster` carries a single field:

```ts
type ShadowCaster = { dynamic: boolean };
```

A new scheduler-registered system `DynamicShadowSystem` (`engine/render/systems/dynamic-shadow-system.ts`):

1. On the first frame after world construction, runs in passthrough mode.
2. Each subsequent frame, walks tagged casters' `LocalToWorld` matrices. The first time it observes any tagged caster's world transform actually change (beyond `EPSILON`), it flips `WebGLRenderer.shadowMap.autoUpdate = false` and takes over.
3. Each subsequent frame, when any tagged caster's `LocalToWorld` changed, calls `WebGLRenderer.shadowMap.needsUpdate = true` for one re-render.
4. Otherwise leaves shadow map untouched — the cost saved is the per-cascade shadow render.

`autoUpdate: true` stays the global default. Opting in requires (a) tagging casters in the scene + (b) letting `DynamicShadowSystem` see a real movement once to confirm the renderer baked the initial shadow correctly.

## Movement-gated takeover (S53 audit-trail)

The S52 ship took over on first call. Result: on first boot, `shadowMap.autoUpdate=false` flipped before three.js had baked any shadow at all into the depth textures. Symptom: "shadows missing at startup, appear only after the drone moves". S53 commit `aa03dea` switched to the current movement-gated takeover. The honest perf claim is now "saves the per-frame shadow pass on movement-then-idle scenes" — the previously-claimed `−37 % renderMs / −85 % drawCalls` on idle beacon-world was a visual regression in disguise (no shadows = no shadow draws).

## Consequences

Pro:

- Declarative + ECS-native. Authors tag entities; the system handles three.js semantics.
- Reversible per-frame: any tagged caster's movement invalidates one frame; no permanent state.
- Doctor surface (`engine doctor` Shadows section) reports `dynamicCasterCount` / `staticCasterCount` so authors notice when nothing is tagged.
- Pairs cleanly with `__agf.renderer.invalidateShadowMap()` for manual overrides.

Con:

- Adds a per-frame query against `ShadowCaster + LocalToWorld`. Negligible for scene sizes we care about.
- The "first movement before takeover" rule means a player who never moves never gets the perf win — by design.

## Validation

- `engine doctor` reports tag counts.
- `tests/unit/dynamic-shadow-system.test.ts` covers the movement-gated takeover, EPSILON gate, and re-init on world swap.
- Material-bench / beacon-world / shadows-bench all tag the moving entities (Spin / Tween / WaypointMover / PlayerControlled drone).

## Alternatives Considered

- **Global autoUpdate flag only.** Loses the dynamic player drone case.
- **Reverse tag (`Static` instead of `Dynamic`).** Default-broken if you forget the tag; current default-on autoUpdate is safer.
- **Tag-but-take-over-on-frame-N.** First implementation; visual regression in disguise (see above).

## Notes

The skill memo `docs/agent/skills/scene-authoring.md` covers authoring; `engine doctor` Shadows section surfaces the runtime state.
