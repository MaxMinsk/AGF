# Skill: system-authoring

## Trigger

Use when creating or changing gameplay systems.

## Workflow

1. Identify component reads and writes.
2. Keep the system independent from renderer, DOM and browser APIs.
3. Return or apply commands through the system context.
4. Add unit tests using a small world fixture.
5. Add integration/playtest coverage if player-visible behavior changes.

## Rules

- Systems should be deterministic for a fixed input and `dt` whenever possible.
- Systems should not own long-lived hidden state unless explicitly modeled.
- Use component schemas for all data a scene can author.

## Verification

- Scheduler order test if order matters.
- Unit test for behavior.
- Browser test only for integration with input/rendering.

