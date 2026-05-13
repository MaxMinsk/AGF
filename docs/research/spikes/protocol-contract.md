# Spike: Protocol Contract

## Goal

Keep TypeScript client and backend message contracts aligned across C#, Node.js or other implementations.

## Proposed Experiment

- Define `input.frame` and `world.snapshot` JSON Schemas.
- Validate messages in TypeScript.
- Investigate C# generation or validation path.
- Keep messages renderer-independent.

## Initial Message Constraints

- Include `type` discriminator.
- Include sequence or tick where relevant.
- Avoid functions/classes.
- Keep payload JSON-compatible for MVP.
- Preserve path for diagnostics.

## Recommendation

Sprint 2 should begin with JSON messages plus schemas. MessagePack/protobuf can wait until raw WebSocket/performance work.
