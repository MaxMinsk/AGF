# Prompt Templates

Reusable prompts for agents working in this repo. Keep these short and task-shaped.

## Scene Fix

```text
Inspect the scene diagnostics, fix the smallest invalid project data issue, then run engine check. Do not change runtime code unless the schema is wrong.
```

## New System

```text
Add a gameplay system using ECS data and commands. Define reads/writes, add unit tests, and avoid renderer/browser imports.
```

## Visual Regression

```text
Use the Playwright screenshot/trace artifacts and runtime world snapshot to identify whether the issue is scene data, renderer adapter, camera framing or asset loading.
```

## Backend Contract

```text
Update the protocol schema first, then update TS/C# contract handling. Do not hand-copy divergent message shapes.
```

