# Proposal: Procedural Character Generator

Status: Parked — to be picked up after Beacon World gameplay v0 stabilises.

## Goal

Add a standalone tool inside AGF that procedurally generates rigged characters — human, robot, dog, spider, anything in that family — for use as runtime assets in any AGF project. The tool ships rigged meshes ready to be retargeted with Mixamo animations.

The output is an asset that flows through the existing `AssetRegistry` and `GLBLoader` paths; the input is a node-graph the user (or an agent) can drive.

## Why The Tool Lives In The Engine

- AGF is agent-first, and characters are a recurring asset class. A reproducible generator turns "find or commission art" into "describe + tweak + export". An agent can build a Beacon World salvage drone, a hostile spider, an NPC merchant from the same graph.
- Mixamo gives us free animations as long as the rig matches. By emitting a Mixamo-friendly skeleton, the tool sidesteps animation authoring entirely at v0.
- A node-graph editor is the only non-agent-first part. Agents will drive the same graph through JSON. The DOM UI is the human escape hatch, not the primary interface.

## Shape

```
projects/character-generator/        # nested project inside this repo
  ui/                                # node-graph editor (DOM + minimal canvas)
  graph/
    nodes/                           # node implementations (skeleton, limbs, surfaces…)
    types.ts                         # graph schema + serialisable JSON
  emit/
    skeleton.ts                      # builds a Mixamo-compatible armature
    mesh.ts                          # extrudes meshes off the skeleton
    glb-export.ts                    # packs the result into a GLB
  presets/                           # bundled species (humanoid, biped-robot, quadruped, hexaped)
  schemas/character-graph.schema.json
```

A character graph is JSON. The tool consumes the JSON and emits a `.glb`. An agent can write/edit the JSON directly without touching the UI.

## v0 Scope

- Three preset species: `humanoid`, `quadruped`, `spider`.
- Each preset is a fixed-topology skeleton with tweakable proportions (limb lengths, joint counts, body radius).
- Simple parametric mesh extrusion — no detailed surface art, just blocky volumes that fit the rig.
- Mixamo-style joint names so the output retargets cleanly.
- GLB export through `@gltf-transform/core` (new devDep) or a hand-rolled writer in the same style as `scripts/build-cube-glb.mjs`.
- Node-graph UI with about half a dozen node kinds. Drag-and-drop is not required at v0; a JSON-first editor with a graph preview is acceptable.

## Out Of v0

- In-engine skinning runtime for the procedural meshes — that already works through Three.js's built-in `SkinnedMesh`.
- Generating high-poly art, hair, cloth, facial rigs — all later.
- A full library of presets.
- Texture authoring — v0 stays in vertex colours / flat materials. Textures arrive once Beacon World needs them.

## Separate Backlog

This effort gets its own detailed backlog so it doesn't compete with engine sprints. Track it here under `## Stories` once we pick it up. Until then, the engine backlogs (`BACKLOG.md`, `HIGH_LEVEL_BACKLOG.md`) only reference this proposal.

## Open Questions

- Where does the tool actually run? `examples/character-generator/` would keep the layering rule honest; a top-level `tools/character-generator/` is closer to its "part of the engine" status. Decision deferred to when we start.
- Mixamo's terms allow free use, but the animation files themselves cannot be redistributed inside the AGF repo. We'll need a documented authoring workflow that fetches them locally.
- Determinism: an agent should be able to reproduce a character by replaying the same graph + seed. Plan for an explicit `seed` field on the graph.

## Stories (TBD)

Empty for now. When we promote this to active work, expand stories under headings such as Graph format, Preset humanoid, GLB export, Mixamo retargeting check.
